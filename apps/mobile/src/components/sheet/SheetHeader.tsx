import { Text, View } from 'react-native';

import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** The heading of a bottom sheet. The only one -- before this, five sheets
 *  carried three different treatments (700 with no size, `typography.body` at
 *  600, and a plain `role="heading"`).
 *
 *  No padding of its own. `BottomSheet` already applies 20 horizontal, 12 top
 *  and a 14 gap between children, and the bodies that added another 16 or 20
 *  were double-padding it. */
export interface SheetHeaderProps {
  title: string;
  /** Context under the title -- the ayah a note belongs to, say. Omitted, no
   *  row is drawn at all. */
  subtitle?: string;
}

export function SheetHeader({ title, subtitle }: SheetHeaderProps) {
  const theme = useThemeColors();

  return (
    <View style={{ gap: 2 }}>
      {/* role="heading" (ARIA-aligned), NOT accessibilityRole="header": the
          latter lands as the banner landmark rather than a heading. Same note
          as EntryHeader and InfoSheet. */}
      <Text role="heading" style={{ color: theme.text, fontSize: typography.body, fontWeight: '700' }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}
