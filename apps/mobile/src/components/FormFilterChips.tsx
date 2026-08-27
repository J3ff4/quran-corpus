import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { RootForm } from '@quran-corpus/data/mobile';

import { useGlassSkin } from './GlassSurface';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { usePressScale } from '@/motion/usePressScale';
import { formColorFor } from '@/theme/formTint';
import { fonts, radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface FormFilterChipsProps {
  forms: RootForm[];
  /** root_forms.id values currently selected. Empty = All (no filter). */
  selected: number[];
  onToggle: (formId: number) => void;
  /** Clears the whole selection -- what the All chip does. Separate from
   *  `onToggle` because "select nothing" is not the toggle of any one form:
   *  with several chips lit there was no single tap that got back to All. */
  onClear: () => void;
  uiLocale: UiLocaleCode;
}

/** Shared chip geometry. Both chips have to sit on the same baseline in a
 *  wrapping row, so the padding lives in one place rather than being typed
 *  twice and drifting -- which is how the two chip rows in DictionaryScreen
 *  drifted apart before FilterChip was extracted. */
const CHIP = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 7,
  minHeight: touchTargets.compact,
  paddingHorizontal: 11,
  paddingVertical: 6,
  borderRadius: radii.chip,
  borderWidth: 1,
} as const;

function AllChip({
  isSelected,
  onPress,
  uiLocale,
}: {
  isSelected: boolean;
  onPress: () => void;
  uiLocale: UiLocaleCode;
}) {
  const theme = useThemeColors();
  const skin = useGlassSkin();
  const press = usePressScale();

  return (
    <AnimatedPressable
      testID="form-chip-all"
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        press.style,
        CHIP,
        {
          justifyContent: 'center',
          // The wash replaces the glass fill rather than layering over it: its
          // measured contrast assumes it sits directly on the page.
          backgroundColor: isSelected ? theme.accentWash : skin.fill,
          borderColor: isSelected ? theme.accent : skin.border,
        },
      ]}
    >
      <Text
        style={{
          color: isSelected ? theme.accent : theme.mutedText,
          fontSize: typography.caption,
          fontWeight: isSelected ? '700' : '500',
        }}
      >
        {t(uiLocale, 'root.formsAll')}
      </Text>
    </AnimatedPressable>
  );
}

function FormChip({
  form,
  isSelected,
  onToggle,
}: {
  form: RootForm;
  isSelected: boolean;
  onToggle: (formId: number) => void;
}) {
  const theme = useThemeColors();
  const skin = useGlassSkin();
  const press = usePressScale();
  const { color, tint } = formColorFor(theme, form.pos_label);

  return (
    <AnimatedPressable
      testID="form-chip"
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      // The chip shows the form and its count; the part of speech it is tinted
      // for, its reading and its gloss are the accessible name, because a
      // screen reader gets nothing at all from a colour. Nothing is lost
      // visually either -- every occurrence in the concordance below carries
      // its part of speech as text (ConcordanceList's form tag).
      accessibilityLabel={[
        form.form_translit ?? form.form_arabic,
        form.pos_label,
        form.gloss,
        String(form.occurrence_count),
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={() => onToggle(form.id)}
      style={[
        press.style,
        CHIP,
        {
          // Tinted by part of speech whether or not it is selected, as mockup
          // m6g-4 draws it: the tint identifies the form, it does not signal
          // the selection. Nothing may paint behind a tinted chip -- the
          // palette's contrast figures assume the tint sits directly on the
          // page, which is why the fill is the tint itself rather than a glass
          // surface wrapped around it.
          backgroundColor: tint,
          // Selection is the border AND the weight of the count below, never
          // colour alone (§8, WCAG 1.4.1), plus accessibilityState.selected
          // for TalkBack, which sees neither.
          borderColor: isSelected ? color : skin.border,
        },
      ]}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      {/* Arabic and the count, nothing else. The label, reading and gloss the
          old chip also carried made a six-form root three rows deep before the
          concordance started. */}
      {form.form_arabic ? (
        <Text style={{ color: theme.text, fontFamily: fonts.arabic, fontSize: typography.body }}>
          {form.form_arabic}
        </Text>
      ) : null}
      <Text
        style={{
          color: isSelected ? color : theme.mutedText,
          fontSize: typography.caption,
          fontWeight: isSelected ? '700' : '500',
          fontVariant: ['tabular-nums'],
        }}
      >
        {form.occurrence_count}
      </Text>
    </AnimatedPressable>
  );
}

/** The root's derived forms as tappable multi-select filter chips, headed by
 *  an All chip that clears the selection.
 *
 *  Wrapping row, not one card per row: a 22-form root would otherwise push the
 *  concordance several screens down.
 *
 *  Material filter chips are buttons carrying a selected state, so the
 *  container is a toolbar rather than a radiogroup: they multi-select, and
 *  radiogroup would claim radio children they deliberately are not. Same
 *  reasoning as the Frequent pane's kind chips (DictionaryScreen). */
export function FormFilterChips({
  forms,
  selected,
  onToggle,
  onClear,
  uiLocale,
}: FormFilterChipsProps) {
  const theme = useThemeColors();
  if (forms.length === 0) return null;

  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/* Visible now, not only an accessible name: the chips are the one
            control on this screen whose effect (the concordance below shrinks)
            happens off screen, and the mockup labels them for that reason. */}
        <Text
          testID="form-filter-label"
          // Not announced: the toolbar below carries the same words as its own
          // name, and without this TalkBack reads "Filter by form" twice before
          // reaching the first chip.
          importantForAccessibility="no"
          style={{
            color: theme.mutedText,
            fontFamily: fonts.displaySemiBold,
            fontSize: typography.caption,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {t(uiLocale, 'root.formsFilter')}
        </Text>
        {/* Label first, count second, for the reason the dictionary's own
            count line spells out: "6 форм" needs a different noun form from
            "2 формы", and no locale has to agree with a number in this
            order. */}
        <Text
          testID="form-filter-count"
          importantForAccessibility="no"
          style={{
            color: theme.mutedText,
            fontSize: typography.caption,
            fontVariant: ['tabular-nums'],
          }}
        >
          {`${t(uiLocale, 'root.formsCount')} · ${forms.length}`}
        </Text>
      </View>
      <View
        accessibilityRole="toolbar"
        accessibilityLabel={t(uiLocale, 'root.formsFilter')}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}
      >
        <AllChip isSelected={selected.length === 0} onPress={onClear} uiLocale={uiLocale} />
        {forms.map((form) => (
          <FormChip
            key={form.id}
            form={form}
            isSelected={selected.includes(form.id)}
            onToggle={onToggle}
          />
        ))}
      </View>
    </View>
  );
}
