import type { RootForm } from '@quran-corpus/data';

interface FormGroupProps {
  form: RootForm;
}

/** One derived form: POS label, Arabic form, transliteration, gloss, count. */
export function FormGroup({ form }: FormGroupProps) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-sm font-medium text-paper-600 dark:text-paper-400">
          {form.pos_label}
        </span>
        {form.form_arabic && (
          <span dir="rtl" className="font-arabic text-xl text-paper-900 dark:text-paper-100">
            {form.form_arabic}
          </span>
        )}
        {form.form_translit && (
          <span className="text-sm text-paper-500">{form.form_translit}</span>
        )}
        {form.gloss && (
          <span className="text-sm text-paper-700 dark:text-paper-300">{form.gloss}</span>
        )}
      </div>
      <span className="shrink-0 text-sm text-paper-500">{form.occurrence_count}</span>
    </div>
  );
}
