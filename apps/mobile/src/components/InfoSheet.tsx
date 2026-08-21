import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface InfoSheetProps {
  /** Accessible name for the ⓘ button, e.g. "About these translations". */
  label: string;
  /** One paragraph. Longer than that belongs on a screen, not in a sheet. */
  body: string;
  uiLocale: UiLocaleCode;
}

/** A ⓘ button that opens one paragraph in a bottom sheet.
 *
 *  The caveat it holds is the same sentence on all 3,382 lemma pages: as
 *  permanent body text it is noise after the first read, and it pushed the
 *  concordance -- what the reader came for -- further down every visit. Behind
 *  the icon it is one tap away once and costs nothing after. Android's own
 *  pattern for a footnote, and BottomSheet already handles the backdrop, the
 *  back button and drag-to-dismiss. */
export function InfoSheet({ label, body, uiLocale }: InfoSheetProps) {
  const theme = useThemeColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        testID="info-button"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={{
          minWidth: touchTargets.compact,
          minHeight: touchTargets.compact,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: theme.mutedText, fontSize: typography.body }}>ⓘ</Text>
      </Pressable>
      {open ? (
        <BottomSheet onClose={() => setOpen(false)} closeLabel={t(uiLocale, 'lemma.close')}>
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
      ) : null}
    </>
  );
}
