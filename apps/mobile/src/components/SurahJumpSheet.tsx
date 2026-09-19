import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { SheetActions, SheetHeader, SheetRow } from '@/components/sheet';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** There are 114 surahs. A fact about the mushaf, not about what is loaded. */
const SURAH_MAX = 114;

/** Digits only, an integer, inside 1..max. Anything else -- a decimal, a sign,
 *  whitespace, Eastern Arabic numerals, 115 -- is null, and the sheet says so
 *  rather than handing it on. Same contract as the mushaf's parseJumpTarget;
 *  the ceiling is a parameter because it is per-surah here (§3 OWASP: reject
 *  at the boundary rather than pass through and clamp downstream). */
export function parseSurahJump(raw: string, max: number): number | null {
  if (!/^\d{1,3}$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value >= 1 && value <= max ? value : null;
}

export interface SurahJumpSheetProps {
  uiLocale: UiLocaleCode;
  /** Where the reader is now -- seeds the field. */
  surahId: number;
  /** Null = not loaded yet, never "no ayahs". See useSurahAyahCounts. */
  ayahCountOf: (surahId: number) => number | null;
  onClose: () => void;
  onJump: (surahId: number, ayahNumber: number) => void;
  /** Opens the surah picker. Optional, and absent means no row at all: a
   *  caller with no picker mounted would otherwise draw a dead control. */
  onBrowse?: (() => void) | undefined;
}

/** Go to any surah and ayah (owner rulings S2-S4). Opened by tapping the surah
 *  name in the reader and morphology headers -- no button of its own. */
export function SurahJumpSheet({
  uiLocale,
  surahId,
  ayahCountOf,
  onClose,
  onJump,
  onBrowse,
}: SurahJumpSheetProps) {
  const theme = useThemeColors();
  const [surahRaw, setSurahRaw] = useState(String(surahId));
  const [ayahRaw, setAyahRaw] = useState('1');
  const [rejected, setRejected] = useState(false);

  // The ceiling of the surah BEING TYPED, not of the one the sheet opened on:
  // seeded in al-Fatihah, every ayah past 7 would otherwise be rejected
  // whatever surah the reader asked for.
  const typedSurah = parseSurahJump(surahRaw, SURAH_MAX);
  const ayahMax = typedSurah === null ? null : ayahCountOf(typedSurah);
  // Nothing to check the ayah against until the counts land, so the field is
  // disabled at 1 and the jump goes to the head of the surah.
  const ayahKnown = ayahCountOf(surahId) !== null;

  const submit = () => {
    const surah = typedSurah;
    const ayah = surah === null ? null : parseSurahJump(ayahRaw, ayahMax ?? 1);
    if (surah === null || ayah === null) {
      setRejected(true);
      return;
    }
    onJump(surah, ayah);
  };

  const field = (rejectedField: boolean) => ({
    minHeight: touchTargets.minimum,
    borderRadius: radii.chip,
    borderWidth: 1,
    borderColor: rejectedField ? theme.danger : theme.border,
    paddingHorizontal: 14,
    color: theme.text,
    fontSize: typography.body,
  });

  // Above the field, not only inside it. Two bare boxes reading "1-114" and
  // "1-286" do not say which is which, and the placeholder -- the only thing
  // that ever did -- is gone the moment a digit is typed (owner, 2026-09-19).
  //
  // importantForAccessibility="no": each field already carries its name AND
  // its range in `accessibilityLabel`, so an announced label here would say
  // "Surah" twice before the range.
  const label = (text: string) => (
    <Text
      importantForAccessibility="no"
      style={{ color: theme.mutedText, fontSize: typography.caption, marginBottom: 6 }}
    >
      {text}
    </Text>
  );

  return (
    <BottomSheet onClose={onClose} closeLabel={t(uiLocale, 'word.close')}>
      <SheetHeader title={t(uiLocale, 'jump.surahTitle')} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          {label(t(uiLocale, 'jump.surah'))}
          <TextInput
            testID="surah-jump-input"
            value={surahRaw}
            onChangeText={(next) => {
              setSurahRaw(next);
              setRejected(false);
            }}
            onSubmitEditing={submit}
            keyboardType="number-pad"
            // The range as the field's own label: a reader who cannot see the
            // placeholder should not have to trip the error to learn it.
            accessibilityLabel={`${t(uiLocale, 'jump.surah')} 1-${SURAH_MAX}`}
            placeholder={`1-${SURAH_MAX}`}
            placeholderTextColor={theme.mutedText}
            style={field(rejected)}
            />
        </View>
        <View style={{ flex: 1 }}>
          {label(t(uiLocale, 'jump.ayah'))}
          <TextInput
            testID="ayah-jump-input"
            value={ayahRaw}
            editable={ayahKnown}
            onChangeText={(next) => {
              setAyahRaw(next);
              setRejected(false);
            }}
            onSubmitEditing={submit}
            keyboardType="number-pad"
            accessibilityLabel={ayahMax === null ? t(uiLocale, 'jump.ayah') : `${t(uiLocale, 'jump.ayah')} 1-${ayahMax}`}
            placeholder={ayahMax === null ? '1' : `1-${ayahMax}`}
            placeholderTextColor={theme.mutedText}
            style={[field(rejected), { opacity: ayahKnown ? 1 : 0.5 }]}
            />
        </View>
      </View>
      {onBrowse ? (
        // Under the fields, not instead of them (ruling R1). Someone who knows
        // the number is two taps from the ayah they want and should not be
        // routed through a list of 114 to get there.
        <SheetRow
          testID="surah-jump-browse"
          label={t(uiLocale, 'jump.browse')}
          trailingIcon="chevronRight"
          onPress={onBrowse}
        />
      ) : null}
      {rejected ? (
        <Text
          testID="surah-jump-error"
          // Announced when it appears: it lands after the button was pressed,
          // and a reader who cannot see it would otherwise get silence.
          accessibilityLiveRegion="polite"
          style={{ color: theme.danger, fontSize: typography.caption }}
        >
          {t(uiLocale, 'jump.outOfRange')}
        </Text>
      ) : null}
      <SheetActions
        cancelLabel={t(uiLocale, 'bookmarks.cancel')}
        onCancel={onClose}
        confirmLabel={t(uiLocale, 'jump.go')}
        onConfirm={submit}
        tone="filled"
        confirmTestID="surah-jump-go"
      />
    </BottomSheet>
  );
}
