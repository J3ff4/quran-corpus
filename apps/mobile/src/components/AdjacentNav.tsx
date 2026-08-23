import { Pressable, Text, View } from 'react-native';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface AdjacentNavProps {
  prev: string | null;
  next: string | null;
  /** Called with the non-null target of whichever side was pressed. */
  onNavigate: (target: string) => void;
  /** Names the toolbar for TalkBack: 'root.adjacent' or 'lemma.adjacent'. */
  label: string;
  uiLocale: UiLocaleCode;
  /** Distinguishes the two screens' controls in tests. */
  testIDPrefix?: string;
}

/** Previous/Next between two entries of the same kind. Shared by the root
 *  screen (hijāʾī order) and the lemma screen (frequency-rank order): what the
 *  order is stays the caller's business, but the disabled-at-the-ends rule and
 *  the tap target are the same on both, which is why this is one component and
 *  not two.
 *
 *  'root.previous' / 'root.next' are reused verbatim on the lemma screen --
 *  they are the bare words "Previous"/"Next" in all three locales, the same
 *  way 'word.root' is already reused across screens. */
export function AdjacentNav({
  prev,
  next,
  onNavigate,
  label,
  uiLocale,
  testIDPrefix = 'root',
}: AdjacentNavProps) {
  const theme = useThemeColors();

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}
    >
      {(['prev', 'next'] as const).map((side) => {
        const target = side === 'prev' ? prev : next;
        return (
          <Pressable
            key={side}
            testID={side === 'prev' ? `${testIDPrefix}-previous` : `${testIDPrefix}-next`}
            accessibilityRole="button"
            // Disabled, not hidden: an arrow that vanishes at the ends of the
            // list slides the other one under the thumb, and TalkBack is left
            // with nothing to announce where a control used to be.
            accessibilityState={{ disabled: target === null }}
            disabled={target === null}
            onPress={target ? () => onNavigate(target) : undefined}
            style={{
              minHeight: touchTargets.compact,
              justifyContent: 'center',
              paddingHorizontal: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.border,
              opacity: target === null ? 0.4 : 1,
            }}
          >
            <Text style={{ color: target === null ? theme.mutedText : theme.text }}>
              {side === 'prev'
                ? `← ${t(uiLocale, 'root.previous')}`
                : `${t(uiLocale, 'root.next')} →`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
