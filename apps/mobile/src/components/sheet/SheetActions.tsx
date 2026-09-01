import { Pressable, Text, View } from 'react-native';

import { usePressScaleStyle } from '@/motion/usePressScale';
import { radii, touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** The trailing Cancel/confirm row of a bottom sheet.
 *
 *  Pressables sized to the 48dp floor, never text runs with padding: the
 *  padded <Text> this replaces measured about 33dp, and it was the control
 *  that discarded a typed note. §5 caught it once in ConfirmSheet; NoteEditor
 *  kept the defect because the fix was made in place instead of extracted. */
export interface SheetActionsProps {
  cancelLabel: string;
  onCancel: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  /** 'filled' = accent background (NoteEditor's Save, D53).
   *  'danger'  = danger-coloured text (ConfirmSheet's destructive confirm).
   *  'text'    = plain accent text. */
  tone?: 'filled' | 'danger' | 'text';
  cancelTestID?: string;
  confirmTestID?: string;
}

export function SheetActions({
  cancelLabel,
  onCancel,
  confirmLabel,
  onConfirm,
  tone = 'text',
  cancelTestID,
  confirmTestID,
}: SheetActionsProps) {
  const theme = useThemeColors();
  const pressStyle = usePressScaleStyle();

  const button = {
    minHeight: touchTargets.minimum,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.chip,
  } as const;

  const confirmColor = tone === 'danger' ? theme.danger : tone === 'filled' ? theme.onAccent : theme.accent;

  return (
    <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
      <Pressable
        testID={cancelTestID}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        onPress={onCancel}
        style={(state) => [button, pressStyle(state)]}
      >
        <Text style={{ color: theme.mutedText }}>{cancelLabel}</Text>
      </Pressable>
      <Pressable
        testID={confirmTestID}
        accessibilityRole="button"
        accessibilityLabel={confirmLabel}
        onPress={onConfirm}
        style={(state) => [
          button,
          // Filled only where the sheet asked for it. `danger` stays type, not
          // a block -- see the test's note.
          tone === 'filled' ? { backgroundColor: theme.accent } : null,
          pressStyle(state),
        ]}
      >
        <Text style={{ color: confirmColor, fontWeight: '700' }}>{confirmLabel}</Text>
      </Pressable>
    </View>
  );
}
