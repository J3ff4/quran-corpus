import { describe, it, expect } from 'vitest';
import {
  POS_LABELS,
  FEATURE_LABELS,
  CASE_LABELS,
  GENDER_LABELS,
} from '../src/morphology/tags.js';

// Every POS code observed in word_segments (DB, 2026-07-04). Coverage guard:
// each must resolve to a non-empty English label so no card shows a bare code.
const SEEN_POS = [
  'N', 'PRON', 'V', 'P', 'CONJ', 'DET', 'PN', 'REL', 'REM', 'NEG', 'ACC',
  'ADJ', 'EMPH', 'T', 'DEM', 'COND', 'INTG', 'SUB', 'LOC', 'RES', 'CERT',
  'VOC', 'RSLT', 'PRO', 'PRP', 'CIRC', 'SUP', 'PREV', 'FUT', 'RET', 'EXP',
  'INC', 'CAUS', 'IMPV', 'EXL', 'AMD', 'INT', 'EXH', 'ANS', 'SUR', 'AVR',
  'INL', 'EQ', 'COM', 'IMPN',
];

// Every `raw` feature tag observed in word_segments.features_json (DB).
const SEEN_FEATURES = [
  'PERF', 'INDEF', 'IMPF', '3MS', 'MP', '3MP', '(IV)', 'MS', 'PCPL', '2MP',
  'ACT', '1P', 'IMPV', '2MS', 'PASS', 'FP', '(II)', '3FS', '(VIII)', 'FS',
  '1S', 'VN', '(III)', '(V)', '(X)', 'P', 'MD', '3FP', '(VI)', 'FD', '3MD',
  '2D', '(VII)', '2FS', '2FP', '2MD', '3D', '(XII)', '3FD', '(IX)', '+VOC',
  '2FD', '(XI)',
];

describe('morphology label tables', () => {
  it('has 45 POS codes and every seen code resolves', () => {
    expect(Object.keys(POS_LABELS)).toHaveLength(45);
    for (const code of SEEN_POS) {
      expect(POS_LABELS[code]?.en, code).toBeTruthy();
    }
  });

  it('every seen feature tag resolves to a non-empty label', () => {
    for (const t of SEEN_FEATURES) {
      expect(FEATURE_LABELS[t], t).toBeTruthy();
    }
  });

  it('case + gender values map to titled labels', () => {
    expect(CASE_LABELS['genitive']).toBe('Genitive');
    expect(CASE_LABELS['nominative']).toBe('Nominative');
    expect(CASE_LABELS['accusative']).toBe('Accusative');
    expect(GENDER_LABELS['masculine']).toBe('Masculine');
    expect(GENDER_LABELS['feminine']).toBe('Feminine');
  });
});
