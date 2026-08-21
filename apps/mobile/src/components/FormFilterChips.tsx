import { Pressable, Text, View } from 'react-native';
import type { RootForm } from '@quran-corpus/data/mobile';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { formColorFor } from '@/theme/formTint';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface FormFilterChipsProps {
  forms: RootForm[];
  /** root_forms.id values currently selected. Empty = All (no filter). */
  selected: number[];
  onToggle: (formId: number) => void;
  uiLocale: UiLocaleCode;
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
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={t(uiLocale, 'root.formsFilter')}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
    >
      {forms.map((form) => {
        const isSelected = selected.includes(form.id);
        const { color, tint } = formColorFor(theme, form.pos_label);
        return (
          <Pressable
            key={form.id}
            testID="form-chip"
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onToggle(form.id)}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 6,
              minHeight: touchTargets.compact,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: isSelected ? color : theme.border,
              // The palette's tinted contrast figures assume the tint sits
              // directly on the page. Nothing may paint behind this chip.
              backgroundColor: isSelected ? tint : 'transparent',
            }}
          >
            <Text style={{ color, fontSize: typography.caption, fontWeight: isSelected ? '700' : '500' }}>
              {form.pos_label}
            </Text>
            {form.form_arabic ? (
              <Text style={{ color: theme.text, fontFamily: 'Hafs', fontSize: typography.body }}>
                {form.form_arabic}
              </Text>
            ) : null}
            {form.form_translit ? (
              <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
                {form.form_translit}
              </Text>
            ) : null}
            {form.gloss ? (
              <Text style={{ color: theme.text, fontSize: typography.caption }}>{form.gloss}</Text>
            ) : null}
            <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
              {form.occurrence_count}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
