import { useCallback, useEffect, useRef } from 'react';
import { FlatList } from 'react-native';
import {
  MUSHAF_PAGE_MAX,
  MUSHAF_PAGE_MIN,
  type MushafWord,
} from '@quran-corpus/data/mobile';
import type { MobileDataClient } from '@quran-corpus/mobile-data';

import type { UiLocaleCode } from '@/i18n/languages';
import type { HighlightInput } from '@/mushaf/highlights';
import { useMushafPage } from '@/mushaf/useMushafPage';

import { MushafPage } from './MushafPage';

const PAGES = Array.from(
  { length: MUSHAF_PAGE_MAX - MUSHAF_PAGE_MIN + 1 },
  (_, i) => MUSHAF_PAGE_MIN + i,
);

export interface MushafPagerProps {
  /** Null until the corpus DB is open; every page then loads its own rows. */
  client: MobileDataClient | null;
  initialPage: number;
  width: number;
  height: number;
  highlights: HighlightInput;
  /** Page-agnostic lookups, shared by every mounted page. See MushafPage. */
  ayahTexts: Map<string, string>;
  surahNames: Map<number, string>;
  juzByPage: Map<number, number>;
  uiLocale: UiLocaleCode;
  /** Fired once per settled page turn -- this is the write point for the
   *  durable reading position. */
  onPageChange: (page: number) => void;
  /** A page the reader has to be shown without having swiped to it: the one
   *  carrying the ayah being recited (ruling 19). Null leaves the pager alone.
   *  The turn it causes still settles, so the page it lands on is reported
   *  through onPageChange like any other. */
  focusPage?: number | null;
  onWordLongPress: (word: MushafWord) => void;
  /** A tap on any page. Toggles the chrome (ruling 3). */
  onTap: () => void;
}

type PageProps = Omit<MushafPagerProps, 'initialPage' | 'onPageChange' | 'focusPage'> & {
  page: number;
};

/** One page in the pager, holding its own query.
 *
 *  Per page rather than per pager: the list keeps three pages mounted, so
 *  three queries are live at a time and a swipe lands on rows that are already
 *  there. A single query in the pager would refetch on every turn and blank
 *  the page it is turning to.
 */
function PagerPage({ client, page, juzByPage, ...rest }: PageProps) {
  const { lines } = useMushafPage(client, page);
  return <MushafPage page={page} lines={lines} juz={juzByPage.get(page) ?? 0} {...rest} />;
}

/**
 * The mushaf, all 604 pages of it, turning right to left.
 *
 * `inverted` rather than `I18nManager.forceRTL`: forcing RTL flips every
 * screen in the app, and the UI locale is a user setting independent of the
 * mushaf's own reading direction.
 *
 * Every mounted page registers a ~200 KB font that `expo-font` never unloads,
 * so the window is deliberately narrow: one page either side is enough for a
 * swipe to land on a rendered page, and more is memory spent on pages nobody
 * is about to see.
 */
export function MushafPager({
  initialPage,
  onPageChange,
  focusPage = null,
  ...page
}: MushafPagerProps) {
  const { width } = page;
  const listRef = useRef<FlatList<number> | null>(null);
  // The page the reader is on, as far as the caller has been told. A settle
  // event fires at the end of every paging scroll, including one that ended
  // where it started (a short drag that snapped back), and the caller writes
  // the user DB on each one.
  const settled = useRef(initialPage);

  const onMomentumScrollEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / width) + 1;
      if (page === settled.current) return;
      settled.current = page;
      onPageChange(page);
    },
    [width, onPageChange],
  );

  useEffect(() => {
    // Nothing to do when the reciter is already on this page -- and a scroll
    // to the page under the reader's finger would fight the swipe.
    if (focusPage === null || focusPage === settled.current) return;
    if (!Number.isInteger(focusPage) || focusPage < MUSHAF_PAGE_MIN || focusPage > MUSHAF_PAGE_MAX) return;
    // settled is deliberately NOT written here: this scroll ends in a settle
    // event like any other, and that is what reports the turn to the caller.
    // Writing it would turn an auto-turn into a page the reading position
    // never records.
    listRef.current?.scrollToIndex({ index: focusPage - 1, animated: true });
  }, [focusPage]);

  return (
    <FlatList
      ref={listRef}
      testID="mushaf-pager"
      data={PAGES}
      keyExtractor={(item) => String(item)}
      horizontal
      inverted
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={Math.min(Math.max(initialPage, MUSHAF_PAGE_MIN), MUSHAF_PAGE_MAX) - 1}
      // Exact, because every page is the screen's width: the list can jump
      // straight to the opening page instead of measuring its way there.
      getItemLayout={(_data: unknown, index: number) => ({ length: width, offset: width * index, index })}
      windowSize={3}
      maxToRenderPerBatch={1}
      initialNumToRender={1}
      // Android's default paging deceleration drifts for a beat after the
      // finger leaves, which reads as the page arriving late. `fast` is what a
      // native pager does.
      decelerationRate="fast"
      // NOT removeClippedSubviews. With a window of three there is nothing to
      // save -- one page either side is already all that is mounted -- and on
      // Android it is a known source of blank and half-drawn cells on a
      // horizontal list, which is the one artefact this pager cannot afford.
      onMomentumScrollEnd={onMomentumScrollEnd}
      renderItem={({ item }) => <PagerPage page={item} {...page} />}
    />
  );
}
