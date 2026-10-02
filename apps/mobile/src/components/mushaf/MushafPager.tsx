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
import { MUSHAF_PAGE_TEXT_INSET, mushafLeafFontSize } from '@/mushaf/pageScale';
import { SPREAD_COUNT, spreadAt, spreadFor } from '@/mushaf/spread';
import { useMushafPageFont } from '@/mushaf/pageFont';
import { useMushafPage } from '@/mushaf/useMushafPage';
import { useThemeColors } from '@/theme/themeContext';

import { MushafPage } from './MushafPage';

const PAGES = Array.from(
  { length: MUSHAF_PAGE_MAX - MUSHAF_PAGE_MIN + 1 },
  (_, i) => MUSHAF_PAGE_MIN + i,
);

/** The leaves, for the spread mode's children. Same shape as PAGES and for the
 *  same reason: ViewPager2 pages by child index, so the list has to be stable
 *  and complete even though most of it draws nothing. */
const LEAVES = Array.from({ length: SPREAD_COUNT }, (_, i) => i);

/** How many pages either side of the current one draw their content.
 *
 *  One, matching the `offscreenPageLimit` below: a swipe has to land on a page
 *  that is already drawn, and anything further is memory spent on pages nobody
 *  is about to see. In spread mode the unit is a leaf, so one either side is six
 *  drawn pages rather than three -- see the component docstring. */
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
  height,
  ...rest
}: Omit<PageProps, 'page' | 'fontSize'> & { leaf: number }) {
  const theme = useThemeColors();
  const { recto, verso } = spreadAt(leaf);
  const half = Math.floor(width / 2);
  // Both halves, or neither. Each page gates its own glyphs on its own QCF
  // font and the two TTFs register independently, so a leaf reached before
  // both have arrived draws text on one half and blank paper on the other --
  // which reads as a broken page rather than as a page still loading. The
  // reader's own readiness signal cannot cover this: it watches `initialPage`,
  // which is one of the two.
  //
  // SETTLED, not ready: a font that will never load must not hold its facing
  // page for ever. Each page then draws, or draws its own blank, as before.
  const rectoFont = useMushafPageFont(recto);
  // A verso is null only past the end of the book, which 604 pages never
  // reach; the recto stands in so the hook count cannot change under React.
  const versoFont = useMushafPageFont(verso ?? recto);
  const paired = fontSettled(rectoFont) && fontSettled(versoFont);
  // One size for both halves, decided here because neither page can see the
  // other. Without it the two pages of a leaf draw at different sizes whenever
  // one of them clamps and the other does not -- see mushafLeafFontSize.
  // The shared inset, not a 32 restated here: a leaf that sizes against a wider
  // box than the page draws into hands down a size the page then clamps away,
  // which puts the two halves back on different sizes.
  const fontSize = mushafLeafFontSize(recto, verso, half - MUSHAF_PAGE_TEXT_INSET);
  if (!paired) {
    return (
      <View
        testID="mushaf-leaf"
        style={{ width, height, backgroundColor: theme.background }}
      />
    );
  }
  return (
    <View testID="mushaf-leaf" style={{ flex: 1, flexDirection: 'row-reverse' }}>
      <PagerPage page={recto} width={half} height={height} fontSize={fontSize} {...rest} />
      {verso !== null ? (
        <PagerPage page={verso} width={half} height={height} fontSize={fontSize} {...rest} />
      ) : null}
    </View>
  );
});

/** A font that has either arrived or failed. A failure is as final as a
 *  success for the purpose of deciding whether to wait for it. */
function fontSettled(font: { ready: boolean; error: Error | null }): boolean {
  return font.ready || font.error !== null;
}

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
  // Held in a ref so nothing below depends on this callback's IDENTITY.
  // MushafScreen re-renders on every audio position tick, and an identity that
  // changes with it re-ran the auto-turn effect on every tick while a turn was
  // still in flight: ViewPager2.setCurrentItem(sameIndex, smoothScroll) mid
  // scroll re-animates from wherever the page has got to, so the turn fought
  // itself and crawled. It also kept onPageSelected unstable, which handed
  // PagerView a new prop per tick -- and PagerView re-renders all 604 children
  // on any prop change.
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  // The unit this pager pages across: a page in portrait, a leaf of two in
  // landscape. Every index below is in these units -- a leaf index is NOT a
  // page number, and mixing them lands the reader 300 pages away.
  const mode = spread ? 'spread' : 'single';
  const indexOf = (page: number) => (spread ? spreadFor(page).index : page - MUSHAF_PAGE_MIN);
  // Which pages draw. Separate from `settled` because it drives rendering and
  // therefore has to be state, where the settle guard must NOT re-render.
  // Tagged with the mode it was measured in. A leaf index and a page index are
  // different units, and MushafPager itself does NOT remount on a flip -- only
  // the PagerView below it does, through `key` -- so an untagged `current` would
  // survive the flip holding the old unit's number. Portrait page 106 is index
  // 105; as a leaf index that is leaf 105, pages 211-212, so the drawn window
  // would sit 100 leaves from the leaf on screen and the reader would rotate
  // onto blank paper.
  const [current, setCurrent] = useState(() => ({
    mode,
    index: indexOf(clampPage(initialPage)),
  }));
  // The page the reader is on, as far as the caller has been told. Android
  // fires onPageSelected once on mount with the initial page, and `setPage`
  // below lands through the same event, so the caller is told only when the
  // page actually differs from what it was last told.
  //
  // The page, in both modes -- NOT narrowed to the leaf's recto in spread mode.
  // A leaf is identified by its recto (ruling R-B3), but the reader's place is a
  // page, and the owner ruled 2026-10-02 that a rotation keeps the verso. Seeded
  // with the recto, opening the mushaf on a stored page 128 landed correctly on
  // leaf (127,128) and then rotated to portrait on **127**: the verso half was
  // dropped at mount, so the flip had nothing to go back to. Measured on the
  // tablet, vc83.
  //
  // Safe because the arrival that follows is caught by the leaf guard in
  // onPageSelected, not by this value: Android fires onPageSelected once at
  // mount naming the recto, and that guard sees `settled` already on the
  // arriving leaf and reports nothing. Seeding the page therefore cannot look
  // like a turn the reader never made.
  const settled = useRef(clampPage(initialPage));

  // Re-derived during the flip's own render rather than in an effect: the
  // PagerView below remounts on the same render, and an effect would leave one
  // committed frame drawing the wrong leaf.
  if (current.mode !== mode) setCurrent({ mode, index: indexOf(settled.current) });

  // Whether the pager is moving because something asked it to -- a finger on
  // the glass, or our own `setPage` below. False means the only thing that has
  // happened to this pager is a relayout, and a position report arriving then
  // is not a page turn. See onPageSelected.
  const turning = useRef(false);

  const onPageScrollStateChanged = useCallback(
    (event: { nativeEvent: { pageScrollState: 'idle' | 'dragging' | 'settling' } }) => {
      // Latched on movement and cleared when the pager comes to rest. The
      // clear matters as much as the set: a drag the reader abandons -- partway
      // across, then released -- settles back onto the SAME page, and
      // ViewPager2 announces nothing because nothing arrived. Without this the
      // flag would stay raised, and the next relayout's bogus position would be
      // read as that abandoned gesture finally landing.
      turning.current = event.nativeEvent.pageScrollState !== 'idle';
    },
    [],
  );

  const onPageSelected = useCallback(
    (event: { nativeEvent: { position: number } }) => {
      const index = event.nativeEvent.position;
      // The position comes from native, and #107 below is the standing proof
      // that ViewPager2 reports positions nobody asked for. An impossible one is
      // treated exactly like that artifact -- put the pager back, report nothing
      // -- rather than reaching spreadAt, which raises a RangeError from inside
      // a native event handler, or, in single mode, quietly recording page 0 as
      // the reader's position on their phone.
      if (!Number.isInteger(index) || index < 0 || index >= (spread ? LEAVES : PAGES).length) {
        turning.current = false;
        pagerRef.current?.setPageWithoutAnimation(indexOf(settled.current));
        return;
      }
      // A relayout moves the pager, and ViewPager2 reports the move as a turn.
      //
      // Measured on device (2026-10-01, issue #107): resizing this pager --
      // which every rotation does, and which multi-window does without any
      // rotation at all -- makes ViewPager2 re-derive its scroll offset and land
      // ONE INDEX SHORT under `layoutDirection="rtl"`, then announce it through
      // onPageSelected like any other arrival. The event trace is what separates
      // the two: a finger goes `dragging, settling, selected, idle`, while a
      // relayout emits a bare `selected` with the state never leaving idle.
      //
      // That one spurious index is the whole of #107. Rotating off page 561 wrote
      // `settled = 560`, and the flip below then correctly asked for the leaf
      // holding 560 -- recto 559 -- so the reader arrived a leaf early. The
      // algebra was never wrong; its input was.
      //
      // The pager really has moved, so the report cannot merely be dropped: put
      // it back where the reader was. That re-assertion lands through this same
      // handler with `index === indexOf(settled.current)`, which is the mount
      // case below and reports nothing, so it cannot recur.
      const moved = turning.current;
      turning.current = false;
      if (!moved && index !== indexOf(settled.current)) {
        pagerRef.current?.setPageWithoutAnimation(indexOf(settled.current));
        return;
      }
      // Compared field by field, not handed over as a fresh object: `current`
      // is an object only because it carries the mode tag, and a new one on
      // every arrival means React can never bail out -- so the mount
      // announcement and each bounce re-assertion above would re-render this
      // pager, rebuild its 302- or 604-element child array, and hand PagerView
      // a new children prop, which re-renders every one of them. The docstring's
      // "must not re-render for anything but a page turn or a resize" is load
      // bearing: it is what keeps a swipe off the glyph-atlas thrash.
      setCurrent((prev) => (prev.mode === mode && prev.index === index ? prev : { mode, index }));
      // The recto, because the caller stores a single page number and a leaf
      // has two. Which half the reader's eye is on is not something the pager
      // knows, and the recto is the stable identity of the paper.
      const page = spread ? spreadAt(index).recto : index + MUSHAF_PAGE_MIN;
      if (page === settled.current) return;
      // Already on this leaf, by its other half. Android fires onPageSelected
      // once on mount and the flip above remounts the pager, so rotating off
      // page 4 arrives here with position 1, whose recto is 3. Reporting it
      // would rewrite the saved reading position to the facing page -- and
      // rotating back would land on 3, not the page the reader was reading.
      // Nothing turned, so there is nothing to report.
      if (spread && spreadFor(settled.current).index === index) return;
      settled.current = page;
      onPageChangeRef.current(page);
    },
    [spread, mode],
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
    if (spread) {
      // Read before the write below, which is also what the arrival's leaf guard
      // reads back.
      const sameLeaf = spreadFor(focusPage).index === spreadFor(settled.current).index;
      // The caller asked for a PAGE. This pager turns LEAVES, and a leaf can
      // only ever report its recto (ruling R-B3), so page 128's arrival says
      // 127 -- and 58 of 114 surahs first appear on an even page, as do nearly
      // all the juz. Left to the arrival, every jump to one of those would be
      // answered with the facing page: the strip would name it, Play would
      // recite its first ayah, and the position row on the reader's phone would
      // persist it. So the page itself is reported here, for the turn as much as
      // for the refusal; the arrival then finds `settled` already on this leaf
      // and stays quiet.
      settled.current = focusPage;
      onPageChangeRef.current(focusPage);
      // Both halves are already on screen, so there is nothing to turn -- and
      // turning would flip the leaf away from the ayah being recited on it. The
      // report above is owed either way: at a surah seam inside a leaf (page 106
      // finishes surah 4 and prints 5:1 below it) a request that is silently
      // dropped leaves the caller waiting for an arrival that never comes, and
      // the recitation stops where portrait carries on.
      if (sameLeaf) return;
    }
    // In single mode settled is deliberately NOT written here: the turn ends in
    // an onPageSelected carrying the page itself, and that is what reports it to
    // the caller. Writing it without reporting would turn an auto-turn into a
    // page the reading position never records. A spread cannot wait for that
    // arrival, for the reason just above.
    //
    // Marked as a commanded move BEFORE the command, so the arrival is read as
    // a turn and not as the relayout artifact above. Set here rather than left
    // to Android's own `settling`: a turn we asked for is legitimate whatever
    // states the platform chooses to emit on the way, and an auto-turn that the
    // guard bounced back would strand playback on the page it started from.
    turning.current = true;
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
      // Where the reader IS, not where they opened. `initialPage` is read at
      // mount, and the flip above remounts this pager -- so the prop's original
      // value would drag a reader on page 300 back to the page they launched on
      // every time they rotated the tablet.
      initialPage={indexOf(settled.current)}
      layoutDirection="rtl"
      offscreenPageLimit={WINDOW}
      onPageSelected={onPageSelected}
      // Not telemetry: this is what tells onPageSelected whether the arrival it
      // is about to be handed came from a gesture or from a relayout.
      onPageScrollStateChanged={onPageScrollStateChanged}
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
              {Math.abs(leaf - current.index) <= WINDOW ? (
                <MushafLeaf leaf={leaf} {...page} />
              ) : null}
            </View>
          ))
        : PAGES.map((item) => (
            <View key={item}>
              {Math.abs(indexOf(item) - current.index) <= WINDOW ? (
                <PagerPage page={item} {...page} />
              ) : null}
            </View>
          ))}
    </PagerView>
  );
});
