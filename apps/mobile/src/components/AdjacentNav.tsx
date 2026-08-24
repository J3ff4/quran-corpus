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
  /** Which of the two screens this is: names the controls in tests, and picks
   *  the locale keys for the labels. */
  testIDPrefix?: 'root' | 'lemma';
}

/** Previous/Next between two entries of the same kind. Shared by the root
 *  screen (hijāʾī order) and the lemma screen (frequency-rank order): what the
 *  order is stays the caller's business, but the disabled-at-the-ends rule and
 *  the tap target are the same on both, which is why this is one component and
 *  not two.
 *
 *  The labels are keyed per screen rather than shared, because Russian
 *  inflects them: "Предыдущий" agrees with корень (m.) and "Предыдущая" with
 *  лемма (f.), so one pair of strings cannot serve both. English and Uzbek
 *  carry the same words in both. */
/** Written out per screen rather than built from `testIDPrefix`: a key
 *  assembled at runtime is invisible to the dead-key check in
 *  uiStrings.test.ts, which greps the sources for the literal. */
const LABEL_KEYS = {
  root: { prev: 'root.previous', next: 'root.next' },
  lemma: { prev: 'lemma.previous', next: 'lemma.next' },
} as const;

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
                ? `← ${t(uiLocale, LABEL_KEYS[testIDPrefix].prev)}`
                : `${t(uiLocale, LABEL_KEYS[testIDPrefix].next)} →`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
