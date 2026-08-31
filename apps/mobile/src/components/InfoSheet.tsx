import { Pressable, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/icons/Icon';
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
      <View style={{ padding: 20, gap: 8 }}>
        {/* 'heading' (ARIA-aligned), not accessibilityRole="header": the
            latter lands as role="header" (the banner landmark) rather than
            the heading role a screen reader needs -- see EntryHeader's
            same note. */}
        <Text role="heading" style={{ color: theme.text, fontSize: typography.body }}>
          {label}
        </Text>
        <Text testID="info-body" style={{ color: theme.mutedText, fontSize: typography.body }}>
          {body}
        </Text>
      </View>
    </BottomSheet>
  );
}
