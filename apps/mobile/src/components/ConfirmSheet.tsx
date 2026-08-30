import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** A yes/no sheet for an action that cannot be undone.
 *
 *  A sheet rather than React Native's `Alert`: `Alert` draws the platform's own
 *  dialog -- a white Material card with its own type and its own buttons --
 *  over a glass app, which is the one piece of chrome in M6 that never matched
 *  (§8). Everything modal in this app is a BottomSheet, and this is one more.
 *
 *  Deliberately not a general dialog component: it takes the four strings it
 *  shows and nothing else. A `variant` prop with one variant would be an
 *  abstraction over a single case.
 */
export interface ConfirmSheetProps {
  title: string;
  body: string;
  /** The destructive one. Drawn in `danger`, and placed last, where the
   *  affirmative button goes in every other sheet in the app. */
  confirmLabel: string;
  uiLocale: UiLocaleCode;
  /** A failed write, rendered inside the sheet for the reason NoteEditor's is:
   *  BottomSheet renders into a <Modal>, which is its own native window, so an
   *  alert on the screen underneath is drawn behind the sheet the user is
   *  still looking at and announced to nobody. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const BUTTON = {
  minHeight: touchTargets.minimum,
  paddingHorizontal: 12,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  uiLocale,
  error,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const theme = useThemeColors();

  return (
    <BottomSheet onClose={onCancel} closeLabel={t(uiLocale, 'bookmarks.cancel')}>
      <View style={{ padding: 16, gap: 12 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontWeight: '700' }}>
          {title}
        </Text>
        <Text style={{ color: theme.mutedText }}>{body}</Text>
        {error ? (
          <Text
            testID="confirm-error"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ color: theme.danger }}
          >
            {error}
          </Text>
        ) : null}
        {/* Pressables sized to the 48dp floor, not text runs with padding: a
            padded <Text> here measured about 33dp tall, and the button that
            misses is the one that destroys a note. */}
        <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end' }}>
          <Pressable
            testID="confirm-cancel"
            accessibilityRole="button"
            accessibilityLabel={t(uiLocale, 'bookmarks.cancel')}
            onPress={onCancel}
            style={BUTTON}
          >
            <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'bookmarks.cancel')}</Text>
          </Pressable>
          <Pressable
            testID="confirm-accept"
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
            onPress={onConfirm}
            style={BUTTON}
          >
            <Text style={{ color: theme.danger, fontWeight: '700' }}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}
