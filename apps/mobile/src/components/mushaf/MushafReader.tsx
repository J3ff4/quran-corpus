import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { MUSHAF_PAGE_MAX, MUSHAF_PAGE_MIN, type MushafWord } from '@quran-corpus/data/mobile';
import type { MobileDataClient } from '@quran-corpus/mobile-data';

import type { UiLocaleCode } from '@/i18n/languages';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { ayahKey, type HighlightInput } from '@/mushaf/highlights';
import { HighlightsProvider } from '@/mushaf/highlightsContext';
import { useMushafAyahs, type MushafIndex } from '@/mushaf/mushafReaderData';
import { useMushafPageFont } from '@/mushaf/pageFont';
import { spreadFor } from '@/mushaf/spread';
import { useThemeColors } from '@/theme/themeContext';

import { MushafPager } from './MushafPager';

/** How long the landing pulse takes to fade, and in how many steps.
 *
 *  Steps rather than a spring on the UI thread: the colour is resolved in JS
 *  per word, so every frame of a real spring would re-render three mounted
 *  pages. Six steps over ~900ms reads as a fade on a colour that is already
 *  subtle, and costs six renders instead of fifty-four.
 *  ponytail: if it ever reads as steppy, drive it from a shared value and move
 *  the colour into an animated style -- that is a rewrite of MushafLineRow. */
const PULSE_HOLD_MS = 400;
const PULSE_STEP_MS = 150;
const PULSE_STEPS = [0.8, 0.6, 0.4, 0.2, 0];

/** The last surah, so the final pages know where their range ends. A fact
 *  about the mushaf, like MUSHAF_PAGE_MAX beside it, and not something the
 *  loaded index can answer: page 604 opens with al-Ikhlas and the index has no
 *  page after it to name an-Nas. */
const LAST_SURAH_ID = 114;

export interface MushafReaderProps {
  client: MobileDataClient | null;
  index: MushafIndex;
  /** The page the reader opens on. Captured at mount: after that the pager
   *  owns where it is, and re-seeding it would drag the reader back. */
  initialPage: number;
  /** The ayah a deep link asked for, pulsed once on arrival (ruling 17). */
  landingAyah: { surahId: number; ayahNumber: number } | null;
  /** `surah:ayah` keys, from the reader's bookmark map. */
  bookmarkedKeys: ReadonlySet<string>;
  /** The khatm-marked page, or null. Travels inside `highlights` from here --
   *  see HighlightsProvider for why it is not a pager prop. */
  khatmPage: number | null;
  playingAyah: { surahId: number; ayahNumber: number } | null;
  /** The page the recitation has moved onto, or null. */
  focusPage: number | null;
  uiLocale: UiLocaleCode;
  onPageChange: (page: number) => void;
  /** A word was long-pressed, which is what opens the sheet since M7d (ruling
   *  4). Both the layout word and its ayah's row id: the row id is what a word
   *  loader takes, and the word carries the surah and ayah number that a page
   *  -- unlike a surah reader -- cannot assume. */
  onWordPress: (word: MushafWord, ayahId: number) => void;
  /** A tap on the page. Toggles the chrome, and nothing else (ruling 3). */
  onTap: () => void;
  /** The first page's font is registered, so there is something to show. The
   *  reader cross-fades on this exactly as it does for the ayah list. */
  onLanded: () => void;
}

/**
 * The mushaf half of the reader: the pager, and everything it has to be told
 * about pages the reader was not opened on.
 *
 * A page is not a surah (ruling 10). Its bands, its bismillah lines and its
 * TalkBack labels can all belong to a surah the route never named, so the
 * texts are fetched for the surahs on screen rather than taken from the
 * reader's own payload.
 *
 * **Two facing pages when the box is wider than it is tall** (ruling R-B2). Off
 * the MEASURED box, not a window class or `useWindowDimensions`: the pager sits
 * under the status bar, MushafTopStrip and the tab bar, so the window is taller
 * than the box by all three and near square the two disagree -- a 1000x1050
 * window is portrait while the box inside it is landscape. The box is what the
 * spread has to fit, and this component is the only thing that measures it
 * (ruling R-X1).
 */
export function MushafReader({
  client,
  index,
  initialPage,
  landingAyah,
  bookmarkedKeys,
  khatmPage,
  playingAyah,
  focusPage,
  uiLocale,
  onPageChange,
  onWordPress,
  onTap,
  onLanded,
}: MushafReaderProps) {
  const theme = useThemeColors();
  const reducedMotion = useReducedMotion();
  const [page, setPage] = useState(initialPage);
  // Measured rather than taken from the window: the pager sits under the
  // reader's own header, and a page sized to the window would push its footer
  // off the bottom of the screen.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  // Two facing pages, when the box is wider than it is tall. See the docstring:
  // the box is measured here and nowhere else, so this is the only place that
  // can answer the question.
  const spread = size !== null && size.width > size.height;

  // The surahs whose ayah rows the pages on screen can need. Four pages, not
  // one: a surah that starts halfway down page N is the *opening* surah of
  // page N + 1, so a window that stops at the page being read has no text for
  // the bismillah it is about to draw.
  //
  // A *range*, not each page's opening surah: a page can hold surahs its own
  // row never names. Page 604 opens with al-Ikhlas and then heads al-Falaq and
  // an-Nas, and the device run drew both of their bismillah lines empty. The
  // surahs on a page run from the surah it opens with to the one the page
  // after it opens with, so the window's range covers every band and bismillah
  // inside it.
  //
  // One page wider either side on a spread: the pager draws a leaf either side
  // of the one on screen, so the drawn pages run from recto - 2 to recto + 3
  // rather than from page - 1 to page + 1.
  const surahIds = useMemo(() => {
    const back = spread ? 2 : 1;
    const forward = spread ? 4 : 3;
    // Measured from the leaf's RECTO, not from `page`. `page` is whichever half
    // was last reported -- the opening page, or the half the recitation moved
    // onto -- and on an even one the window would sit a page off the leaf that
    // is drawn: opening in landscape on page 4 would range from page 2 while
    // the pager draws 1..6, leaving the first drawn page outside the fetched
    // surahs. That is not a blank page but something worse -- a page that draws
    // its words and leaves its band and its bismillah line empty.
    const anchor =
      spread && page >= MUSHAF_PAGE_MIN && page <= MUSHAF_PAGE_MAX ? spreadFor(page).recto : page;
    const first =
      index.pages.get(anchor - back)?.startSurahId ?? index.pages.get(anchor)?.startSurahId;
    if (first === undefined) return [];
    // One past the window: the last window page runs up to whatever the next
    // page opens with, and past the end of the mushaf that is the last surah.
    const last = index.pages.get(anchor + forward)?.startSurahId ?? LAST_SURAH_ID;
    const ids: number[] = [];
    for (let surahId = first; surahId <= Math.max(first, last); surahId += 1) ids.push(surahId);
    return ids;
  }, [index.pages, page, spread]);
  const ayahs = useMushafAyahs(client, surahIds);

  const ayahTexts = useMemo(() => {
    const texts = new Map<string, string>();
    for (const [key, ayah] of ayahs) texts.set(key, ayah.text_uthmani);
    return texts;
  }, [ayahs]);

  const landingKey = landingAyah ? ayahKey(landingAyah.surahId, landingAyah.ayahNumber) : null;
  const [pulse, setPulse] = useState(landingKey ? 1 : 0);
  useEffect(() => {
    if (!landingKey) {
      setPulse(0);
      return;
    }
    setPulse(1);
    if (reducedMotion) {
      // The setting is a standing instruction not to animate, and ruling 24
      // exempts the page turn only. The mark still appears and still goes --
      // it just does not fade.
      const cut = setTimeout(() => setPulse(0), PULSE_HOLD_MS + PULSE_STEPS.length * PULSE_STEP_MS);
      return () => clearTimeout(cut);
    }
    const timers = PULSE_STEPS.map((value, step) =>
      setTimeout(() => setPulse(value), PULSE_HOLD_MS + step * PULSE_STEP_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [landingKey, reducedMotion]);

  const highlights: HighlightInput = useMemo(
    () => ({
      bookmarked: bookmarkedKeys,
      landing: pulse > 0 ? landingKey : null,
      playing: playingAyah ? ayahKey(playingAyah.surahId, playingAyah.ayahNumber) : null,
      landingProgress: pulse,
      // The page owns the press wash; see MushafPage. Nothing above the pager
      // knows about it, which is the point -- a touch must not re-render the
      // two pages the reader is not touching.
      pressed: null,
      khatmPage,
    }),
    [bookmarkedKeys, landingKey, playingAyah, pulse, khatmPage],
  );

  // The reader is cross-fading onto this, and a page whose font has not landed
  // draws its paper ground and nothing else -- fading to that is the blank the
  // layering exists to remove.
  const { ready, error } = useMushafPageFont(initialPage);
  useEffect(() => {
    // On the error too: a page that will never draw must not hold the outgoing
    // rendering on screen for ever.
    if (ready || error) onLanded();
  }, [ready, error, onLanded]);

  const onListPageChange = useCallback(
    (next: number) => {
      setPage(next);
      onPageChange(next);
    },
    [onPageChange],
  );

  const onPagerWordLongPress = useCallback(
    (word: MushafWord) => {
      const ayah = ayahs.get(ayahKey(word.surahId, word.ayahNumber));
      // No row means the surah's ayahs have not arrived yet. Nothing opens,
      // rather than a sheet that names the wrong word.
      if (!ayah) return;
      onWordPress(word, ayah.id);
    },
    [ayahs, onWordPress],
  );

  return (
    <View
      testID="mushaf-reader"
      style={{ flex: 1, backgroundColor: theme.background }}
      onLayout={(event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((current) =>
          current?.width === width && current.height === height ? current : { width, height },
        );
      }}
    >
      {size && size.height > 0 ? (
        <HighlightsProvider value={highlights}>
        <MushafPager
          client={client}
          initialPage={initialPage}
          width={size.width}
          height={size.height}
          spread={spread}
          ayahTexts={ayahTexts}
          surahNames={index.surahNames}
          uiLocale={uiLocale}
          focusPage={focusPage}
          onPageChange={onListPageChange}
          onWordLongPress={onPagerWordLongPress}
          onTap={onTap}
          reduceMotion={reducedMotion}
        />
        </HighlightsProvider>
      ) : null}
    </View>
  );
}
