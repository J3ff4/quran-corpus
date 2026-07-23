import type { RootForm } from '@quran-corpus/data';
import { categorizeFormLabel, formCategoryColor } from '../../lib/formCategoryColor';

interface FormFilterChipsProps {
  forms: RootForm[];
  /** root_forms.id values currently selected. Empty = "All" (no filter). */
  selected: number[];
  onToggle: (formId: number) => void;
}

/** Turns the root's derived forms into tappable, multi-select filter chips --
 *  same content as the old static FormGroup row (pos_label, Arabic form,
 *  transliteration, gloss, count), now a real <button aria-pressed> in a
 *  flex-wrap row so it scales to a 22-form root without horizontal scroll.
 *  Selection is signaled by border + background tint AND font-weight, so the
 *  state never rides on color alone (WCAG AA, non-color-blind-safe). */
export function FormFilterChips({ forms, selected, onToggle }: FormFilterChipsProps) {
  if (forms.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {forms.map((f) => {
        const isSelected = selected.includes(f.id);
        const color = formCategoryColor(categorizeFormLabel(f.pos_label));
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(f.id)}
            className="flex flex-wrap items-baseline gap-2 rounded-xl border px-3 py-2 text-left transition-colors"
            style={{
              borderColor: isSelected ? color : 'transparent',
              backgroundColor: isSelected
                ? `color-mix(in srgb, ${color} 12%, transparent)`
                : undefined,
            }}
          >
            <span
              className={`text-sm ${isSelected ? 'font-semibold' : 'font-medium'}`}
              style={{ color }}
            >
              {f.pos_label}
            </span>
            {f.form_arabic && (
              <span dir="rtl" className="font-arabic text-xl text-paper-900 dark:text-paper-100">
                {f.form_arabic}
              </span>
            )}
            {f.form_translit && (
              <span className="text-sm text-paper-500">{f.form_translit}</span>
            )}
            {f.gloss && (
              <span className="text-sm text-paper-700 dark:text-paper-300">{f.gloss}</span>
            )}
            <span className="shrink-0 text-sm text-paper-500">{f.occurrence_count}</span>
          </button>
        );
      })}
    </div>
  );
}
