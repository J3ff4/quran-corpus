import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
import type { ReaderAyah, SurahReaderData, WordSummary } from '@/data/corpusRepository';
import { getReaderPosition, setReaderPosition } from '@/data/readerPosition';
import type { ContentLanguageCode, UiLocaleCode } from '@/i18n/languages';
import type { ReaderMode } from '@/settings/settingsStore';

import { AyahCard } from './AyahCard';
import { MushafAyah } from './MushafAyah';
import { RecitationBar, type RecitationBarProps } from './RecitationBar';
import { ReaderHeader } from './ReaderHeader';
import { Bismillah } from './Bismillah';
import { LanguageSheet } from './LanguageSheet';
import { ReciterSheet } from './ReciterSheet';
import { WordSheet } from './WordSheet';
import { GlassSurface } from './GlassSurface';
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
  /** Forwarded to the header's surah chevrons. Omitted draws none. */
  prevSurahId?: number | null;
  nextSurahId?: number | null;
  onPageSurah?: (surahId: number, side: 'prev' | 'next') => void;
}

// Ayah cards are variable height (Arabic runs wrap differently per ayah), so
// there is no getItemLayout to give FlatList and scrollToIndex fails for any
// row it has not measured yet. Two halves make a deep-link landing exact
// instead of approximate: initialNumToRender is widened to cover the target,
// so the row is rendered and therefore measurable on the first commit; and the
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
// "FlatList reported no failure" is not the same as "the row is at the top".
// scrollToIndex computes its offset from the row heights measured so far, so a
// card above the target that has rendered but not finished laying out measures
// short, the jump lands short, and the target slides further down as those
// cards settle. So every attempt re-scrolls, and only a scroll that both missed
// nothing and left the content height unchanged counts as the landing. (Owner
// device, 2026-08-23: 6:87 opened from a concordance row two cards below the
// top, and the same from search and bookmarks.)
const MAX_SCROLL_ATTEMPTS = 25;
const SCROLL_RETRY_DELAY_MS = 100;
// React Native's own default. Restated because the deep-link case overrides it
// and a bare 10 in the JSX reads as a number someone chose.
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

/** The single plate mushaf mode's rows flow across. */
function MushafPlate({ children }: { children: ReactNode }) {
  return (
    <GlassSurface style={{ flex: 1, marginHorizontal: 12, marginBottom: 8, paddingTop: 4 }}>
      {children}
    </GlassSurface>
  );
}

/** The surah's opening block: its own glass in translation mode, bare in
 *  mushaf mode, where the whole list is already one plate. */
function SurahPlate({ mushaf, children }: { mushaf: boolean; children: ReactNode }) {
  const style = { padding: 20, gap: 6, alignItems: 'center' as const };
  if (mushaf) return <View style={style}>{children}</View>;
  return <GlassSurface style={style}>{children}</GlassSurface>;
}

// Shared instance: a fresh `[]` per render would change AyahText's memo key
// for every not-yet-loaded ayah on every scroll frame.
const EMPTY_WORDS: Word[] = [];

interface AyahListProps {
  data: SurahReaderData;
  /** Which rendering this layer draws. A layer is one mode for its whole life:
   *  switching modes mounts a second layer rather than re-rendering this one,
   *  so nothing here ever has to survive a mode change. */
  mode: ReaderMode;
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
 * spinner on a blank screen, for up to MAX_SCROLL_ATTEMPTS * SCROLL_RETRY_DELAY_MS.
 * Deep in a long surah that is two and a half seconds of nothing (owner report,
 * 2026-09-01). Keeping one list mounted would not have fixed it: a mushaf ayah
 * and a translation card are nothing like the same height, so the preserved
 * pixel offset points at a different ayah and the landing has to run anyway.
 *
 * So the landing still runs -- it just runs underneath the mode the reader is
 * already looking at, and the layers cross-fade once it has landed. The cost is
 * both renderings mounted for the length of one transition.
 */
function AyahList({
  data,
  mode,
  seedAyah,
  live,
  onLanded,
  arriving,
  bookmarkedAyahs,
  notesByAyah,
  playingAyah,
  audioEnabled,
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
  const attemptsRef = useRef(0);
  // Set by onScrollToIndexFailed, read by the attempt loop below. A ref, not
  // state: FlatList reports the failure synchronously during a scroll and a
  // re-render per attempt would remount nothing useful.
  const failedRef = useRef(false);
  // The list's content height, and the height the previous attempt scrolled
  // over. Equal means nothing above the target grew in that window, which is
  // the only evidence available here that the offset the scroll used is the
  // offset the row actually sits at.
  const contentHeightRef = useRef(0);
  const settledHeightRef = useRef(-1);
  // The same value as `positioned` below. onViewableItemsChanged is called by
  // FlatList from outside the React tree off a ref that never re-reads props,
  // so it cannot see the state.
  const positionedRef = useRef(false);
  // Whether this mount has been focused before -- see the focus effect below.
  const focusedRef = useRef(false);
  const [positioned, setPositioned] = useState(false);

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
    attemptsRef.current = 0;
    // -1, not the live height: a re-run must scroll at least twice before it
    // can call anything settled, or the first tick reveals on a comparison
    // against a height nothing has scrolled over yet.
    settledHeightRef.current = -1;

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
    };

    const attempt = () => {
      if (cancelled) return;
      failedRef.current = false;
      attemptsRef.current += 1;
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      retryTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        // Both halves: no miss, and no growth under the jump.
        const landed = !failedRef.current && contentHeightRef.current === settledHeightRef.current;
        settledHeightRef.current = contentHeightRef.current;
        if (landed) return reveal();
        // Capped: a row that never measures has to settle. Showing the reader
        // in the wrong place is bad; leaving it behind a spinner for as long
        // as the screen is open is worse.
        if (attemptsRef.current >= MAX_SCROLL_ATTEMPTS) return reveal();
        attempt();
      }, SCROLL_RETRY_DELAY_MS);
    };

    attempt();
    return () => {
      cancelled = true;
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

  // Records the miss and nothing else -- see the note above MAX_SCROLL_ATTEMPTS
  // for what the offset estimate that used to live here cost.
  const onScrollToIndexFailed = useCallback(() => {
    failedRef.current = true;
  }, []);
  // Read by the landing loop above, one tick later -- not state: it changes on
  // every layout pass while the surah settles and none of them is a render.
  const onContentSizeChange = useCallback((_width: number, height: number) => {
    contentHeightRef.current = height;
  }, []);

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

  // Mushaf mode reads as one page, so the whole list sits on a single glass
  // plate (mockup 1e). Translation mode's cards are each their own surface, so
  // a plate under them would be glass on glass.
  const Plate = mode === 'mushaf' ? MushafPlate : Fragment;

  return (
    <View style={{ flex: 1 }}>
      <Plate>
      <FlatList
        ref={listRef}
        data={data.ayahs}
        keyExtractor={(item) => String(item.ayah.id)}
        ListHeaderComponent={
          <View
            onLayout={(event: LayoutChangeEvent) => {
              headerHeight.value = event.nativeEvent.layout.height;
            }}
            style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
          >
            {/* The surah opens on a plate (mockups 1e/1j): the Arabic name
                leads, the Latin names sit under it in the display serif, and
                the count and revelation type are a muted caption. */}
            <SurahPlate mushaf={mode === 'mushaf'}>
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
          // Two renderers, one list. Everything the list does around them --
          // the landing sequence, viewability tracking, the sheets, the retry
          // loop -- is mode-blind, and both renderers expose the same testIDs
          // and the same word tap targets, so nothing below this line has to
          // know which one is mounted.
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
          return mode === 'mushaf' ? (
            <MushafAyah {...shared} />
          ) : (
            <AyahCard {...shared} translationText={item.translation?.text ?? null} />
          );
        }}
        onViewableItemsChanged={onViewableItemsChanged.current}
        onScrollToIndexFailed={onScrollToIndexFailed}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // BottomSheet -- the shell under both WordSheet and LanguageSheet --
        // sets role="dialog"/aria-modal, but accessibilityViewIsModal is
        // iOS-only, so on Android the ayah text and both card buttons stay
        // reachable by TalkBack swipe while either sheet covers them and the
        // modal is only visually modal (CLAUDE.md §8, WCAG AA). The nav header
        // is a native toolbar outside this View and is still reachable.
        importantForAccessibility={sheetsOpen || !live ? 'no-hide-descendants' : 'auto'}
        initialNumToRender={initialIndex > 0 ? initialIndex + 1 : DEFAULT_INITIAL_RENDER}
        style={{ flex: 1, opacity: positioned ? 1 : 0 }}
        contentContainerStyle={{
          paddingBottom: listBottomPadding + (barDocked ? RECITATION_BAR_CLEARANCE : 0),
        }}
      />
      </Plate>
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
  initialAyahNumber,
  loadWords,
  loadWordSummary,
  onToggleBookmark,
  onEditNote,
  onToggleAudio,
  onReadingAyah,
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
          surahName={data.surah.name_translit}
          titleStyle={titleStyle}
          mode={readerMode}
          onChangeMode={onChangeReaderMode}
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
    data.surah.id,
    data.surah.name_translit,
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
    setLayers((existing) => [
      ...existing,
      {
        id: layerSeqRef.current,
        mode: readerMode,
        // Where the reader actually is, not where the route opened -- after
        // any scrolling those are different ayahs, and the route param is
        // absent entirely when the reader was opened from the surah list.
        seedAyah: getReaderPosition(data.surah.id) ?? initialAyahNumber ?? null,
      },
    ]);
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
  const revealIncoming = useCallback(() => {
    if (reducedMotion) {
      incoming.value = 1;
      dropSpentLayers();
      return;
    }
    incoming.value = withTiming(1, { duration: MODE_FADE_MS }, (finished?: boolean) => {
      // Only on a settled fade: an interrupted one leaves the incoming layer
      // half-transparent, and dropping the layer under it would show the page
      // through the gap.
      if (finished) runOnJS(dropSpentLayers)();
    });
  }, [reducedMotion, incoming, dropSpentLayers]);

  const incomingStyle = useAnimatedStyle(() => ({ opacity: incoming.value }));

  // Stable no-ops, so a layer that is not driving either one does not get a
  // fresh callback identity on every render of this component.
  const noopLanded = useCallback(() => {}, []);
  const noopScroll = useCallback(() => {}, []);

  const ayahNumberOf = useCallback(
    (word: Word) => data.ayahs.find((item) => item.ayah.id === word.ayah_id)?.ayah.ayah_number,
    [data.ayahs],
  );


  return (
    <View style={{ flex: 1 }}>
      {/* One layer per rendering, and two of them only while a switch is in
          flight. The incoming layer lays out and lands underneath the one the
          reader is looking at, then fades in over it. Nothing blanks, and the
          landing still lands exactly -- see the note on AyahList. */}
      {layers.map((layer, index) => {
        const live = index === layers.length - 1;
        const list = (
          <AyahList
            key={layer.id}
            data={data}
            mode={layer.mode}
            seedAyah={layer.seedAyah}
            live={live}
            onLanded={live && index > 0 ? revealIncoming : noopLanded}
            arriving={index > 0}
            bookmarkedAyahs={bookmarkedAyahs}
            {...(notesByAyah ? { notesByAyah } : {})}
            playingAyah={playingAyah}
            audioEnabled={audioEnabled}
            uiLocale={uiLocale}
            wordsByAyah={wordsByAyah}
            onVisibleAyah={onVisibleAyah}
            {...(onReadingAyah ? { onReadingAyah } : {})}
            onToggleBookmark={onToggleBookmark}
            {...(onEditNote ? { onEditNote } : {})}
            onToggleAudio={onToggleAudio}
            onWordPress={onWordPress}
            onScroll={live ? onScroll : noopScroll}
            headerHeight={headerHeight}
            sheetsOpen={Boolean(openWord) || languageOpen || reciterOpen}
            barDocked={barDocked}
          />
        );
        // The first layer is the page; anything above it is an arrival. It is
        // absolutely positioned so the layer underneath keeps its own layout
        // rather than being pushed out of the column, and untouchable until it
        // has faded in -- a half-transparent list that swallows taps is worse
        // than either mode.
        if (index === 0) return list;
        return (
          <Animated.View
            key={layer.id}
            pointerEvents={live ? 'auto' : 'none'}
            style={[StyleSheet.absoluteFill, incomingStyle]}
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
