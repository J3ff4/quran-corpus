import { Pressable, Text, View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { WordSummary } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';
import { BottomSheet } from './BottomSheet';
import { SegmentedWord } from './SegmentedWord';
import { GlossLangTag } from './GlossLangTag';
import { SegmentPill } from './SegmentPill';

const actionStyle = {
  minHeight: touchTargets.minimum,
  justifyContent: 'center',
} as const;

export interface WordSheetProps {
  /** null closes the sheet: BottomSheet unmounts, which IS the close. */
  summary: WordSummary | null;
  uiLocale: UiLocaleCode;
  onClose: () => void;
  onOpenDetail: (word: Word) => void;
  onOpenRoot: (rootBuckwalter: string) => void;
}

/**
 * The word morphology sheet: the tapped word's Arabic, its gloss, one pill per
 * morphological segment, and the two ways deeper into the corpus. The shell
 * around it -- backdrop, motion, drag, back -- is BottomSheet's.
 */
export function WordSheet({ summary, uiLocale, onClose, onOpenDetail, onOpenRoot }: WordSheetProps) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();

  if (!summary) return null;

  const { word, segments, gloss } = summary;
  const rootBuckwalter = word.root_buckwalter;

  return (
    <BottomSheet onClose={onClose} closeLabel={t(uiLocale, 'word.close')}>
      <SegmentedWord word={word} segments={segments} fontSize={sizes.title} />
      {/* The tag is nested inside the gloss rather than set beside it so the two
          wrap as one phrase. Safe here where it would not be on an Arabic run:
          nesting Text breaks shaping across the boundary, and a gloss is never
          Arabic. */}
      <Text style={{ color: gloss ? theme.text : theme.mutedText, fontSize: typography.body }}>
        {gloss?.text ?? t(uiLocale, 'word.noGloss')}
        {gloss?.isFallback ? ' ' : ''}
        <GlossLangTag gloss={gloss} uiLocale={uiLocale} fontSize={typography.caption} />

      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {segments.map((segment) => (
          <SegmentPill key={segment.id} segment={segment} />
        ))}
      </View>
      <Pressable
        testID="full-analysis"
        accessibilityRole="button"
        onPress={() => onOpenDetail(word)}
        style={actionStyle}
      >
        <Text style={{ color: theme.accent, fontSize: typography.body }}>
          {t(uiLocale, 'word.fullAnalysis')}
        </Text>
      </Pressable>
      {rootBuckwalter ? (
        <Pressable
          testID="root-link"
          accessibilityRole="button"
          onPress={() => onOpenRoot(rootBuckwalter)}
          style={actionStyle}
        >
          <Text style={{ color: theme.accent, fontSize: typography.body }}>
            {/* Buckwalter is the routing key; the Arabic is only the label,
                and some rows carry no Arabic root at all. */}
            {`${t(uiLocale, 'word.root')} ${word.root ?? rootBuckwalter}`}
          </Text>
        </Pressable>
      ) : null}
    </BottomSheet>
  );
}
