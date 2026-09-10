import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { WordSummary } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';
import { BottomSheet } from './BottomSheet';
import { GlassSurface } from './GlassSurface';
import { SegmentedWord } from './SegmentedWord';
import { GlossLangTag } from './GlossLangTag';
import { SegmentPill } from './SegmentPill';
import { SheetRow } from './sheet';

export interface WordSheetProps {
  /** null closes the sheet: BottomSheet unmounts, which IS the close. */
  summary: WordSummary | null;
  uiLocale: UiLocaleCode;
  onClose: () => void;
  onOpenDetail: (word: Word) => void;
  onOpenRoot: (rootBuckwalter: string) => void;
  /** The reader's own controls for the ayah this word sits in, already built.
   *  A node rather than the ayah's state and three callbacks: the sheet has no
   *  business knowing what a bookmark is, and the reader already holds every
   *  piece.
   *
   *  This row is why the mushaf page can carry no chrome (ruling 4) -- it is
   *  the only way to bookmark, note or play an ayah while reading print.
   *  Absent where the reader cannot act: the Words screen, and an ayah outside
   *  the reader's own surah. */
  ayahActions?: ReactNode;
  /** Names the ayah the actions act on -- on a mushaf page the tapped word can
   *  be several ayahs away from where the eye is. */
  ayahLabel?: string;
}

/**
 * The word morphology sheet: the tapped word's Arabic, its gloss, one pill per
 * morphological segment, and the two ways deeper into the corpus. The shell
 * around it -- backdrop, motion, drag, back -- is BottomSheet's.
 *
 * **Four blocks, in the order a reader asks for them** (owner, 2026-09-10 --
 * the flat column this replaces read as one undifferentiated list, with the
 * ayah's own controls stranded in the middle of it):
 *
 * 1. the word itself and what it means, centred, as the sheet's subject;
 * 2. its morphology, in a labelled group;
 * 3. the two ways deeper, in a second group, so a tap that leaves the sheet is
 *    visibly a different kind of thing from a chip that does not;
 * 4. the ayah's own actions, last, because they act on the verse rather than
 *    on the word the sheet is about.
 *
 * The groups are <GlassSurface>, which is the card in every other screen. In
 * light mode its fill resolves to the sheet's own surface, so the grouping is
 * carried by the hairline; in dark mode the group also recesses slightly. Both
 * were measured against the pill tints inside them (see posColorFor).
 */
export function WordSheet({
  summary,
  uiLocale,
  onClose,
  onOpenDetail,
  onOpenRoot,
  ayahActions,
  ayahLabel,
}: WordSheetProps) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();

  if (!summary) return null;

  const { word, segments, gloss } = summary;
  const rootBuckwalter = word.root_buckwalter;

  return (
    <BottomSheet onClose={onClose} closeLabel={t(uiLocale, 'word.close')}>
      <View testID="word-hero" style={{ alignItems: 'center', gap: 8 }}>
        <SegmentedWord word={word} segments={segments} fontSize={sizes.title} />
        {/* The tag is nested inside the gloss rather than set beside it so the
            two wrap as one phrase. Safe here where it would not be on an
            Arabic run: nesting Text breaks shaping across the boundary, and a
            gloss is never Arabic. */}
        <Text
          style={{
            color: gloss ? theme.text : theme.mutedText,
            fontSize: typography.body,
            textAlign: 'center',
          }}
        >
          {gloss?.text ?? t(uiLocale, 'word.noGloss')}
          {gloss?.isFallback ? ' ' : ''}
          <GlossLangTag gloss={gloss} uiLocale={uiLocale} fontSize={typography.caption} />
        </Text>
      </View>

      <GlassSurface style={{ padding: 14, gap: 10 }}>
        <Text
          style={{
            color: theme.mutedText,
            fontSize: typography.caption,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
          }}
        >
          {t(uiLocale, 'word.segments')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {segments.map((segment) => (
            <SegmentPill key={segment.id} segment={segment} />
          ))}
        </View>
      </GlassSurface>

      <GlassSurface style={{ padding: 4 }}>
        <SheetRow
          testID="full-analysis"
          label={t(uiLocale, 'word.fullAnalysis')}
          trailingIcon="chevronRight"
          onPress={() => onOpenDetail(word)}
        />
        {rootBuckwalter ? (
          <>
            {/* Inset from both ends, so it reads as a rule between two rows of
                one group rather than as the group's own edge. */}
            <View
              style={{ height: 1, marginHorizontal: 12, backgroundColor: theme.border }}
            />
            <SheetRow
              testID="root-link"
              // Buckwalter is the routing key; the Arabic is only the label,
              // and some rows carry no Arabic root at all.
              label={`${t(uiLocale, 'word.root')} ${word.root ?? rootBuckwalter}`}
              trailingIcon="chevronRight"
              onPress={() => onOpenRoot(rootBuckwalter)}
            />
          </>
        ) : null}
      </GlassSurface>

      {ayahActions ? (
        <View
          testID="word-ayah-actions"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
        >
          <Text style={{ color: theme.mutedText, fontSize: typography.body, flexShrink: 1 }}>
            {ayahLabel ?? ''}
          </Text>
          {ayahActions}
        </View>
      ) : null}
    </BottomSheet>
  );
}
