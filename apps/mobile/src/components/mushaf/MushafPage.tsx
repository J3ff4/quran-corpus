import { View } from 'react-native';
import type { MushafLine, MushafWord } from '@quran-corpus/data/mobile';

import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { ayahKey, colorForAyah, type HighlightInput } from '@/mushaf/highlights';
import { composePage, MUSHAF_LINES_PER_PAGE, type PageSlot } from '@/mushaf/pageComposition';
import { useMushafPageFont } from '@/mushaf/pageFont';
import { mushafFontSize, mushafLineHeight } from '@/mushaf/pageScale';
import { useThemeColors } from '@/theme/themeContext';

import { BismillahLine } from './BismillahLine';
import { MushafLineRow } from './MushafLineRow';
import { PageFooter } from './PageFooter';
import { SurahBand } from './SurahBand';

/** Side margin the text block sits inside, and the strip the footer owns.
 *  Both are subtracted before the page is scaled, so the type never runs into
 *  either. */
const PAGE_MARGIN = 16;
const FOOTER_HEIGHT = 44;

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
  onWordPress: (word: MushafWord) => void;
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
  onWordPress,
}: MushafPageProps) {
  const theme = useThemeColors();
  const { ready } = useMushafPageFont(page);

  if (!ready) return <View style={{ width, height, backgroundColor: theme.background }} />;

  const fontSize = mushafFontSize(page, width - 2 * PAGE_MARGIN);
  const lineHeight = mushafLineHeight(height - FOOTER_HEIGHT, MUSHAF_LINES_PER_PAGE);
  const color = colorForAyah(highlights, theme);
  // Keyed by line, then drawn 1..15 rather than iterated: composePage stops at
  // the page's last occupied line, and a short page (the last page of the
  // mushaf, or a page that ends a surah) must still hold the full grid.
  const slots = new Map(composePage(page, lines).map((slot) => [slot.line, slot]));
  const pageLines = Array.from({ length: MUSHAF_LINES_PER_PAGE }, (_, i) => i + 1);

  return (
    <View style={{ width, height, backgroundColor: theme.background }}>
      <View style={{ flex: 1, paddingHorizontal: PAGE_MARGIN }}>
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
                  colorForAyah={color}
                  onWordPress={onWordPress}
                />
              )}
              {slot?.kind === 'header' && (
                <SurahBand surahName={surahNames.get(slot.surahId) ?? ''} height={lineHeight} />
              )}
              {slot?.kind === 'bismillah' && (
                <BismillahLine
                  text={ayahTexts.get(ayahKey(surahOfBismillah(slots, line), 1)) ?? ''}
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
            accessibilityLabel={`${t(uiLocale, 'reader.ayahLabel')} ${ayahNumber}. ${
              ayahTexts.get(ayahKey(surahId, ayahNumber)) ?? ''
            }`}
            style={{ flex: 1 }}
          />
        ))}
      </View>

      <View style={{ height: FOOTER_HEIGHT, justifyContent: 'center' }}>
        <PageFooter page={page} juz={juz} uiLocale={uiLocale} />
      </View>
    </View>
  );
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
