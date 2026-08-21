import { categorizeFormLabel, type FormCategory } from '@quran-corpus/data/client';

// Re-exported so the existing call sites keep one import. The classification
// itself lives in packages/data -- mobile's root screen colour-codes the same
// labels (§2, §3). Only the *values* are web's, because they are CSS variables.
export { categorizeFormLabel, type FormCategory };

export function formCategoryColor(category: FormCategory): string {
  switch (category) {
    case 'verb':
      return 'var(--form-verb)';
    case 'verbal-noun':
      return 'var(--form-verbal-noun)';
    case 'active-participle':
      return 'var(--form-active-participle)';
    case 'passive-participle':
      return 'var(--form-passive-participle)';
    case 'noun':
      return 'var(--form-noun)';
    case 'adjective':
      return 'var(--form-adjective)';
    case 'other':
      return 'var(--form-other)';
  }
}
