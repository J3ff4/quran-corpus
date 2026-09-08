import { useCallback, useRef } from 'react';
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
  onWordPress: (word: MushafWord) => void;
}

type PageProps = Omit<MushafPagerProps, 'initialPage' | 'onPageChange'> & { page: number };

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
export function MushafPager({ initialPage, onPageChange, ...page }: MushafPagerProps) {
  const { width } = page;
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

  return (
    <FlatList
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
      removeClippedSubviews
      onMomentumScrollEnd={onMomentumScrollEnd}
      renderItem={({ item }) => <PagerPage page={item} {...page} />}
    />
  );
}
