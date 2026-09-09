import { Pressable, StyleSheet, View } from 'react-native';
import { splitBasmala, type MushafLine, type MushafWord } from '@quran-corpus/data/mobile';

import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import {
  ayahKey,
  backgroundForWord,
  colorForWord,
  type HighlightInput,
} from '@/mushaf/highlights';
import { composePage, MUSHAF_LINES_PER_PAGE, type PageSlot } from '@/mushaf/pageComposition';
import { useMushafPageFont } from '@/mushaf/pageFont';
import { mushafFontSize, mushafLineHeight } from '@/mushaf/pageScale';
import { useThemeColors } from '@/theme/themeContext';

import { BismillahLine } from './BismillahLine';
import { MushafLineRow } from './MushafLineRow';
import { PageCorners } from './PageCorners';
import { SurahBand } from './SurahBand';

/** Side margin the text block sits inside, and the strips its furniture owns
 *  at the top and bottom. All three are subtracted before the page is scaled,
 *  so the type never runs into any of them.
 *
 *  The furniture moved into the page's corners in M7d (rulings 8 and 9), but
 *  the space it needs did not change: the same 44dp that was one centred
 *  footer is now a page number in one bottom corner, and the top strip is the
 *  juz and the surah name. */
const PAGE_MARGIN = 16;
const FOOTER_HEIGHT = 44;
const HEADER_HEIGHT = 22;

export interface MushafPageProps {
  page: number;
  /** The page's layout rows. A prop, not a fetch: the pager holds the query
   *  for the three pages it keeps warm, and this stays renderable with no
   *  database behind it. */
  lines: MushafLine[];
  width: number;
  height: number;
  highlights: HighlightInput;
  /** Real Uthmani text per ayah, keyed by `ayahKey`. From the corpus `ayahs`
   *  table, never from the glyph rows: those are private-use codepoints and a
   *  screen reader says nothing useful about them (ruling 12). */
  ayahTexts: Map<string, string>;
  /** Transliterated surah names, by surah id, for the bands on this page. */
  surahNames: Map<number, string>;
  juz: number;
  uiLocale: UiLocaleCode;
  onWordLongPress: (word: MushafWord) => void;
  onWordPressIn: (word: MushafWord) => void;
  onWordPressOut: () => void;
  /** A tap anywhere on the page. Toggles the chrome (ruling 3). */
  onTap: () => void;
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
  highlights,
  ayahTexts,
  surahNames,
  juz,
  uiLocale,
  onWordLongPress,
  onWordPressIn,
  onWordPressOut,
  onTap,
}: MushafPageProps) {
  const theme = useThemeColors();
  const { ready } = useMushafPageFont(page);

  if (!ready) return <View style={{ width, height, backgroundColor: theme.background }} />;

  const fontSize = mushafFontSize(page, width - 2 * PAGE_MARGIN);
  const lineHeight = mushafLineHeight(height - FOOTER_HEIGHT - HEADER_HEIGHT, MUSHAF_LINES_PER_PAGE);
  const color = colorForWord(highlights, theme);
  const background = backgroundForWord(highlights, theme);
  // Keyed by line, then drawn 1..15 rather than iterated: composePage stops at
  // the page's last occupied line, and a short page (the last page of the
  // mushaf, or a page that ends a surah) must still hold the full grid.
  const slots = new Map(composePage(page, lines).map((slot) => [slot.line, slot]));
  const pageLines = Array.from({ length: MUSHAF_LINES_PER_PAGE }, (_, i) => i + 1);

  return (
    <View style={{ width, height, backgroundColor: theme.background }}>
      {/* BEHIND the lines, not over them: an overlay would take the long press
          the words need. The words carry their own tap handler for the same
          reason in reverse -- most of a page is covered in glyphs, and a page
          whose text was deaf to a tap would leave the chrome unreachable
          exactly where the reader is looking. */}
      <Pressable
        testID="mushaf-page-tap"
        accessible={false}
        onPress={onTap}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={{ flex: 1, paddingHorizontal: PAGE_MARGIN, paddingTop: HEADER_HEIGHT }}
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
                  height={lineHeight}
                  width={width - 2 * PAGE_MARGIN}
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
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: FOOTER_HEIGHT }}>
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

      <View style={{ height: FOOTER_HEIGHT }} />
      <PageCorners
        page={page}
        juz={juz}
        surahName={surahNames.get(openingSurahId(lines)) ?? ''}
        uiLocale={uiLocale}
      />
    </View>
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

/** The surah a page opens with -- the one print names in its corner, even on a
 *  page that goes on to head another. */
function openingSurahId(lines: MushafLine[]): number {
  return lines[0]?.words[0]?.surahId ?? 0;
}
