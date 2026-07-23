export type FormCategory =
  | 'verb'
  | 'verbal-noun'
  | 'active-participle'
  | 'passive-participle'
  | 'noun'
  | 'adjective'
  | 'other';

/**
 * Buckets root_forms.pos_label (47 distinct values DB-wide, e.g. "Form IV
 * verb", "Form II passive participle") into 7 coarse categories for color
 * coding -- one color per label would be as unreadable as the earlier
 * all-tags-colored wbw problem this project already walked back from.
 */
export function categorizeFormLabel(posLabel: string): FormCategory {
  const s = posLabel.toLowerCase();
  if (s.includes('verbal noun')) return 'verbal-noun';
  if (s.includes('active participle')) return 'active-participle';
  if (s.includes('passive participle')) return 'passive-participle';
  // 'adverb' must be checked before the generic 'verb' substring test below --
  // 'adverb' itself contains 'verb' as a substring ("time adverb" would
  // otherwise miscategorize as 'verb' instead of 'noun').
  if (s.includes('adverb')) return 'noun';
  if (s.includes('verb')) return 'verb';
  if (s.includes('adjective') || s === 'nominal') return 'adjective';
  if (s.includes('noun')) return 'noun';
  return 'other';
}

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
