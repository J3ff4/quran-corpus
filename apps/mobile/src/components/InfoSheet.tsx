import { Pressable, Text } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/icons/Icon';
// Direct, not through the sheet barrel: this sheet draws no row and no
// action buttons, and the barrel would pull react-native-svg and reanimated
// in behind them. See the note in sheet/index.ts.
import { SheetHeader } from '@/components/sheet/SheetHeader';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface InfoButtonProps {
  /** Accessible name for the info button, e.g. "About these translations". */
  label: string;
  expanded: boolean;
  onPress: () => void;
}

export interface InfoSheetProps {
  /** The button's label, repeated as the sheet's heading. */
  label: string;
  /** One paragraph. Longer than that belongs on a screen, not in a sheet. */
  body: string;
  uiLocale: UiLocaleCode;
  onClose: () => void;
}

/** The info button that opens {@link InfoSheet}.
 *
 *  Button and sheet are separate components, and the screen owns the open
 *  state, because BottomSheet positions itself with StyleSheet.absoluteFill
 *  and has no Modal or portal: it fills its PARENT, not the window. The button
 *  belongs inline next to the label it annotates -- inside a FlatList header,
 *  on the lemma screen -- and a sheet mounted there would lay out inside that
 *  one short row and scroll away with the list. The sheet has to be a sibling
 *  of the screen's list, which is how WbwScreen mounts WordSheet. */
export function InfoButton({ label, expanded, onPress }: InfoButtonProps) {
  const theme = useThemeColors();

  return (
    <Pressable
      testID="info-button"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={{
        minWidth: touchTargets.compact,
        minHeight: touchTargets.compact,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon testID="icon-info" name="info" color={theme.mutedText} size={20} />
    </Pressable>
  );
}

/** One paragraph in a bottom sheet.
 *
 *  The caveat it holds is the same sentence on all 3,382 lemma pages: as
 *  permanent body text it is noise after the first read, and it pushed the
 *  concordance -- what the reader came for -- further down every visit. Behind
 *  the icon it is one tap away once and costs nothing after. Android's own
 *  pattern for a footnote, and BottomSheet already handles the backdrop, the
 *  back button and drag-to-dismiss. */
export function InfoSheet({ label, body, uiLocale, onClose }: InfoSheetProps) {
  const theme = useThemeColors();

  return (
    <BottomSheet onClose={onClose} closeLabel={t(uiLocale, 'lemma.close')}>
      {/* No padding wrapper: BottomSheet already applies 20/12/28 and a 14
          gap, so the `padding: 20` this carried was a second helping of it.
          SheetHeader also carries the role="heading" note this file used to
          make on its own. */}
      <SheetHeader title={label} />
      <Text testID="info-body" style={{ color: theme.mutedText, fontSize: typography.body }}>
        {body}
      </Text>
    </BottomSheet>
  );
}
