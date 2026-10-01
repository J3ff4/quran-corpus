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
import { useHighlights } from '@/mushaf/highlightsContext';
import { mushafLeafFontSize } from '@/mushaf/pageScale';
import { SPREAD_COUNT, spreadAt, spreadFor } from '@/mushaf/spread';
import { useMushafPage } from '@/mushaf/useMushafPage';

import { MushafPage } from './MushafPage';

const PAGES = Array.from(
  { length: MUSHAF_PAGE_MAX - MUSHAF_PAGE_MIN + 1 },
  (_, i) => MUSHAF_PAGE_MIN + i,
);

/** The leaves, for the spread mode's children. Same shape as PAGES and for the
 *  same reason: ViewPager2 pages by child index, so the list has to be stable
 *  and complete even though most of it draws nothing. */
const LEAVES = Array.from({ length: SPREAD_COUNT }, (_, i) => i);

/** How much of MushafPage's width its text block can use, for a leaf deciding
 *  one type size for both of its halves. Must match MushafPage's own
 *  PAGE_MARGIN either side -- a leaf that sizes against a wider box than the
 *  page draws into hands down a size the page then clamps away, which puts the
 *  two halves back on different sizes. */
const PAGE_TEXT_MARGIN = 32;

/** How many pages either side of the current one draw their content.
 *
 *  One, matching the `offscreenPageLimit` below: a swipe has to land on a page
 *  that is already drawn, and anything further is memory spent on pages nobody
 *  is about to see. */
export const WINDOW = 1;

/** The one page a number arriving from outside is allowed to mean.
 *
 *  Range AND integrality: this value reaches a native `Int32` prop, and
 *  `Math.min(Math.max(NaN, 1), 604)` is `NaN`. The route param and the user DB
 *  both hold integers today, so the guard is for the day one of them does not
 *  -- and it is the same guard the focusPage effect below already applies. */
const clampPage = (page: number) =>
  Number.isFinite(page)
    ? Math.min(Math.max(Math.round(page), MUSHAF_PAGE_MIN), MUSHAF_PAGE_MAX)
    : MUSHAF_PAGE_MIN;

export interface MushafPagerProps {
  /** Null until the corpus DB is open; every page then loads its own rows. */
  client: MobileDataClient | null;
  initialPage: number;
  width: number;
  height: number;
  /** Page-agnostic lookups, shared by every mounted page. See MushafPage. */
  ayahTexts: Map<string, string>;
  surahNames: Map<number, string>;
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
  /** Two facing pages per child instead of one, anchored from the right.
   *
   *  Landscape only (ruling R-B2), and decided from the measured box rather
   *  than a window class -- see MushafReader. Off by default, which is portrait
   *  and is not changing in this phase. */
  spread?: boolean;
}

type PageProps = Omit<
  MushafPagerProps,
  'initialPage' | 'onPageChange' | 'focusPage' | 'spread'
> & {
  page: number;
  /** One size for both halves of a leaf. Unset in portrait. */
  fontSize?: number;
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
const PagerPage = memo(function PagerPage({ client, page, ...rest }: PageProps) {
  // Context, not a prop: see HighlightsProvider. A mark change has to reach
  // the pages that draw WITHOUT re-rendering the pager that holds all 604.
  const highlights = useHighlights();
  const { lines } = useMushafPage(client, page);
  return (
    <MushafPage
      page={page}
      lines={lines}
      highlights={highlights}
      {...rest}
    />
  );
});

/** Two facing pages, the recto on the right.
 *
 *  `row-reverse`, not `row`: the mushaf reads right to left, so the recto is
 *  the RIGHT half. A row that lays [recto, verso] out left to right puts the
 *  later page first and reads backwards -- and it looks completely correct in
 *  any assertion made against the page numbers alone.
 *
 *  Memoised for the same reason PagerPage is, and it has to be: a leaf draws
 *  two pages, so what cost three rasterisations in portrait costs six here.
 *  Both halves keep their own hardware layer and their own query, down in
 *  MushafPage and PagerPage respectively -- the layer belongs on the page,
 *  which is what gets blitted during a turn, not on the leaf that holds it.
 */
const MushafLeaf = memo(function MushafLeaf({
  leaf,
  width,
  ...rest
}: Omit<PageProps, 'page' | 'fontSize'> & { leaf: number }) {
  const { recto, verso } = spreadAt(leaf);
  const half = Math.floor(width / 2);
  // One size for both halves, decided here because neither page can see the
  // other. Without it the two pages of a leaf draw at different sizes whenever
  // one of them clamps and the other does not -- see mushafLeafFontSize.
  const fontSize = mushafLeafFontSize(recto, verso, half - PAGE_TEXT_MARGIN);
  return (
    <View testID="mushaf-leaf" style={{ flex: 1, flexDirection: 'row-reverse' }}>
      <PagerPage page={recto} width={half} fontSize={fontSize} {...rest} />
      {verso !== null ? (
        <PagerPage page={verso} width={half} fontSize={fontSize} {...rest} />
      ) : null}
    </View>
  );
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
 *
 * **In landscape the unit is a leaf, not a page** (ruling R-B1). The same pager
 * takes 302 two-page children instead of 604 one-page ones, so Android's own
 * fling -- the thing this component exists for -- is identical in both
 * orientations and there is no second pager and no custom transition (ruling
 * R-B4 dropped the hinge). Everything indexed below is therefore in the
 * current mode's units, and the window of one either side costs six drawn
 * pages here against portrait's three: a narrower window would page onto a
 * cell that draws nothing, and a blank leaf mid-turn is a visible defect where
 * the extra footprint is not (ruling R-X6).
 *
 * **Memoised, and the marks arrive by context.** Because PagerView renders all
 * 604 children on each of its own renders, the pager must not re-render for
 * anything but a page turn or a resize -- so the one prop that changed often,
 * `highlights`, moved to a context the drawn pages read directly (see
 * HighlightsProvider). Every remaining prop is a stable reference from the
 * reader, so `memo` here holds.
 */
export const MushafPager = memo(function MushafPager({
  initialPage,
  onPageChange,
  focusPage = null,
  spread = false,
  ...page
}: MushafPagerProps) {
  const pagerRef = useRef<PagerView | null>(null);
  // The unit this pager pages across: a page in portrait, a leaf of two in
  // landscape. Every index below is in these units -- a leaf index is NOT a
  // page number, and mixing them lands the reader 300 pages away.
  const mode = spread ? 'spread' : 'single';
  const indexOf = (page: number) => (spread ? spreadFor(page).index : page - MUSHAF_PAGE_MIN);
  // Which pages draw. Separate from `settled` because it drives rendering and
  // therefore has to be state, where the settle guard must NOT re-render.
  const [current, setCurrent] = useState(() => indexOf(clampPage(initialPage)));
  // The page the reader is on, as far as the caller has been told. Android
  // fires onPageSelected once on mount with the initial page, and `setPage`
  // below lands through the same event, so the caller is told only when the
  // page actually differs from what it was last told.
  //
  // Seeded with the leaf's RECTO in spread mode, not the page asked for: a leaf
  // is identified by its recto (ruling R-B3), so opening on page 4 settles on
  // leaf (3,4) and reports 3. Seeding with 4 would make Android's own
  // mount-time onPageSelected look like a turn and write a position the reader
  // never moved to.
  const settled = useRef(spread ? spreadFor(clampPage(initialPage)).recto : clampPage(initialPage));

  const onPageSelected = useCallback(
    (event: { nativeEvent: { position: number } }) => {
      const index = event.nativeEvent.position;
      setCurrent(index);
      // The recto, because the caller stores a single page number and a leaf
      // has two. Which half the reader's eye is on is not something the pager
      // knows, and the recto is the stable identity of the paper.
      const page = spread ? spreadAt(index).recto : index + MUSHAF_PAGE_MIN;
      if (page === settled.current) return;
      settled.current = page;
      onPageChange(page);
    },
    [onPageChange, spread],
  );

  useEffect(() => {
    // Nothing to do when the reciter is already on this page -- and a turn to
    // the page under the reader's finger would fight the swipe.
    if (focusPage === null || focusPage === settled.current) return;
    if (!Number.isInteger(focusPage) || focusPage < MUSHAF_PAGE_MIN || focusPage > MUSHAF_PAGE_MAX) return;
    // On a spread, a leaf is the unit. Playback crossing from the recto onto
    // the verso is a page change the reader can already SEE -- both halves are
    // on screen -- so turning there would flip the leaf away from the ayah
    // being recited on it. Compared here, in the effect body, and not in a
    // cleanup: a cleanup cannot see the new value, which has already broken
    // mushaf Play once.
    if (spread && spreadFor(focusPage).index === spreadFor(settled.current).index) return;
    // settled is deliberately NOT written here: this turn ends in an
    // onPageSelected like any other, and that is what reports it to the
    // caller. Writing it would turn an auto-turn into a page the reading
    // position never records.
    pagerRef.current?.setPage(indexOf(focusPage));
  }, [focusPage, spread]);

  return (
    <PagerView
      // Remounted on a mode flip, because the child COUNT changes under it:
      // 604 pages become 302 leaves. ViewPager2 holds its children by index, so
      // a live pager handed a different-length list is the same hazard as a
      // FlatList handed a new numColumns -- it keeps its old position and lands
      // on the wrong leaf, or on one that draws nothing.
      key={mode}
      ref={pagerRef}
      testID="mushaf-pager"
      style={{ flex: 1 }}
      initialPage={indexOf(clampPage(initialPage))}
      layoutDirection="rtl"
      offscreenPageLimit={WINDOW}
      onPageSelected={onPageSelected}
      // No stretch past page 1 or 604: the mushaf has no cover to pull open,
      // and the rubber-band reads as a page that failed to turn. NOT
      // `overdrag={false}` -- that prop's Android setter is a bare `return` in
      // 8.0.2 (iOS only), so it reads as the fix while doing nothing.
      overScrollMode="never"
    >
      {/* Sized and flattening-proofed by the pager itself: PagerView wraps
          every child in its own `collapsable={false}` View and appends
          `StyleSheet.absoluteFill` to the child's style, so a width/height
          here would be overridden and a collapsable here would guard a view
          ViewPager2 never indexes. */}
      {spread
        ? LEAVES.map((leaf) => (
            <View key={leaf}>
              {Math.abs(leaf - current) <= WINDOW ? (
                <MushafLeaf leaf={leaf} {...page} />
              ) : null}
            </View>
          ))
        : PAGES.map((item) => (
            <View key={item}>
              {Math.abs(indexOf(item) - current) <= WINDOW ? (
                <PagerPage page={item} {...page} />
              ) : null}
            </View>
          ))}
    </PagerView>
  );
});
