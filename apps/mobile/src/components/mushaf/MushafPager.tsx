import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import PagerView from 'react-native-pager-view';
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

/** How many pages either side of the current one draw their content.
 *
 *  One, matching the `offscreenPageLimit` below: a swipe has to land on a page
 *  that is already drawn, and anything further is memory spent on pages nobody
 *  is about to see. */
export const WINDOW = 1;

/** Clamps a page arriving from a route param or the user DB. */
const clampPage = (page: number) =>
  Math.min(Math.max(page, MUSHAF_PAGE_MIN), MUSHAF_PAGE_MAX);

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
 *  Memoised, and every prop it takes is a stable reference from the reader.
 *  Without it a chrome toggle -- one boolean, two levels up -- re-rendered all
 *  three mounted pages, and a page render invalidates the hardware layer the
 *  page is now held in, so the bar's own 220ms slide was competing with three
 *  full page rasterisations. Measured on device (2026-09-10): the toggle's
 *  frames ran at a 17ms median against an 11ms budget until this landed.
 *
 *  Per page rather than per pager: three pages are drawn at a time, so three
 *  queries are live and a swipe lands on rows that are already there. A single
 *  query in the pager would refetch on every turn and blank the page it is
 *  turning to.
 */
const PagerPage = memo(function PagerPage({ client, page, juzByPage, ...rest }: PageProps) {
  const { lines } = useMushafPage(client, page);
  return <MushafPage page={page} lines={lines} juz={juzByPage.get(page) ?? 0} {...rest} />;
});

/**
 * The mushaf, all 604 pages of it, turning right to left.
 *
 * **A native ViewPager2, not a FlatList** (owner, 2026-09-11). The list turned
 * pages through `pagingEnabled`, which on Android does not snap from where the
 * finger stopped: `ReactScrollView.flingAndSnap()` predicts where the fling
 * would have ended, using `decelerationRate` as the friction, and snaps to the
 * nearest page boundary of that *predicted* point. At `fast` the prediction is
 * short, so a flick that clearly meant "next page" was predicted to land short
 * of halfway and snapped back -- "i have to slide more to get to next page" --
 * and a drag that did cross arrived with no ease-out at all. Both are the same
 * missing thing: a real pager's own gesture threshold and settle curve, which
 * a ScrollView does not expose at any value of `decelerationRate`.
 *
 * `layoutDirection="rtl"` replaces the list's `inverted`, and for the same
 * reason it was not `I18nManager.forceRTL`: forcing RTL flips every screen in
 * the app, and the UI locale is a user setting independent of the mushaf's own
 * reading direction.
 *
 * **The window is ours now.** A FlatList virtualizes; PagerView does not --
 * every child handed to it is rendered. 604 children each holding their own
 * query would be 604 live queries, and every drawn page registers a ~200 KB
 * font that `expo-font` never unloads. So all 604 cells exist (ViewPager2
 * needs a stable child list to page across) but only those within WINDOW of
 * the current page draw anything; the rest are empty, correctly-sized views.
 * That keeps exactly the three-page footprint the list's `windowSize` gave.
 */
export function MushafPager({
  initialPage,
  onPageChange,
  focusPage = null,
  ...page
}: MushafPagerProps) {
  const { width, height } = page;
  const pagerRef = useRef<PagerView | null>(null);
  // Which pages draw. Separate from `settled` because it drives rendering and
  // therefore has to be state, where the settle guard must NOT re-render.
  const [current, setCurrent] = useState(() => clampPage(initialPage));
  // The page the reader is on, as far as the caller has been told. Android
  // fires onPageSelected once on mount with the initial page, and `setPage`
  // below lands through the same event, so the caller is told only when the
  // page actually differs from what it was last told.
  const settled = useRef(clampPage(initialPage));

  const onPageSelected = useCallback(
    (event: { nativeEvent: { position: number } }) => {
      const page = event.nativeEvent.position + 1;
      setCurrent(page);
      if (page === settled.current) return;
      settled.current = page;
      onPageChange(page);
    },
    [onPageChange],
  );

  useEffect(() => {
    // Nothing to do when the reciter is already on this page -- and a turn to
    // the page under the reader's finger would fight the swipe.
    if (focusPage === null || focusPage === settled.current) return;
    if (!Number.isInteger(focusPage) || focusPage < MUSHAF_PAGE_MIN || focusPage > MUSHAF_PAGE_MAX) return;
    // settled is deliberately NOT written here: this turn ends in an
    // onPageSelected like any other, and that is what reports it to the
    // caller. Writing it would turn an auto-turn into a page the reading
    // position never records.
    pagerRef.current?.setPage(focusPage - 1);
  }, [focusPage]);

  return (
    <PagerView
      ref={pagerRef}
      testID="mushaf-pager"
      style={{ flex: 1 }}
      initialPage={clampPage(initialPage) - 1}
      layoutDirection="rtl"
      offscreenPageLimit={WINDOW}
      onPageSelected={onPageSelected}
      // No overdrag past page 1 or 604: the mushaf has no cover to pull open,
      // and the rubber-band reads as a page that failed to turn.
      overdrag={false}
    >
      {PAGES.map((item) => (
        // collapsable={false} because an empty View outside the window is
        // exactly what Android's view flattening removes -- and ViewPager2
        // pages by child index, so a removed child shifts every page after it.
        <View key={item} collapsable={false} style={{ width, height }}>
          {Math.abs(item - current) <= WINDOW ? <PagerPage page={item} {...page} /> : null}
        </View>
      ))}
    </PagerView>
  );
}
