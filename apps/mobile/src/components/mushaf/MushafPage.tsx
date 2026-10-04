import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { splitBasmala, type MushafLine, type MushafWord } from '@quran-corpus/data/mobile';

import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import {
  ayahKey,
  backgroundForWord,
  colorForWord,
  type HighlightInput,
  type PressedWord,
} from '@/mushaf/highlights';
import { composePage, MUSHAF_LINES_PER_PAGE, type PageSlot } from '@/mushaf/pageComposition';
import { useMushafPageFont } from '@/mushaf/pageFont';
import {
  MUSHAF_PAGE_FOOTER_HEIGHT,
  MUSHAF_PAGE_TEXT_INSET,
  mushafColumnForFontSize,
  mushafFontSize,
  mushafLineFitFontSize,
  mushafLineHeight,
  mushafPageFontSize,
} from '@/mushaf/pageScale';
import { useThemeColors } from '@/theme/themeContext';

import { BismillahLine } from './BismillahLine';
import { KhatmRibbon } from './KhatmRibbon';
import { MushafLineRow } from './MushafLineRow';
import { PageCorners } from './PageCorners';
import { SurahBand } from './SurahBand';

// The page's own header strip is gone: MushafTopStrip prints the surah and the
// juz above the leaf now, in the band the tabs layout was already reserving for
// the status bar. Kept as a named 0 rather than deleted from the scale
// arithmetic, so what the page reserves stays legible in one place.
const HEADER_HEIGHT = 0;

export interface MushafPageProps {
  page: number;
  /** The page's layout rows. A prop, not a fetch: the pager holds the query
   *  for the three pages it keeps warm, and this stays renderable with no
   *  database behind it. */
  lines: MushafLine[];
  width: number;
  height: number;
  /** One type size for both halves of a leaf, when a leaf decided it.
   *
   *  Omitted in portrait, where a page is alone and fits itself. On a spread
   *  the two pages sit in identical halves, and each one's own fit comes from
   *  its own widest line -- so left to themselves facing pages draw at
   *  different sizes, which reads as a rendering bug. See mushafLeafFontSize. */
  fontSize?: number;
  highlights: HighlightInput;
  /** Real Uthmani text per ayah, keyed by `ayahKey`. From the corpus `ayahs`
   *  table, never from the glyph rows: those are private-use codepoints and a
   *  screen reader says nothing useful about them (ruling 12). */
  ayahTexts: Map<string, string>;
  /** Transliterated surah names, by surah id, for the bands on this page. */
  surahNames: Map<number, string>;
  uiLocale: UiLocaleCode;
  onWordLongPress: (word: MushafWord) => void;
  /** A tap anywhere on the page. Toggles the chrome (ruling 3). */
  onTap: () => void;
  /** A prop, not `useReducedMotion()` read here: that hook reaches the settings
   *  store, and a page is rendered by suites that mock neither. The reader
   *  already holds the value, and it changes only when the device setting does
   *  -- so it costs the pager nothing to pass a stable boolean down. */
  reduceMotion: boolean;
}

/** The ayahs this page touches, in mushaf order, deduplicated. */
function ayahsOnPage(lines: MushafLine[]): { surahId: number; ayahNumber: number }[] {
  const seen = new Set<string>();
  const ayahs: { surahId: number; ayahNumber: number }[] = [];
  for (const line of lines) {
    for (const word of line.words) {
      const key = ayahKey(word.surahId, word.ayahNumber);
      if (seen.has(key)) continue;
      seen.add(key);
      ayahs.push({ surahId: word.surahId, ayahNumber: word.ayahNumber });
    }
  }
  return ayahs;
}

/**
 * One page of the mushaf: its 15 line slots, its chrome, and its footer.
 *
 * **Nothing is drawn until the page's font is registered.** A page drawn early
 * renders QCF private-use codepoints in the system face, which looks like
 * ordinary Arabic and is not the Qur'an -- the worst failure this phase can
 * ship, and the one that survives a screenshot review. Blank is the safe state.
 */
export function MushafPage({
  page,
  lines,
  width,
  height,
  fontSize: leafFontSize,
  highlights,
  ayahTexts,
  surahNames,
  uiLocale,
  onWordLongPress,
  onTap,
  reduceMotion,
}: MushafPageProps) {
  const theme = useThemeColors();
  const { ready } = useMushafPageFont(page);
  // The word under a finger on THIS page, held here rather than by the reader.
  // Up there it was one piece of state above the pager, so a finger touching
  // down re-rendered the reader, the pager and all three mounted pages -- and
  // a swipe begins with a finger touching down on a word. Three page renders
  // and three more on the press-out, both inside the first frames of the
  // gesture, are what made the turn feel heavy (owner, 2026-09-10). A page can
  // only ever hold a press on one of its own words, so it is the page's state.
  // The scroll steals the responder as soon as the swipe moves, which fires
  // the press-out and clears the wash.
  const [pressed, setPressed] = useState<PressedWord | null>(null);
  const onWordPressIn = useCallback((word: MushafWord) => {
    setPressed({ surahId: word.surahId, ayahNumber: word.ayahNumber, position: word.position });
  }, []);
  const onWordPressOut = useCallback(() => setPressed(null), []);

  if (!ready) return <View style={{ width, height, backgroundColor: theme.background }} />;

  // Not the full width: past a certain column the font clamps and the
  // pre-justified lines can no longer reach the edge, which leaves the page
  // stranded against one side. The column is built for the size the page draws
  // at, so it is the widest column this page can still fill, and the block is
  // centred in whatever is left.
  //
  // With a leaf size only what the size is WANTED at changes: a leaf hands both
  // halves one, where a lone page asks for its own fit. Either way the column is
  // built for that size and clamped to the box, and the size then comes back out
  // of the column -- `mushafColumnForFontSize` is the exact inverse of
  // `mushafFontSize`, so a column built for 31.4dp reads back as 31.4dp, and in
  // the one case where it cannot (a size too large for the box, which the clamp
  // cuts) reading it back is what keeps the line inside the column instead of
  // drawing it at a size the column cannot hold.
  //
  // Fitted to the line box as well as to the width, and fitted to the page's own
  // INK rather than to its em.
  //
  // `Math.min(size, lineHeight)` was the old guard, which only ever asked for a
  // ratio of 1.0 -- and these lines need 1.45 to 2.21em depending on what is
  // stacked above and below their letters. The surplus does not vanish: RN's
  // half-leading hands it back as overhang above and below the line, where it
  // collides with the neighbouring line's own overhang and takes the harakat
  // with it. On the tablet in landscape the width fits 40dp into a 49.9dp line
  // box that holds 24 to 34, and every top edge lost its marks (owner,
  // 2026-10-02; the Fold open is the same short-and-wide shape).
  //
  // Both halves of a leaf are given the same height, so one line box binds both
  // and the leaf keeps its single size.
  const available = width - MUSHAF_PAGE_TEXT_INSET;
  const lineHeight = mushafLineHeight(height - MUSHAF_PAGE_FOOTER_HEIGHT - HEADER_HEIGHT, MUSHAF_LINES_PER_PAGE);
  const wanted = Math.min(
    leafFontSize ?? mushafPageFontSize(page, available),
    mushafLineFitFontSize(page, lineHeight),
  );
  const columnWidth = Math.min(available, mushafColumnForFontSize(page, wanted));
  const fontSize = mushafFontSize(page, columnWidth);
  const marks: HighlightInput = pressed === null ? highlights : { ...highlights, pressed };
  const color = colorForWord(marks, theme);
  const background = backgroundForWord(marks, theme);
  // Keyed by line, then drawn 1..15 rather than iterated: composePage stops at
  // the page's last occupied line, and a short page (the last page of the
  // mushaf, or a page that ends a surah) must still hold the full grid.
  const slots = new Map(composePage(page, lines).map((slot) => [slot.line, slot]));
  // Pages 1 and 2 are the only two the layout does not fill: al-Fatiha occupies
  // lines 2-8 and al-Baqarah's opening 3-8. Drawn on the full 15-line grid they
  // sat in the top half of the screen with half a page of blank paper beneath.
  // The printed mushaf centres both inside their frame, so here the grid is the
  // occupied block and the page centres that -- the line rhythm stays every
  // other page's, which is what makes the whole thing read as one book.
  const centred = page <= 2 && slots.size > 0;
  const firstLine = centred ? Math.min(...slots.keys()) : 1;
  const lastLine = centred ? Math.max(...slots.keys()) : MUSHAF_LINES_PER_PAGE;
  const pageLines = Array.from({ length: lastLine - firstLine + 1 }, (_, i) => firstLine + i);

  return (
    // AROUND the lines, not behind them and not over them. Over them it would
    // take the long press the words need. Behind them -- which is where it was
    // -- it received almost nothing: a touch that lands on a line slot is
    // claimed by that slot's own View and bubbles up its React ANCESTORS, and a
    // sibling painted underneath is not one of those. Only the glyphs, which
    // carry their own handler, brought the chrome back. As the ancestor it gets
    // every touch no child claimed, which is the whole page minus the words.
    <Pressable
      testID="mushaf-page-tap"
      accessible={false}
      onPress={onTap}
      // The page is held as GPU pixels rather than re-drawn every frame.
      //
      // A page carries ~150 whole-word QCF glyphs at ~90x100 device pixels
      // each -- far more than fits in Skia's glyph atlas, so the atlas evicted
      // and re-uploaded every glyph on every frame. Measured on device
      // (2026-09-10): 146 `Texture upload` slices per frame while swiping, a
      // 32ms median frame against an 11ms budget at 90Hz, 100% janky frames,
      // with the GPU itself idle at 2ms. A page turn was therefore drawing at
      // ~25fps whatever the pager did, which is what the owner compared
      // against Ayah. Rasterised once into a hardware layer, a turn is a blit.
      renderToHardwareTextureAndroid
      style={{ width, height, backgroundColor: theme.background }}
    >
      {/* Absolute, so it hangs in the corner without entering the line grid's
          flex flow. Inside the Pressable rather than beside it: the page is
          what gets rasterised into the hardware layer, and a ribbon painted
          outside that layer would re-draw on every frame of a turn. */}
      <KhatmRibbon marked={highlights.khatmPage === page} reduceMotion={reduceMotion} />
      <View
        style={{
          flex: 1,
          width: columnWidth,
          alignSelf: 'center',
          paddingTop: HEADER_HEIGHT,
          justifyContent: centred ? 'center' : 'flex-start',
        }}
        pointerEvents="box-none"
      >
        {pageLines.map((line) => {
          const slot = slots.get(line);
          return (
            // Every slot gets a box of exactly one line, blanks and the lines
            // past the end of a short page included: the grid is what makes a
            // page a page, and lines stretched to fill the height would not be
            // one.
            <View
              key={line}
              testID="mushaf-line-slot"
              style={{ height: lineHeight, justifyContent: 'center' }}
            >
              {slot?.kind === 'words' && (
                <MushafLineRow
                  page={page}
                  words={slot.words}
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                  colorForWord={color}
                  backgroundForWord={background}
                  onWordLongPress={onWordLongPress}
                  onWordPressIn={onWordPressIn}
                  onWordPressOut={onWordPressOut}
                  onTap={onTap}
                />
              )}
              {slot?.kind === 'header' && (
                <SurahBand
                  surahName={surahNames.get(slot.surahId) ?? ''}
                  surahId={slot.surahId}
                  height={lineHeight}
                  width={columnWidth}
                />
              )}
              {slot?.kind === 'bismillah' && (
                <BismillahLine
                  text={bismillahText(ayahTexts, surahOfBismillah(slots, line))}
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                  uiLocale={uiLocale}
                />
              )}
            </View>
          );
        })}
      </View>

      {/* TalkBack reads this, not the lines: the glyphs are private-use
          codepoints. One focusable band per ayah, in mushaf order, laid over
          the page and taking no touches -- the words underneath keep theirs. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: MUSHAF_PAGE_FOOTER_HEIGHT }}>
        {ayahsOnPage(lines).map(({ surahId, ayahNumber }) => (
          <View
            key={ayahKey(surahId, ayahNumber)}
            accessible
            // The surah too, and not only on the 51 pages that hold two: a
            // page is not a surah, so "Ayah 1" alone names nothing a listener
            // can place, and on a shared page it is announced twice.
            accessibilityLabel={`${surahNames.get(surahId) ?? ''} ${t(
              uiLocale,
              'reader.ayahLabel',
            )} ${ayahNumber}. ${ayahTexts.get(ayahKey(surahId, ayahNumber)) ?? ''}`.trim()}
            style={{ flex: 1 }}
          />
        ))}
      </View>

      <View style={{ height: MUSHAF_PAGE_FOOTER_HEIGHT }} />
      <PageCorners page={page} uiLocale={uiLocale} />
    </Pressable>
  );
}

/** The basmala a surah's own ayah 1 spells, and nothing else of that ayah.
 *
 *  `ayahs.text_uthmani` for an ayah 1 carries the basmala AND the ayah that
 *  follows it, so handing the row straight to the line drew the opening words
 *  of the surah on the bismillah line -- ellipsised, since it does not fit.
 *  The split is the corpus's own (95:1 and 97:1 spell it with a shadda), and a
 *  row that does not start with one draws nothing rather than a wrong line. */
function bismillahText(ayahTexts: Map<string, string>, surahId: number): string {
  const ayahOne = ayahTexts.get(ayahKey(surahId, 1));
  if (ayahOne === undefined) return '';
  return splitBasmala(ayahOne, { surahId, ayahNumber: 1 }).basmala ?? '';
}

/** The surah a bismillah line belongs to: the band above it names it, and on
 *  the 18 pages whose band sits on the previous page there is no band here --
 *  the first words below it do. */
function surahOfBismillah(slots: Map<number, PageSlot>, line: number): number {
  const above = slots.get(line - 1);
  if (above?.kind === 'header') return above.surahId;
  // No band above: this is one of the 18 pages whose band sits on the previous
  // page, so the surah is named by the first words below the bismillah.
  for (let next = line + 1; next <= MUSHAF_LINES_PER_PAGE; next += 1) {
    const below = slots.get(next);
    if (below?.kind === 'words') return below.words[0]?.surahId ?? 0;
  }
  return 0;
}


