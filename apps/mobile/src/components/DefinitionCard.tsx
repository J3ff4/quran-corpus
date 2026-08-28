import { Text } from 'react-native';
import { definitionSourceLabel } from '@quran-corpus/data/mobile';
import { ClampedText } from '@/components/ClampedText';
import { GlassSurface } from '@/components/GlassSurface';
import type { UiLocaleCode } from '@/i18n/languages';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface DefinitionCardProps {
  definition: string;
  /** `root_definitions.source`, or `LemmaEntry.root_definition_source`. */
  source: string | null;
  uiLocale: UiLocaleCode;
}

/** One lexicon definition in a card, clamped, with its source credit sharing
 *  the toggle's row.
 *
 *  An unmapped tag prints as itself -- see definitionSources for why a visibly
 *  wrong credit beats a silently uncredited one. This text is third-party
 *  licensed (§11) and must never render bare. */
export function DefinitionCard({ definition, source, uiLocale }: DefinitionCardProps) {
  const theme = useThemeColors();
  const label = source ? definitionSourceLabel(source) : null;

  return (
    <GlassSurface
      testID="definition-card"
      style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 6 }}
    >
      <ClampedText
        uiLocale={uiLocale}
        footer={
          label ? (
            <Text
              testID="definition-source"
              style={{ color: theme.mutedText, fontSize: typography.caption }}
            >
              {label}
            </Text>
          ) : null
        }
      >
        {definition}
      </ClampedText>
    </GlassSurface>
  );
}
