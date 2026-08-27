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
  uiLocale: UiLocaleCode;
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
      onPress={() => onToggle(form.id)}
      style={[
        press.style,
        {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 7,
          minHeight: touchTargets.compact,
          paddingHorizontal: 11,
          paddingVertical: 6,
          borderRadius: radii.chip,
          borderWidth: 1,
          borderColor: isSelected ? color : skin.border,
          // The palette's tinted contrast figures assume the tint sits
          // directly on the page. Nothing may paint behind this chip -- which
          // is why the unselected fill is the glass recipe rather than a glass
          // surface wrapped around it.
          backgroundColor: isSelected ? tint : skin.fill,
        },
      ]}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      {/* Arabic first, as the mockup draws it: the form IS the Arabic word,
          and the part-of-speech label reads as its annotation. No dim on an
          unselected chip, deliberately -- M5c defect 9. */}
      {form.form_arabic ? (
        <Text style={{ color: theme.text, fontFamily: fonts.arabic, fontSize: typography.body }}>
          {form.form_arabic}
        </Text>
      ) : null}
      <Text style={{ color, fontSize: typography.caption, fontWeight: isSelected ? '700' : '500' }}>
        {form.pos_label}
      </Text>
      {form.form_translit ? (
        <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
          {form.form_translit}
        </Text>
      ) : null}
      {form.gloss ? (
        <Text style={{ color: theme.text, fontSize: typography.caption }}>{form.gloss}</Text>
      ) : null}
      <Text
        style={{
          color: theme.mutedText,
          fontSize: typography.caption,
          fontVariant: ['tabular-nums'],
        }}
      >
        {form.occurrence_count}
      </Text>
    </AnimatedPressable>
  );
}

/** The root's derived forms as tappable multi-select filter chips.
 *
 *  Wrapping row, not one card per row: a 22-form root would otherwise push the
 *  concordance several screens down. Selection is signalled by border AND tint
 *  AND weight -- never colour alone (§8, WCAG 1.4.1) -- and by
 *  accessibilityState.selected (-> aria-selected on web) for TalkBack, which
 *  sees none of the three.
 *
 *  Material filter chips are buttons carrying a selected state, so the
 *  container is a toolbar rather than a radiogroup: they multi-select, and
 *  radiogroup would claim radio children they deliberately are not. Same
 *  reasoning as the Frequent pane's kind chips (DictionaryScreen). */
export function FormFilterChips({ forms, selected, onToggle, uiLocale }: FormFilterChipsProps) {
  const theme = useThemeColors();
  if (forms.length === 0) return null;

  return (
    <View style={{ gap: 9 }}>
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
      <View
        accessibilityRole="toolbar"
        accessibilityLabel={t(uiLocale, 'root.formsFilter')}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}
      >
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
