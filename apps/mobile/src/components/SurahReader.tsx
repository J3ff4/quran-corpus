import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type CellRendererProps,
  type ViewToken,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { reciterById, splitBasmala, type Word } from '@quran-corpus/data/mobile';
import type { MobileDataClient } from '@quran-corpus/mobile-data';
import type { ReaderAyah, SurahReaderData, WordSummary } from '@/data/corpusRepository';
import { getReaderPosition, setReaderPosition } from '@/data/readerPosition';
import type { ContentLanguageCode, UiLocaleCode } from '@/i18n/languages';
import type { ReaderMode } from '@/settings/settingsStore';

import { AyahCard } from './AyahCard';
import type { MushafWord } from '@quran-corpus/data/mobile';
import { MushafReader } from './mushaf/MushafReader';
import { useMushafIndex } from '@/mushaf/mushafReaderData';
import { ayahKey } from '@/mushaf/highlights';
import { RecitationBar, type RecitationBarProps } from './RecitationBar';
import { ReaderHeader } from './ReaderHeader';
import { Bismillah } from './Bismillah';
import { LanguageSheet } from './LanguageSheet';
import { ReciterSheet } from './ReciterSheet';
import { AyahControls } from './AyahControls';
import { WordSheet } from './WordSheet';
import { GlassSurface } from './GlassSurface';
import { estimateRowHeight } from './rowHeightModel';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { t } from '@/i18n/uiStrings';
import { fonts, typography } from '@/theme/tokens';
import { useArabicSizes } from '@/theme/useArabicSizes';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

/** Everything the docked bar needs that the ayah cards do not.
 *
 *  One prop rather than nine: the reader forwards these untouched, and nine
 *  pass-throughs on a component that already takes seventeen is a wall nobody
 *  reads. `ayahNumber` is not among them -- the bar docks on the last ayah
 *  played, which is the reader's own state (see `dockedAyah`). */
export type ReaderRecitation = Omit<
  RecitationBarProps,
  'ayahNumber' | 'playing' | 'onTogglePlay' | 'uiLocale' | 'reciterLabel' | 'onOpenReciters'
> & {
  /** A `Reciter.id`. The label and the picker are both derived from it here,
   *  so the screen above passes one value instead of three. */
  reciterId: string;
  onChangeReciter: (id: string) => void;
};

interface SurahReaderProps {
  data: SurahReaderData;
  bookmarkedAyahs: Set<number>;
  /** ayah number -> its note, for the ayahs that carry one. Separate from
   *  bookmarkedAyahs rather than replacing it: a bookmark with no note is the
   *  common case, and folding the two would make every existing caller build a
   *  map to say nothing. */
  notesByAyah?: Map<number, string | null>;
  playingAyah: number | null;
  audioEnabled: boolean;
  recitation: ReaderRecitation;
  uiLocale: UiLocaleCode;
  /** The reader owns no settings state; the screen above it does. Passed down
   *  rather than read from the store so this component stays renderable in a
   *  test without the store's expo-sqlite import. */
  contentLanguage: ContentLanguageCode;
  onChangeContentLanguage: (code: ContentLanguageCode) => void;
  /** Which rendering the ayahs get. Owned by the screen above for the same
   *  reason contentLanguage is: it is a persisted setting, and reading it here
   *  would drag the settings store's expo-sqlite import into every test that
   *  renders a reader. */
  readerMode: ReaderMode;
  onChangeReaderMode: (mode: ReaderMode) => void;
  /** Whether the cards draw their translation. Owned by the screen above for
   *  the same reason readerMode is: it is a persisted setting. */
  showTranslation?: boolean;
  onChangeShowTranslation?: (show: boolean) => void;
  /** Ayah to open at, from a bookmark or the saved reading position. */
  initialAyahNumber?: number | null;
  /** Omitted leaves the reader as a plain mushaf: every ayah renders its full
   *  Uthmani text, with no tap targets. */
  loadWords?: (ayahId: number) => Promise<Word[]>;
  loadWordSummary?: (word: Word) => Promise<WordSummary>;
  onToggleBookmark: (ayahNumber: number) => void;
  onEditNote?: (ayahNumber: number) => void;
  onToggleAudio: (ayahNumber: number) => void;
  onReadingAyah?: (ayahNumber: number) => void;
  /** A mushaf page turn. Carries its own surah and ayah -- the page the reader
   *  turned to need not belong to the surah the route named (ruling 10), so
   *  the caller must not pair this page with the screen's surah. */
  onReadingPage?: (position: { surahId: number; ayahNumber: number; page: number }) => void;
  /** The open corpus database, for the mushaf's page index and the ayah rows
   *  of surahs the reader was not opened on. Null renders the reader with no
   *  mushaf pages, which is what a test that never opens a database wants. */
  corpusClient?: MobileDataClient | null;
  /** Forwarded to the header's surah chevrons. Omitted draws none. */
  prevSurahId?: number | null;
  nextSurahId?: number | null;
  onPageSurah?: (surahId: number, side: 'prev' | 'next') => void;
}

// Ayah cards are variable height (Arabic runs wrap differently per ayah), so
// FlatList cannot scroll to a row it has not measured without being told where
// the rows are. Two halves make a deep-link landing exact instead of
// approximate: getItemLayout hands it a fitted model of every row's height, so
// the target can be jumped to without laying out the ones above it; and the
// list stays hidden until the scroll lands, so no attempt is ever seen as
// motion.
//
// The recovery this replaces jumped to averageItemLength * index -- an average
// taken over the short cards near the top, so it landed short, retried from
// there and kept wherever the fifth try left it. On the owner's device
// (2026-08-23) 16:90 landed on 16:49, and every jump on the way fired
// onViewableItemsChanged, writing an ayah the reader never saw into the saved
// reading position.
//
// Three passes, not twenty-five. The old loop was blind: it re-scrolled and
// asked whether the content height had stopped changing, because it had no way
// to see where the target actually was, and every attempt jumped to an offset
// summed over cards that were still laying out (owner device, 2026-08-23: 6:87
// opened two cards below the top from a concordance row).
//
// Now getItemLayout puts the target in the render window on the first jump, and
// the row's own laid-out y says where it really is. So a pass either moves the
// row or proves it settled -- and the model's error, worst measured at 512dp,
// is corrected against a real measurement rather than ground down by retries.
const MAX_LANDING_PASSES = 3;
const SCROLL_RETRY_DELAY_MS = 100;
// The budget for a row that never reports at all. Separate from the pass cap
// because the two failures are different: the cap bounds how many times we
// correct, this bounds how long we wait for the first measurement. Folding
// them into one counter spent the whole budget waiting -- a row 281 deep does
// not lay out within three 100ms ticks, so every landing corrected once and
// revealed in the same tick, and the settle test never ran (owner device,
// 2026-09-07: 16:90 landed with 200dp of ayah 89 still above it).
//
// Eight seconds because it has to clear a cold start, not a warm one. Measured
// on the owner's device with the deadline off (2026-09-07, /surah/2?ayah=282):
// the target row's first layout arrives at t=3697ms cold against t=421ms warm.
// At 2000ms the deadline fired before any measurement existed, so the reader
// revealed on the raw model estimate -- 2:282 came up 130dp high, with the tail
// of 2:281 above it. Nothing waits this long in practice: both modes settle one
// pass after the first measurement.
const LANDING_DEADLINE_MS = 8000;
// React Native's own default, restated so a bare 10 in the JSX does not read as
// a number someone chose. Nothing overrides it any more: a deep link used to
// widen the window to initialIndex + 1, because FlatList cannot scroll to a row
// it has never rendered *unless* it has a getItemLayout. It has one now.
const DEFAULT_INITIAL_RENDER = 10;

// Ayahs fetched ahead of the one scrolling into view. The whole-surah fetch is
// deliberately not restored -- corpusRepository.ts records why (6,116 word rows
// for al-Baqarah). Per-ayah with a lookahead keeps every query bounded and, on
// a local SQLite file, lands before the ayah reaches the middle of the screen.
const WORD_LOOKAHEAD = 3;

// The nav title's fade, in dp of scroll. It finishes just before the list
// header's last pixel leaves, so the name has arrived by the time the heading
// it replaces is gone rather than starting from nothing at that moment.
const TITLE_FADE_END = 4;
const TITLE_FADE_DISTANCE = 40;
// How far the name rises as it fades. Small enough to read as the same word
// settling into the bar, not as a second element flying in.
const TITLE_RISE = 10;

// Extra room under the last ayah while the recitation bar is docked.
//
// useListBottomPadding clears the floating tab pill, which this stack screen
// does not have -- but the bar is two rows where the pill is one, so from M6f
// the last ayah of every surah sat behind it. This is that difference plus the
// same breathing room the hook gives.
//
// ponytail: a constant, not a measurement. The bar's own height is only known
// after layout, and measuring it means an extra prop and a re-render per
// mount. If the OS font scale ever pushes the bar past this, pass the measured
// height up instead of growing the number.
const RECITATION_BAR_CLEARANCE = 56;

/** The cross-fade between two renderings of the same surah. Short: both layers
 *  are the same words on the same ayah, so this is a change of treatment, not
 *  a transition between places. */
const MODE_FADE_MS = 160;

/** The style a layer rests at once it is the only one left. `opacity: 1`
 *  explicitly: the layer arrives wearing an animated opacity, and dropping
 *  that style off the array does not by itself repaint the value it left
 *  behind. */
const RESTING_LAYER = { flex: 1, opacity: 1 } as const;

/** The surah's opening block. Its own glass, like the cards below it: since
 *  M7c the mushaf is a pager rather than a list, so nothing here is ever the
 *  single-plate rendering the mushaf used to be. */
function SurahPlate({ children }: { children: ReactNode }) {
  return (
    <GlassSurface style={{ padding: 20, gap: 6, alignItems: 'center' }}>{children}</GlassSurface>
  );
}

// Shared instance: a fresh `[]` per render would change AyahText's memo key
// for every not-yet-loaded ayah on every scroll frame.
const EMPTY_WORDS: Word[] = [];

interface AyahListProps {
  data: SurahReaderData;
  /** The ayah to land on, captured when the layer mounts. */
  seedAyah: number | null;
  /** Whether this is the layer the reader is looking at. Only the live layer
   *  records the reading position and asks for words -- one laying out under a
   *  cross-fade must do neither, or a landing it has not finished overwrites
   *  the position the visible layer is still sitting on. */
  live: boolean;
  /** The landing has settled, or given up. The caller cross-fades on this. */
  onLanded: () => void;
  /** This layer is arriving over one already on screen, so it must never draw
   *  the positioning spinner: there is a finished rendering underneath it, and
   *  painting the background over that is the blank this whole arrangement
   *  exists to remove. */
  arriving: boolean;
  bookmarkedAyahs: Set<number>;
  notesByAyah?: Map<number, string | null>;
  playingAyah: number | null;
  audioEnabled: boolean;
  showTranslation: boolean;
  uiLocale: UiLocaleCode;
  wordsByAyah: Map<number, Word[]>;
  /** An ayah has come into view; the caller may want its words. Held in a ref
   *  here, so the caller is free to rebuild it every render. */
  onVisibleAyah: (ayahId: number) => void;
  onReadingAyah?: (ayahNumber: number) => void;
  onToggleBookmark: (ayahNumber: number) => void;
  onEditNote?: (ayahNumber: number) => void;
  onToggleAudio: (ayahNumber: number) => void;
  onWordPress: (word: Word) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  headerHeight: SharedValue<number>;
  /** A sheet is over the reader, so this list must leave the TalkBack order. */
  sheetsOpen: boolean;
  barDocked: boolean;
}

/**
 * One rendering of the surah: the list, and the landing sequence that puts it
 * on the right ayah.
 *
 * Its own component so the reader can mount two of them. A mode switch used to
 * change the element type at this position -- MushafPlate in one mode, Fragment
 * in the other -- which unmounted the FlatList and re-ran the landing behind a
 * spinner on a blank screen, for the whole length of the retry loop it then
 * had. Deep in a long surah that is two and a half seconds of nothing (owner
 * report, 2026-09-01). Keeping one list mounted would not have fixed it: a mushaf ayah
 * and a translation card are nothing like the same height, so the preserved
 * pixel offset points at a different ayah and the landing has to run anyway.
 *
 * So the landing still runs -- it just runs underneath the mode the reader is
 * already looking at, and the layers cross-fade once it has landed. The cost is
 * both renderings mounted for the length of one transition.
 */
function AyahList({
  data,
  seedAyah,
  live,
  onLanded,
  arriving,
  bookmarkedAyahs,
  notesByAyah,
  playingAyah,
  audioEnabled,
  showTranslation,
  uiLocale,
  wordsByAyah,
  onVisibleAyah,
  onReadingAyah,
  onToggleBookmark,
  onEditNote,
  onToggleAudio,
  onWordPress,
  onScroll,
  headerHeight,
  sheetsOpen,
  barDocked,
}: AyahListProps) {
  const theme = useThemeColors();
  const arabicSizes = useArabicSizes();
  const listBottomPadding = useListBottomPadding();
  const listRef = useRef<FlatList<SurahReaderData['ayahs'][number]>>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passesRef = useRef(0);
  // Where the target row actually laid out, and the offset the previous pass
  // corrected to. Refs, not state: they are written during layout, several
  // times per settle, and none of those writes is a render.
  // Stamped with the row it belongs to. A bare offset had to be cleared on
  // every re-landing, and clearing it threw away the only measurement a
  // shallow target ever reports: a row inside the initial render window lays
  // out on the first paint, in the same commit that runs the landing effect,
  // so the clear ran after its onLayout and no second layout followed. The
  // landing then had nothing to correct against and ended on the deadline at
  // the raw model offset -- searching 2:5 from a reader already open on 2:282
  // put 2:4 at the top (owner device, 2026-09-07: 80 attempts, 8033ms, not one
  // measurement). The index is what the clear was really for; carrying it
  // keeps a measurement that is still about the right row.
  const targetOffsetRef = useRef<{ index: number; y: number } | null>(null);
  const lastMeasuredRef = useRef<number | null>(null);
  // Called by the target row's onLayout. A ref because renderItem builds the
  // handler fresh on every render, and the landing effect must not re-run for
  // that -- see the effect's dependency note below.
  const onTargetMeasuredRef = useRef<() => void>(() => {});
  // The same value as `positioned` below. onViewableItemsChanged is called by
  // FlatList from outside the React tree off a ref that never re-reads props,
  // so it cannot see the state.
  const positionedRef = useRef(false);
  // Whether this mount has been focused before -- see the focus effect below.
  const focusedRef = useRef(false);
  const [positioned, setPositioned] = useState(false);
  // 0 until the list has laid out. The row model is width-dependent, and a
  // width guessed from the window would be wrong for mushaf mode, whose plate
  // is inset.
  const [listWidth, setListWidth] = useState(0);
  const onListLayout = useCallback((event: LayoutChangeEvent) => {
    setListWidth(event.nativeEvent.layout.width);
  }, []);

  // The list header's height, in the same units the offset table is built in.
  // Kept as state as well as the shared value the title fade reads, because the
  // table is a useMemo and a shared value's write does not re-run one.
  const [headerOffset, setHeaderOffset] = useState(0);

  // Cumulative, not per-row: scrollToIndex sums every preceding row, so the
  // table is what FlatList actually reads. Rebuilt only when something it
  // depends on changes -- a getItemLayout returning different offsets for the
  // same index between calls would move content under the user's finger.
  const layout = useMemo(() => {
    const lengths = new Array<number>(data.ayahs.length);
    const offsets = new Array<number>(data.ayahs.length);
    // Started at the header's height, not at zero. VirtualizedList mixes the
    // two sources of cell geometry in one coordinate space: a cell it has
    // already laid out is read back at its real y, which is measured inside the
    // content container and so counts the header, and every other cell is read
    // straight off this table (ListMetricsAggregator.getCellMetrics -- the
    // measured frame wins, getItemLayout is the fallback). A table that starts
    // at zero therefore disagrees with every measured frame by exactly the
    // header, and the model jump lands that far short. The header here is the
    // SurahPlate block, which is hundreds of dp -- measured at 356 on the
    // owner's device -- so this is not a rounding error: it is the "2:282 came
    // up 130dp high" class of miss, arriving before the correction pass can see
    // it.
    let running = headerOffset;
    for (let index = 0; index < data.ayahs.length; index += 1) {
      const item = data.ayahs[index];
      // noUncheckedIndexedAccess is on: the index came from this loop, but the
      // compiler cannot know that.
      if (!item) continue;
      const height = estimateRowHeight({
        // A layer of this component is always translation mode now: the mushaf
        // is a pager, and its pages are a fixed height that no model estimates.
        mode: 'translation',
        arabicSize: arabicSizes.reader,
        listWidth,
        arabicChars: item.ayah.text_uthmani?.length ?? 0,
        translationChars: item.translation?.text.length ?? 0,
      });
      offsets[index] = running;
      lengths[index] = height;
      running += height;
    }
    return { lengths, offsets };
  }, [data.ayahs, arabicSizes.reader, listWidth, headerOffset]);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: layout.lengths[index] ?? 0,
      offset: layout.offsets[index] ?? 0,
      index,
    }),
    [layout],
  );

  // The surah's opening, above ayah 1's card rather than inside it: in the card
  // it sat under the ayah number and bookmark row and still read as ayah 1's
  // own first line (owner device report, 2026-08-17). Taken off ayah 1's text
  // rather than held as a constant, so the banner carries that surah's own
  // spelling -- 95 and 97 differ -- and AyahText strips exactly what shows here.
  const basmala = useMemo(() => {
    const first = data.ayahs.find((item) => item.ayah.ayah_number === 1);
    if (!first) return null;
    return splitBasmala(first.ayah.text_uthmani, { surahId: data.surah.id, ayahNumber: 1 }).basmala;
  }, [data.ayahs, data.surah.id]);

  // The ayah the list must land on, and how many landings have been demanded.
  // `nonce` exists because the re-landing target is usually the ayah already
  // being read, so an effect keyed on the index alone would never re-run.
  //
  // Reset during render rather than in an effect, the same shape WbwScreen uses
  // for its page: an effect would set state *after* the landing effect had
  // already run against the seed, so every mount landed twice -- the second
  // scroll restarting a sequence the first had begun.
  const anchorKey = `${data.surah.id}:${seedAyah ?? ''}`;
  const [anchor, setAnchor] = useState(() => ({ key: anchorKey, ayah: seedAyah, nonce: 0 }));
  if (anchor.key !== anchorKey) {
    setAnchor({
      key: anchorKey,
      ayah: getReaderPosition(data.surah.id) ?? seedAyah,
      nonce: anchor.nonce + 1,
    });
  }

  const initialIndex = useMemo(() => {
    if (!anchor.ayah) return -1;
    return data.ayahs.findIndex((item) => item.ayah.ayah_number === anchor.ayah);
  }, [data.ayahs, anchor.ayah]);

  // The landing measures the *cell*, not a View inside it. VirtualizedList
  // positions cells directly in the content container, so a cell's `layout.y`
  // is the coordinate scrollToOffset takes. A wrapper nested inside renderItem
  // is laid out by that cell and always reports y=0, which the correction pass
  // then dutifully scrolls to -- the whole surah jumped to the top (owner
  // device, 2026-09-07: /surah/16?ayah=90 revealed on ayah 1).
  const CellRenderer = useMemo(
    () =>
      function ReaderCell({ index, onLayout, ...rest }: CellRendererProps<ReaderAyah>) {
        const isTarget = index === initialIndex;
        // A measurement outlives the cell that made it unless something drops
        // it. The stamp only says which row the number is about, not whether
        // it is still true: virtualization recycles the target's cell once the
        // reader scrolls away, and the rows above it then swap model estimates
        // for real heights, so the y it last reported no longer points at it.
        // Landing on 2:6, reading to 2:200 and coming back to 2:6 from a
        // bookmark would take that number at face value -- scroll straight to
        // it, find nothing there to re-measure, and reveal on it. Declared
        // above the early return so the hook order does not depend on which
        // row this is.
        useEffect(() => {
          if (!isTarget) return;
          return () => {
            if (targetOffsetRef.current?.index === index) targetOffsetRef.current = null;
          };
        }, [isTarget, index]);
        if (!isTarget) return <View onLayout={onLayout} {...rest} />;
        return (
          <View
            {...rest}
            testID="reader-target-row"
            onLayout={(event: LayoutChangeEvent) => {
              // Forwarded, not replaced: VirtualizedList attaches its own cell
              // onLayout in the modes that measure, and swallowing it there
              // would break its bookkeeping.
              onLayout?.(event);
              targetOffsetRef.current = { index, y: event.nativeEvent.layout.y };
              onTargetMeasuredRef.current();
            }}
          />
        );
      },
    [initialIndex],
  );

  // Read through refs by the landing effect, so a caller that rebuilds either
  // every render does not restart a scroll sequence already in flight.
  const onLandedRef = useRef(onLanded);
  const liveRef = useRef(live);
  useEffect(() => {
    onLandedRef.current = onLanded;
    liveRef.current = live;
  }, [onLanded, live]);

  useEffect(() => {
    // -1 means the ayah is not in this surah; 0 means the list already opens
    // on it. Neither is a landing, and both must reveal the reader at once.
    if (initialIndex <= 0) {
      positionedRef.current = true;
      setPositioned(true);
      onLandedRef.current();
      return;
    }

    // Reset, not left from the previous landing: an `ayah` param change on an
    // already-mounted reader (an external deep link into the surah on screen)
    // re-runs this effect without remounting, and a stale `true` reveals the
    // list mid-scroll and lets onViewableItemsChanged write every ayah the
    // jump passes over into the saved reading position.
    positionedRef.current = false;
    setPositioned(false);

    let cancelled = false;
    const startedAt = Date.now();
    passesRef.current = 0;
    // Only the previous pass's offset is cleared. A measurement stamped with
    // the target this landing is aiming at is still true, and the reason the
    // clear existed -- comparing a new target's first measurement against the
    // old target's last one and calling it settled on the spot -- is handled
    // by the stamp instead.
    lastMeasuredRef.current = null;

    const reveal = () => {
      if (cancelled) return;
      positionedRef.current = true;
      setPositioned(true);
      // The landing *is* the reading position, and nothing else will record
      // it. onViewableItemsChanged ignores every frame of the jump on purpose
      // (positionedRef is false throughout, so the ayahs it flies over are not
      // written), and no scroll follows the reveal to fire one afterwards. So
      // without this the store still holds wherever this surah was last read,
      // and the next mode switch re-anchors to that instead of the ayah the
      // caller asked for -- opening /surah/2?ayah=50 from a bookmark and
      // tapping Translation landed on 2:1.
      if (anchor.ayah !== null) {
        lastVisibleRef.current = anchor.ayah;
        setReaderPosition(data.surah.id, anchor.ayah);
      }
      onLandedRef.current();
      // The landing is over: later layouts of the target row are the user
      // scrolling, not the list settling, and a second reveal would fire
      // onLanded again and re-start the caller's cross-fade.
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };

    const schedule = () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(attempt, SCROLL_RETRY_DELAY_MS);
    };

    const attempt = () => {
      if (cancelled) return;
      const entry = targetOffsetRef.current;
      const measured = entry !== null && entry.index === initialIndex ? entry.y : null;
      if (measured === null) {
        // Nothing measured yet. Jump on the model: it does not have to be
        // right, only close enough to bring the target into the render window,
        // where it lays out and reports where it really is. This costs no pass
        // -- it is the same jump every time, and spending the correction
        // budget on it is what stopped the settle test from ever running.
        listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      } else if (measured === lastMeasuredRef.current) {
        // The row did not move under the last correction. That is the landing,
        // and unlike the content-height check this replaces, it is evidence
        // about the target itself rather than about the list around it.
        return reveal();
      } else {
        passesRef.current += 1;
        lastMeasuredRef.current = measured;
        listRef.current?.scrollToOffset({ offset: measured, animated: false });
        // Capped. A row that never settles has to be shown anyway: the reader
        // in the wrong place is bad; behind a spinner for as long as the
        // screen is open is worse.
        if (passesRef.current >= MAX_LANDING_PASSES) return reveal();
      }
      // The other half of the cap: a target that never lays out reports
      // nothing to correct against, so nothing above would ever end this.
      if (Date.now() - startedAt >= LANDING_DEADLINE_MS) return reveal();
      schedule();
    };

    // Restarted on every measurement rather than run on it: the row lays out
    // repeatedly while the cards around it settle, and correcting to the first
    // of those is correcting to a number that is about to change.
    onTargetMeasuredRef.current = () => {
      if (cancelled) return;
      // The deadline is checked here as well as in attempt(), because this is
      // what postpones attempt(): schedule() clears the pending timer and
      // starts a fresh 100ms. A row that re-lays out more often than that --
      // a long settle deep in al-Baqarah, a font swap, a cross-fade under
      // load -- would push the only deadline check out of reach and hold the
      // reader behind its spinner with no bound at all.
      if (Date.now() - startedAt >= LANDING_DEADLINE_MS) return reveal();
      schedule();
    };

    attempt();
    return () => {
      cancelled = true;
      onTargetMeasuredRef.current = () => {};
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
    // The nonce, not just the index: a re-landing usually targets the ayah
    // already on screen, so the index is unchanged and this would never re-run.
  }, [initialIndex, anchor.nonce, anchor.ayah, data.surah.id]);

  // Coming back from the word-by-word screen is a focus event: this screen
  // stays mounted behind the pushed one, so no prop changes and the anchor's
  // render-phase reset above never fires. Comparing against the ayah actually
  // on screen is what keeps a focus from re-landing the list on itself.
  useFocusEffect(
    useCallback(() => {
      // Re-focus only. useFocusEffect also fires on mount, and the shared
      // position is a module singleton that outlives this screen -- so on the
      // first pass it holds wherever this surah was last read, which is not
      // where the caller asked to go. Reading 2:200, backing out and then
      // tapping a bookmark for 2:5 opened 2:5 and immediately jumped to 2:200.
      // The anchor above has already been seeded from the route by now, and
      // that is the seed a fresh mount is supposed to honour.
      if (!focusedRef.current) {
        focusedRef.current = true;
        return;
      }
      // Only the live layer. One still laying out under a cross-fade has an
      // anchor of its own and re-seeding it mid-landing strands it.
      if (!liveRef.current) return;
      const position = getReaderPosition(data.surah.id);
      if (position === null || position === lastVisibleRef.current) return;
      setAnchor((current) => ({ ...current, ayah: position, nonce: current.nonce + 1 }));
    }, [data.surah.id]),
  );

  // Deliberately empty, and deliberately still passed: with getItemLayout the
  // jump has an offset for every index, so a miss is no longer a signal the
  // landing reads -- but FlatList warns when it has no handler, and `data`
  // changing under a pending jump can still produce one.
  const onScrollToIndexFailed = useCallback(() => {}, []);

  const onReadingAyahRef = useRef(onReadingAyah);
  const onVisibleAyahRef = useRef(onVisibleAyah);
  // onViewableItemsChanged is a ref callback built once, outside the React
  // tree, so it cannot close over a prop.
  const surahIdRef = useRef(data.surah.id);
  // The ayah actually on screen. Read when the reader is focused again, to tell
  // "the word-by-word screen moved us" from "nothing changed".
  const lastVisibleRef = useRef<number | null>(null);
  // In an effect, not during render: a render React discards would otherwise
  // leave the ref pointing at a callback that never committed, and FlatList
  // calls onViewableItemsChanged outside the React tree, so it would happily
  // invoke it. (Not useEffectEvent -- that is only callable from an Effect.)
  useEffect(() => {
    onReadingAyahRef.current = onReadingAyah;
    onVisibleAyahRef.current = onVisibleAyah;
    surahIdRef.current = data.surah.id;
  }, [onReadingAyah, onVisibleAyah, data.surah.id]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    // Nothing at all from a layer nobody is looking at: its rows scroll past
    // as it lands, and every one of them would be written to the reading
    // position as if the reader had read it.
    if (!liveRef.current) return;
    const firstVisibleAyah = viewableItems[0]?.item as ReaderAyah | undefined;
    // Not until the deep-link scroll has landed: the rows visible mid-landing
    // are wherever the list happens to be, and recording one overwrites the
    // saved reading position with an ayah nobody read.
    if (positionedRef.current && firstVisibleAyah) {
      const ayahNumber = firstVisibleAyah.ayah.ayah_number;
      lastVisibleRef.current = ayahNumber;
      // Synchronous and in memory, unlike onReadingAyah, which debounces a
      // SQLite write. This is what the other two renderings read.
      setReaderPosition(surahIdRef.current, ayahNumber);
      onReadingAyahRef.current?.(ayahNumber);
    }
    for (const token of viewableItems) {
      const item = token.item as ReaderAyah | undefined;
      // Prefetching is not gated on the landing: it is a read, it is
      // idempotent, and the rows around the target are exactly the ones about
      // to be needed.
      if (item) onVisibleAyahRef.current(item.ayah.id);
    }
  });

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={data.ayahs}
        keyExtractor={(item) => String(item.ayah.id)}
        ListHeaderComponent={
          <View
            onLayout={(event: LayoutChangeEvent) => {
              headerHeight.value = event.nativeEvent.layout.height;
              setHeaderOffset(event.nativeEvent.layout.height);
            }}
            style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
          >
            {/* The surah opens on a plate (mockups 1e/1j): the Arabic name
                leads, the Latin names sit under it in the display serif, and
                the count and revelation type are a muted caption. */}
            <SurahPlate>
              <Text
                style={{
                  color: theme.text,
                  fontFamily: fonts.arabic,
                  fontSize: arabicSizes.banner,
                  writingDirection: 'rtl',
                }}
              >
                {data.surah.name_arabic}
              </Text>
              <Text
                accessibilityRole="header"
                style={{ color: theme.text, fontFamily: fonts.displaySemiBold, fontSize: typography.title }}
              >
                {data.surah.name_translit}
              </Text>
              <Text style={{ color: theme.mutedText, fontFamily: fonts.display, fontSize: typography.body }}>
                {data.surah.name_translation}
              </Text>
              <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
                {`${data.surah.ayah_count} ${t(uiLocale, 'surahList.ayahsSuffix')} · ${t(
                  uiLocale,
                  data.surah.revelation_type === 'meccan' ? 'browse.meccan' : 'browse.medinan',
                )}`}
              </Text>
              {basmala ? <Bismillah text={basmala} uiLocale={uiLocale} /> : null}
            </SurahPlate>
          </View>
        }
        renderItem={({ item }) => {
          const shared = {
            surahId: data.surah.id,
            ayahNumber: item.ayah.ayah_number,
            arabicText: item.ayah.text_uthmani,
            words: wordsByAyah.get(item.ayah.id) ?? EMPTY_WORDS,
            bookmarked: bookmarkedAyahs.has(item.ayah.ayah_number),
            note: notesByAyah?.get(item.ayah.ayah_number) ?? null,
            playing: playingAyah === item.ayah.ayah_number,
            uiLocale,
            audioDisabled: !audioEnabled,
            onToggleBookmark,
            // Spread conditionally: exactOptionalPropertyTypes distinguishes
            // "absent" from "present and undefined", and the renderers declare
            // the prop optional rather than optional-or-undefined.
            ...(onEditNote ? { onEditNote } : {}),
            onToggleAudio,
            onWordPress,
          };
          return (
            <AyahCard
              {...shared}
              translationText={item.translation?.text ?? null}
              showTranslation={showTranslation}
            />
          );
        }}
        CellRendererComponent={CellRenderer}
        onViewableItemsChanged={onViewableItemsChanged.current}
        onScrollToIndexFailed={onScrollToIndexFailed}
        getItemLayout={getItemLayout}
        onLayout={onListLayout}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // BottomSheet -- the shell under both WordSheet and LanguageSheet --
        // sets role="dialog"/aria-modal, but accessibilityViewIsModal is
        // iOS-only, so on Android the ayah text and both card buttons stay
        // reachable by TalkBack swipe while either sheet covers them and the
        // modal is only visually modal (CLAUDE.md §8, WCAG AA). The nav header
        // is a native toolbar outside this View and is still reachable.
        importantForAccessibility={sheetsOpen || !live ? 'no-hide-descendants' : 'auto'}
        initialNumToRender={DEFAULT_INITIAL_RENDER}
        // `|| arriving` for the same reason the spinner below carries it, and
        // it is the last blank on the device list. `reveal()` calls
        // setPositioned(true) and onLanded() in one tick; onLanded starts the
        // cross-fade, which is a shared-value write that takes effect on the
        // UI thread at once, while setPositioned waits for React to commit. So
        // for the frames in between the outgoing layer was already fading out
        // and the incoming list was still hidden here -- both invisible, and
        // the bloom showing through as one flash (device, Al-Baqara 2:255,
        // 2026-09-02). An arriving layer needs no hiding of its own: its
        // wrapper is at opacity 0 for the whole landing, and the fade is what
        // reveals it.
        style={{ flex: 1, opacity: positioned || arriving ? 1 : 0 }}
        contentContainerStyle={{
          paddingBottom: listBottomPadding + (barDocked ? RECITATION_BAR_CLEARANCE : 0),
        }}
      />
      {/* Over the list rather than instead of it: the list has to be mounted
          and laid out for the scroll to have anything to land on. Opacity, not
          a conditional render, for the same reason. */}
      {positioned || arriving ? null : (
        <View
          testID="reader-positioning"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.background,
          }}
        >
          <ActivityIndicator />
        </View>
      )}
    </View>
  );
}

export function SurahReader({
  data,
  bookmarkedAyahs,
  notesByAyah,
  playingAyah,
  audioEnabled,
  recitation,
  uiLocale,
  contentLanguage,
  onChangeContentLanguage,
  readerMode,
  onChangeReaderMode,
  showTranslation = true,
  onChangeShowTranslation,
  initialAyahNumber,
  loadWords,
  loadWordSummary,
  onToggleBookmark,
  onEditNote,
  onToggleAudio,
  onReadingAyah,
  onReadingPage,
  corpusClient = null,
  // Defaulted rather than forwarded as undefined: exactOptionalPropertyTypes
  // rejects an explicit undefined for an optional prop, and null is what the
  // header already reads as "no surah that way".
  prevSurahId = null,
  nextSurahId = null,
  onPageSurah,
}: SurahReaderProps) {
  const navigation = useNavigation();

  const [languageOpen, setLanguageOpen] = useState(false);
  const [reciterOpen, setReciterOpen] = useState(false);

  // The ayah the docked bar is parked on. Not `playingAyah`: that goes null the
  // moment the recitation ends, and a bar that vanishes with the last syllable
  // takes the resume control with it -- the user is then scrolling back to the
  // card to replay the ayah they are still looking at.
  const [dockedAyah, setDockedAyah] = useState<number | null>(null);
  useEffect(() => {
    if (playingAyah !== null) setDockedAyah(playingAyah);
  }, [playingAyah]);
  // The one condition the bar renders under, named once: the list has to
  // reserve room for exactly the frames the bar is on screen for.
  const barDocked = audioEnabled && dockedAyah !== null;

  // The page index, for the header's title and the pager's footers. Loaded
  // once per process, so a mode switch and a surah page-turn both read a map
  // that is already there.
  const mushafIndex = useMushafIndex(corpusClient);
  // Which page each of this surah's ayahs is printed on. From the corpus rows
  // the reader already holds -- ayahs.page is what M7b re-paged, and is the
  // only thing that can turn `?ayah=` into an opening page (ruling 10).
  const pageByAyah = useMemo(() => {
    const byAyah = new Map<number, number>();
    for (const item of data.ayahs) {
      if (item.ayah.page !== null) byAyah.set(item.ayah.ayah_number, item.ayah.page);
    }
    return byAyah;
  }, [data.ayahs]);
  const pageOfAyah = useCallback(
    (ayahNumber: number | null) => {
      // The surah's own first page when the ayah is unknown or unpaged: a
      // reader opened from the surah list has no ayah, and page 1 of the
      // mushaf would be the wrong book entirely.
      const first = data.ayahs[0]?.ayah.page ?? 1;
      if (ayahNumber === null) return first;
      return pageByAyah.get(ayahNumber) ?? first;
    },
    [data.ayahs, pageByAyah],
  );
  // The page the pager has settled on, once it has moved. Null until then, so
  // the header falls back to the surah the reader was opened on rather than
  // guessing a page before one exists.
  const [mushafPage, setMushafPage] = useState<number | null>(null);
  // Issue #58: the name is a function of the page, not of the screen's
  // mount-time surah. A pager crosses into the next surah without the screen
  // changing, and the old header could only ever name the one it was mounted
  // with -- which after a chevron turn was a surah the reader had left.
  const headerSurahName =
    (readerMode === 'mushaf' && mushafPage !== null
      ? mushafIndex.pages.get(mushafPage)?.surahName
      : null) ?? data.surah.name_translit;
  const bookmarkedKeys = useMemo(
    () => new Set([...bookmarkedAyahs].map((ayahNumber) => ayahKey(data.surah.id, ayahNumber))),
    [bookmarkedAyahs, data.surah.id],
  );
  // Ruling 19: the page follows the recitation. Null while nothing is playing,
  // which leaves the pager exactly where the reader put it.
  const focusPage = playingAyah === null ? null : (pageByAyah.get(playingAyah) ?? null);

  const onMushafPageChange = useCallback(
    (page: number) => {
      setMushafPage(page);
      const entry = mushafIndex.pages.get(page);
      if (!entry) return;
      // The in-memory position too, and only when the page opens in the surah
      // on screen: it is keyed by surah, and it is what a switch to
      // translation mode lands on.
      if (entry.startSurahId === data.surah.id) {
        setReaderPosition(data.surah.id, entry.startAyahNumber);
      }
      onReadingPage?.({
        surahId: entry.startSurahId,
        ayahNumber: entry.startAyahNumber,
        page,
      });
    },
    [mushafIndex.pages, data.surah.id, onReadingPage],
  );

  // The nav header carries the surah name once the list header's 24pt heading
  // has scrolled off -- Android's own app-bar behaviour, and it keeps the name
  // on screen at ayah 150 where the list header is long gone.
  //
  // Scroll-linked rather than switched at a threshold: as a boolean the name
  // arrived fully formed the instant the line was crossed, which read on the
  // device as it "appearing out of nowhere" (owner report, 2026-08-18). Driven
  // off the scroll offset itself, it tracks the finger and reverses exactly on
  // the way back up. Measured, not a constant: the header grows with the Arabic
  // size setting and the OS font scale.
  const scrollY = useSharedValue(0);
  const headerHeight = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const titleStyle = useAnimatedStyle(() => {
    // Until the header has measured there is no threshold to cross, and the
    // title stays hidden rather than fading in at the very top of the surah.
    if (headerHeight.value <= 0) return { opacity: 0, transform: [{ translateY: 0 }] };

    const end = headerHeight.value - TITLE_FADE_END;

    if (reducedMotion) {
      // No travel and no ramp: a fade is still motion, and this setting is a
      // standing instruction not to animate.
      return { opacity: scrollY.value > end ? 1 : 0, transform: [{ translateY: 0 }] };
    }

    const progress = interpolate(
      scrollY.value,
      [end - TITLE_FADE_DISTANCE, end],
      [0, 1],
      Extrapolation.CLAMP,
    );

    return { opacity: progress, transform: [{ translateY: (1 - progress) * TITLE_RISE }] };
  });

  useEffect(() => {
    navigation.setOptions({
      // The whole bar, not headerTitle/headerRight: the reader's chrome is one
      // glass surface with the bloom behind it (owner ruling 2026-08-25,
      // mockup 1e), and a native toolbar cannot be that. Everything the
      // toolbar provided is now ReaderHeader's -- the back affordance included.
      //
      // `header`, not `headerTransparent`: a transparent header stops the
      // navigator insetting the content, and every screen's own heading then
      // renders underneath the back arrow (see app/_layout.tsx).
      header: () => (
        <ReaderHeader
          surahName={headerSurahName}
          // No fade in mushaf mode: the fade is driven by the ayah list's
          // scroll offset, and a pager never scrolls vertically -- the title
          // would sit at opacity 0 for the whole session (issue #58).
          {...(readerMode === 'mushaf' ? {} : { titleStyle })}
          mode={readerMode}
          onChangeMode={onChangeReaderMode}
          showTranslation={showTranslation}
          {...(onChangeShowTranslation ? { onChangeShowTranslation } : {})}
          uiLocale={uiLocale}
          prevSurahId={prevSurahId}
          nextSurahId={nextSurahId}
          {...(onPageSurah ? { onPageSurah } : {})}
          onBack={() => {
            closeSheet();
            navigation.goBack();
          }}
          // Each of these closes the word sheet first. The bar sits above the
          // sheet's backdrop rather than inside it, so leaving the sheet
          // mounted holds the ayah list at no-hide-descendants behind whatever
          // opens next -- coming back from the grid then lands on a stale
          // sheet over an unreachable list.
          onOpenSearch={() => {
            closeSheet();
            router.push('/search');
          }}
          onOpenLanguage={() => {
            closeSheet();
            setLanguageOpen(true);
          }}
          onOpenWbw={() => {
            closeSheet();
            // The ayah on screen, not the route param: the param is where the
            // reader was *opened*, which after any scrolling is not where the
            // reader is. Still validated at the route by parseAyahNumber --
            // writing our own link does not make it trusted input (§3, OWASP).
            router.push(`/surah/${data.surah.id}/words?from=${getReaderPosition(data.surah.id) ?? 1}`);
          }}
        />
      ),
    });
    // closeSheet is declared after this effect (it needs openWord and
    // requestRef), so it cannot sit in the dependency array without a
    // temporal-dead-zone error -- but calling it from these handlers is safe:
    // they only run once the whole component body has evaluated.
  }, [
    navigation,
    titleStyle,
    uiLocale,
    readerMode,
    onChangeReaderMode,
    showTranslation,
    onChangeShowTranslation,
    data.surah.id,
    headerSurahName,
    prevSurahId,
    nextSurahId,
    onPageSurah,
  ]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // A shared value, not state: this runs on every scroll frame and setting
      // state here re-rendered the whole navigator.
      scrollY.value = event.nativeEvent.contentOffset.y;
    },
    [scrollY],
  );

  // Read by fetchWordsRef, which is built once and so cannot close over a
  // prop. In an effect rather than during render: a render React discards
  // would otherwise leave these pointing at values that never committed.
  const loadWordsRef = useRef(loadWords);
  const ayahsRef = useRef(data.ayahs);
  useEffect(() => {
    loadWordsRef.current = loadWords;
    ayahsRef.current = data.ayahs;
  }, [loadWords, data.ayahs]);

  const [wordsByAyah, setWordsByAyah] = useState<Map<number, Word[]>>(new Map());
  // Separate from the state map, and written before the await:
  // onViewableItemsChanged fires on every scroll frame that changes the set,
  // so a check against state alone would issue a fresh query per frame for as
  // long as the first one is still in flight.
  const requestedRef = useRef(new Set<number>());

  const fetchWordsRef = useRef(async (ayahId: number) => {
    const load = loadWordsRef.current;
    if (!load) return;
    const ayahs = ayahsRef.current;
    const start = ayahs.findIndex((item) => item.ayah.id === ayahId);
    if (start < 0) return;

    await Promise.all(
      ayahs.slice(start, start + 1 + WORD_LOOKAHEAD).map(async (item) => {
        const id = item.ayah.id;
        if (requestedRef.current.has(id)) return;
        requestedRef.current.add(id);
        try {
          const words = await load(id);
          setWordsByAyah((current) => new Map(current).set(id, words));
        } catch (cause) {
          // Cleared so the next scroll past this ayah tries again, rather than
          // leaving it permanently untappable. Logged for logcat, never shown:
          // the ayah still renders its text, so there is nothing for the
          // reader to act on.
          requestedRef.current.delete(id);
          console.error('[reader] word load failed', { ayahId: id, cause });
        }
      }),
    );
  });

  // The prefetch entry point every layer calls. Kept here rather than in the
  // list so one word cache serves both renderings and survives the swap --
  // per-layer caches would re-query the whole window on every mode switch.
  const onVisibleAyah = useCallback((ayahId: number) => {
    void fetchWordsRef.current(ayahId);
  }, []);

  const [openWord, setOpenWord] = useState<WordSummary | null>(null);

  // Same guard WbwScreen carries, for the same reason: two taps can be in
  // flight together -- the first is the slow one, since it warms the surah's
  // gloss cache -- so without the sequence check the sheet shows whichever
  // query finished last rather than the word tapped last, and nothing on
  // screen says so. Bumped on close too, so an in-flight tap cannot re-open
  // the sheet the user has just dismissed.
  const requestRef = useRef(0);

  const onWordPress = useCallback(
    (word: Word) => {
      if (!loadWordSummary) return;
      const request = (requestRef.current += 1);
      loadWordSummary(word)
        .then((summary) => {
          if (requestRef.current === request) setOpenWord(summary);
        })
        .catch((cause: unknown) => {
          // Nothing opens. A sheet with the morphology missing would look like
          // the word has none, which is never true.
          console.error('[reader] word summary failed', { wordId: word.id, cause });
        });
    },
    [loadWordSummary],
  );

  const closeSheet = useCallback(() => {
    requestRef.current += 1;
    setOpenWord(null);
  }, []);

  // The renderings currently mounted, oldest first. One entry is the steady
  // state; a second appears for the length of a mode switch and then replaces
  // the first.
  //
  // Identified by a counter rather than by mode, deliberately. Keyed on mode,
  // the surviving layer would take a new key the moment it became the only one
  // left, remount, and re-land behind a spinner -- which is the whole defect,
  // moved to the end of the transition.
  const layerSeqRef = useRef(0);
  const [layers, setLayers] = useState<{ id: number; mode: ReaderMode; seedAyah: number | null }[]>(
    () => [{ id: 0, mode: readerMode, seedAyah: initialAyahNumber ?? null }],
  );
  const incoming = useSharedValue(0);

  useEffect(() => {
    const current = layers[layers.length - 1];
    if (!current || current.mode === readerMode) return;
    incoming.value = 0;
    layerSeqRef.current += 1;
    setLayers((existing) => {
      const arrival = {
        id: layerSeqRef.current,
        mode: readerMode,
        // Where the reader actually is, not where the route opened -- after
        // any scrolling those are different ayahs, and the route param is
        // absent entirely when the reader was opened from the surah list.
        seedAyah: getReaderPosition(data.surah.id) ?? initialAyahNumber ?? null,
      };
      // Never more than two. A switch asked for while one is still in flight
      // replaces the arrival rather than stacking on it: the layer being
      // replaced has never been seen -- it is at opacity 0 for its whole life
      // -- so dropping it is invisible, where appending mounts another full
      // list of the surah (2:255 renders ~255 rows before it can even try to
      // scroll) for every tap of a mashed pill.
      if (existing.length === 1) return [...existing, arrival];
      // Back to what is already on screen underneath. Cancelling the arrival
      // is the whole change: there is nothing to fade to.
      if (existing[existing.length - 2]?.mode === readerMode) return existing.slice(0, -1);
      return [...existing.slice(0, -1), arrival];
    });
  }, [readerMode, layers, incoming, data.surah.id, initialAyahNumber]);

  // A change to the route's ayah param is an external deep link into the surah
  // already on screen, and it has to re-land the layer the reader is looking
  // at. Only a *change*: a seed captured when the layer was created is the
  // right answer for a mode switch (the reading position, not the param the
  // reader was opened with), so the param may not simply win every render.
  const lastParamRef = useRef(initialAyahNumber ?? null);
  useEffect(() => {
    const next = initialAyahNumber ?? null;
    if (next === lastParamRef.current) return;
    lastParamRef.current = next;
    setLayers((existing) =>
      existing.map((layer, index) =>
        index === existing.length - 1 ? { ...layer, seedAyah: next } : layer,
      ),
    );
  }, [initialAyahNumber]);

  const dropSpentLayers = useCallback(() => {
    setLayers((existing) => (existing.length > 1 ? existing.slice(-1) : existing));
  }, []);

  // The arrival. Under reduced motion it is a cut, which is what the setting
  // asks for -- and a cut here still never shows a blank, because the layer
  // underneath is a finished rendering until the instant it is replaced.
  //
  // A zero-length timing rather than a bare `incoming.value = 1` followed by
  // the drop. Both read as a cut, but only one of them survives the drop: a
  // direct write is handed to the UI thread to apply, and dropping the spent
  // layer in the same tick re-renders the survivor without an animated style
  // at all, which unregisters the view before that write has landed. The
  // opacity the node keeps is then the one reanimated last actually applied --
  // 0, from the mount -- and the reader shows its header over an empty page
  // (device, 2026-09-03: reduced motion only, into mushaf and translation
  // alike). Routing through withTiming keeps the drop in the completion
  // callback, which cannot run before the value has been committed.
  const revealIncoming = useCallback(() => {
    incoming.value = withTiming(1, { duration: reducedMotion ? 0 : MODE_FADE_MS }, (finished?: boolean) => {
      // Only on a settled fade: an interrupted one leaves the incoming layer
      // half-transparent, and dropping the layer under it would show the page
      // through the gap.
      if (finished) runOnJS(dropSpentLayers)();
    });
  }, [reducedMotion, incoming, dropSpentLayers]);

  const incomingStyle = useAnimatedStyle(() => ({ opacity: incoming.value }));
  // The other half of the cross-fade, and it is not optional. A layer's
  // background is the bloom showing through, so an arriving layer at opacity 1
  // does not hide the one beneath it -- both renderings sit on screen together
  // until the spent one is dropped, and the drop is a JS-thread hop that the
  // arriving list's own landing work can hold up. On device that was 420ms of
  // two readings of 2:255 printed over each other (2026-09-01). Fading the
  // outgoing layer out as the incoming comes in makes the drop invisible
  // however late it runs.
  const outgoingStyle = useAnimatedStyle(() => ({ opacity: 1 - incoming.value }));

  // Stable no-ops, so a layer that is not driving either one does not get a
  // fresh callback identity on every render of this component.
  const noopLanded = useCallback(() => {}, []);
  const noopScroll = useCallback(() => {}, []);
  const noopPageChange = useCallback(() => {}, []);

  // A tapped glyph carries a coordinate, not a word row. The reader's own word
  // loader is what turns the ayah into words -- the same query the ayah cards
  // prefetch through, so a page the reader has already looked at answers from
  // its cache.
  const onMushafWordPress = useCallback(
    (pressed: MushafWord, ayahId: number) => {
      if (!loadWords) return;
      void loadWords(ayahId)
        .then((words) => {
          const word = words.find((candidate) => candidate.position === pressed.position);
          // No word at that position is the ayah-end medallion, which has a
          // layout row and no word row behind it. Nothing opens.
          if (word) onWordPress(word);
        })
        .catch((cause: unknown) => {
          console.error('[reader] mushaf word load failed', { ayahId, position: pressed.position, cause });
        });
    },
    [loadWords, onWordPress],
  );

  const ayahNumberOf = useCallback(
    (word: Word) => data.ayahs.find((item) => item.ayah.id === word.ayah_id)?.ayah.ayah_number,
    [data.ayahs],
  );

  // The open word's ayah, when it is one this reader can act on. A mushaf page
  // holds ayahs from surahs the route never named (page 106 opens in An-Nisa
  // and heads Al-Ma'idah), and every control here -- bookmarks, notes, audio
  // -- is keyed to the displayed surah alone. Undefined for those words, so
  // the sheet shows morphology and no actions rather than actions that would
  // land on the wrong surah's ayah.
  const openWordAyah = openWord ? ayahNumberOf(openWord.word) : undefined;


  return (
    <View style={{ flex: 1 }}>
      {/* One layer per rendering, and two of them only while a switch is in
          flight. The incoming layer lays out and lands underneath the one the
          reader is looking at, then fades in over it. Nothing blanks, and the
          landing still lands exactly -- see the note on AyahList. */}
      {layers.map((layer, index) => {
        // Two questions, and answering both with "is this the newest layer"
        // handed every touch to a list nobody could see. The arriving layer
        // owns the cross-fade and fires the reveal; the layer the reader is
        // *looking at* is the one underneath it until the arrival is dropped,
        // and that is the one that takes touches, feeds the header's scroll
        // offset, is exposed to TalkBack and records the reading position --
        // which is what the note on AyahList's `live` has said all along.
        const arriving = index > 0;
        const list = layer.mode === 'mushaf' ? (
          <MushafReader
            key={layer.id}
            client={corpusClient}
            index={mushafIndex}
            initialPage={pageOfAyah(layer.seedAyah)}
            landingAyah={
              layer.seedAyah === null
                ? null
                : { surahId: data.surah.id, ayahNumber: layer.seedAyah }
            }
            bookmarkedKeys={bookmarkedKeys}
            playingAyah={
              playingAyah === null ? null : { surahId: data.surah.id, ayahNumber: playingAyah }
            }
            // Only the live layer follows the recitation: a layer still laying
            // out under a cross-fade would scroll itself to a page nobody has
            // seen and arrive there instead of where the reader was.
            focusPage={arriving ? null : focusPage}
            uiLocale={uiLocale}
            onPageChange={arriving ? noopPageChange : onMushafPageChange}
            onWordPress={onMushafWordPress}
            onLanded={arriving ? revealIncoming : noopLanded}
          />
        ) : (
          <AyahList
            key={layer.id}
            data={data}
            seedAyah={layer.seedAyah}
            live={!arriving}
            onLanded={arriving ? revealIncoming : noopLanded}
            arriving={arriving}
            bookmarkedAyahs={bookmarkedAyahs}
            {...(notesByAyah ? { notesByAyah } : {})}
            playingAyah={playingAyah}
            audioEnabled={audioEnabled}
            showTranslation={showTranslation}
            uiLocale={uiLocale}
            wordsByAyah={wordsByAyah}
            onVisibleAyah={onVisibleAyah}
            {...(onReadingAyah ? { onReadingAyah } : {})}
            onToggleBookmark={onToggleBookmark}
            {...(onEditNote ? { onEditNote } : {})}
            onToggleAudio={onToggleAudio}
            onWordPress={onWordPress}
            onScroll={arriving ? noopScroll : onScroll}
            headerHeight={headerHeight}
            sheetsOpen={Boolean(openWord) || languageOpen || reciterOpen}
            barDocked={barDocked}
          />
        );
        // The first layer is the page; anything above it is an arrival. An
        // arrival is absolutely positioned so the layer underneath keeps its
        // own layout rather than being pushed out of the column, and
        // untouchable until it has faded in -- a half-transparent list that
        // swallows taps is worse than either mode.
        //
        // Every layer gets the same wrapper, arriving or not. Returning `list`
        // bare at index 0 was a remount waiting to happen: once the spent
        // layer is dropped the survivor moves from index 1 to index 0, and a
        // child whose element type changes at the same position is unmounted
        // and rebuilt. The rebuilt list re-lands from scratch, which is
        // exactly the blank-and-spinner this layering exists to remove
        // (device, 2026-09-01, Al-Baqara 2:255).
        // Layer 0 stays in the column and every arrival is absolutely
        // positioned over it, so the layer underneath keeps its own layout
        // rather than being pushed out. While a switch is in flight the two
        // cross-fade; alone, a layer rests at full opacity.
        const base = index === 0 ? RESTING_LAYER : StyleSheet.absoluteFill;
        const fade = layers.length === 1 ? null : arriving ? incomingStyle : outgoingStyle;
        return (
          <Animated.View
            key={layer.id}
            testID={`reader-layer-${layer.id}`}
            pointerEvents={arriving ? 'none' : 'auto'}
            style={fade ? [base, fade] : base}
          >
            {list}
          </Animated.View>
        );
      })}
      {/* Hidden from TalkBack behind a sheet for the same reason the list is:
          accessibilityViewIsModal is iOS-only, so on Android a swipe would
          otherwise walk from the sheet straight onto this bar. */}
      <View
        pointerEvents="box-none"
        importantForAccessibility={openWord || languageOpen || reciterOpen ? 'no-hide-descendants' : 'auto'}
        style={StyleSheet.absoluteFill}
      >
        <RecitationBar
          {...recitation}
          reciterLabel={reciterById(recitation.reciterId)?.label ?? ''}
          onOpenReciters={() => {
            // Closes the word sheet first, for the same reason the header's
            // actions do: this bar sits above the sheet's backdrop, so leaving
            // it mounted holds the ayah list at no-hide-descendants behind the
            // picker.
            closeSheet();
            setReciterOpen(true);
          }}
          ayahNumber={barDocked ? dockedAyah : null}
          playing={playingAyah !== null}
          uiLocale={uiLocale}
          onTogglePlay={() => {
            if (dockedAyah !== null) onToggleAudio(dockedAyah);
          }}
        />
      </View>
      <WordSheet
        summary={openWord}
        uiLocale={uiLocale}
        {...(openWordAyah === undefined
          ? {}
          : {
              ayahLabel: `${t(uiLocale, 'reader.ayahLabel')} ${openWordAyah}`,
              // Built here, not described to the sheet: the sheet has no
              // business knowing what a bookmark is, and every piece of this
              // is already in hand.
              ayahActions: (
                <AyahControls
                  surahId={data.surah.id}
                  ayahNumber={openWordAyah}
                  bookmarked={bookmarkedAyahs.has(openWordAyah)}
                  note={notesByAyah?.get(openWordAyah) ?? null}
                  playing={playingAyah === openWordAyah}
                  uiLocale={uiLocale}
                  audioDisabled={!audioEnabled}
                  onToggleBookmark={onToggleBookmark}
                  {...(onEditNote ? { onEditNote } : {})}
                  onToggleAudio={onToggleAudio}
                />
              ),
            })}
        onClose={closeSheet}
        onOpenDetail={(word) => {
          const ayahNumber = ayahNumberOf(word);
          if (ayahNumber === undefined) return;
          closeSheet();
          router.push(`/word/${data.surah.id}/${ayahNumber}/${word.position}`);
        }}
        onOpenRoot={(rootBuckwalter) => {
          closeSheet();
          // Buckwalter carries `$`, `<` and `'`, none of which survive a raw
          // path segment.
          router.push(`/root/${encodeURIComponent(rootBuckwalter)}`);
        }}
      />
      {reciterOpen ? (
        <ReciterSheet
          current={recitation.reciterId}
          uiLocale={uiLocale}
          onSelect={recitation.onChangeReciter}
          onClose={() => setReciterOpen(false)}
        />
      ) : null}
      {languageOpen ? (
        <LanguageSheet
          value={contentLanguage}
          uiLocale={uiLocale}
          onChange={onChangeContentLanguage}
          onClose={() => setLanguageOpen(false)}
        />
      ) : null}
    </View>
  );
}
