import { Text } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { SheetActions, SheetHeader } from '@/components/sheet';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
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
      {/* No padding wrapper here: BottomSheet already applies 20/12/28 and a
          14 gap between children. */}
      <SheetHeader title={title} />
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
      <SheetActions
        cancelLabel={t(uiLocale, 'bookmarks.cancel')}
        onCancel={onCancel}
        confirmLabel={confirmLabel}
        onConfirm={onConfirm}
        tone="danger"
        cancelTestID="confirm-cancel"
        confirmTestID="confirm-accept"
      />
    </BottomSheet>
  );
}
