/**
 * Coarse categories for `root_forms.pos_label`.
 *
 * 49 distinct labels live DB-wide ("Form IV verb", "Form II passive
 * participle"); one colour per label would be as unreadable as the
 * all-tags-coloured word-by-word view this project already walked back from.
 *
 * Pure string work, no imports: safe for the client and mobile entry points.
 * Lives here rather than in an app because web's root page and mobile's root
 * screen both colour-code the same labels (CLAUDE.md §2, §3).
 */
export type FormCategory =
  | 'verb'
  | 'verbal-noun'
  | 'active-participle'
  | 'passive-participle'
  | 'noun'
  | 'adjective'
  | 'other';

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
