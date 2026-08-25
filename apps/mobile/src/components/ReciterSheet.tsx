import { Pressable, Text, View } from 'react-native';
import { RECITERS } from '@quran-corpus/data/mobile';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { BottomSheet } from './BottomSheet';

export interface ReciterSheetProps {
  /** The active `Reciter.id`. */
  current: string;
  uiLocale: UiLocaleCode;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * Reciter picker, reached from the recitation bar's reciter label and from
 * Settings.
 *
 * The list is `RECITERS` itself -- the same table `ayahAudioUrl` validates
 * against -- so the sheet cannot offer an id the URL builder would reject, and
 * there is no second list in `apps/mobile` to drift from it (CLAUDE.md §2).
 *
 * ponytail: no ScrollView. Ten fixed rows fit a phone, and a scrollable body
 * inside BottomSheet would have to be made to cooperate with the sheet's own
 * drag-to-dismiss pan. If a large OS font scale ever pushes the last row off
 * the top, that is the fix: a scroll view plus `simultaneousWithExternalGesture`
 * on the sheet's gesture.
 */
export function ReciterSheet({ current, uiLocale, onSelect, onClose }: ReciterSheetProps) {
  const theme = useThemeColors();

  return (
    <BottomSheet onClose={onClose} closeLabel={t(uiLocale, 'word.close')}>
      <Text
        accessibilityRole="header"
        style={{ color: theme.text, fontSize: typography.body, fontWeight: '600' }}
      >
        {t(uiLocale, 'reader.chooseReciter')}
      </Text>
      <View accessibilityRole="radiogroup">
        {RECITERS.map((reciter) => {
          const selected = reciter.id === current;
          return (
            <Pressable
              key={reciter.id}
              // radio, not button: an exclusive choice, and the role is what
              // tells a screen reader "3 of 10" rather than leaving selection
              // as an afterthought.
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              // The name alone. The bullet below is decorative and would
              // otherwise be announced as a character.
              accessibilityLabel={reciter.label}
              onPress={() => {
                // Guarded: re-selecting the active reciter would re-run the
                // settings write path for a value that has not changed.
                // Closing regardless -- tapping it is a "yes, that one"
                // gesture, not a mistake.
                if (!selected) onSelect(reciter.id);
                onClose();
              }}
              style={{ minHeight: touchTargets.minimum, justifyContent: 'center' }}
            >
              {/* Filled/hollow bullet plus weight, the same convention the
                  Settings screen uses: colour alone as the carrier of "this
                  one is active" fails WCAG 1.4.1. */}
              <Text
                style={{
                  color: selected ? theme.accent : theme.text,
                  fontWeight: selected ? '700' : '400',
                }}
              >
                {selected ? '● ' : '○ '}
                {reciter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}
