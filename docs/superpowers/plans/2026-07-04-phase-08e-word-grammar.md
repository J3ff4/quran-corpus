# Phase 08e — Word-page Structured Grammar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode raw morphology codes into human-readable structured grammar cards on `/word/[surah]/[ayah]/[position]`; move verbatim scraped prose into a collapsible "Full analysis".

**Architecture:** New portable decode module in `packages/data/src/morphology/` (label tables + pure `decodeSegment`). Web decodes server-side in the RSC, renders decoded cards as primary content, keeps verbatim `morphology_description` + `grammar_arabic` in one client-side Framer collapsible. No schema/query change — data already scraped.

**Tech Stack:** TypeScript, Next.js 15 App Router (RSC), React 19, Tailwind, Framer Motion, Vitest.

## Global Constraints

- `packages/data` stays Next-free/portable — no web/Next imports (CLAUDE.md §2).
- No duplicated decode logic in web; reuse existing `buckwalterToArabic` from `@quran-corpus/data` (§3).
- Web imports resolve to the **built dist** of `@quran-corpus/data`. After any change to `packages/data`, run `pnpm --filter @quran-corpus/data build` **before** web type-check/tests, else web sees stale exports.
- No new dependencies. `framer-motion` already installed and used (see `LanguageBar.tsx`).
- Motion: 60fps target; `prefers-reduced-motion` respected via `useReducedMotion()` (§8). WCAG AA.
- Conventional Commits, imperative, ≤72 char subject (§9). One logical change per commit.
- Greptile 5/5 hard block per task (§5). No `@ts-ignore`, no disabled lint without inline justification (§4).
- Unknown POS/feature tag → show raw tag, never crash, never hide (spec "Edge / error handling").
- POS code count is **45**, not 44 (spec text says 44 but its own list + DB both have 45 — DET included). Coverage test asserts all 45 seen codes resolve.

---

### Task 1: Morphology label tables (`packages/data`)

Static reference tables mapping corpus codes → human labels. Pure data, no logic. Labels authoritative from corpus.quran.com/documentation/tagset.jsp (fetched 2026-07-04).

**Files:**
- Create: `packages/data/src/morphology/tags.ts`
- Test: `packages/data/tests/morphology-tags.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `POS_LABELS: Record<string, { en: string; ar?: string }>`
  - `FEATURE_LABELS: Record<string, string>`
  - `CASE_LABELS: Record<string, string>`
  - `GENDER_LABELS: Record<string, string>`

- [ ] **Step 1: Write the failing test**

`packages/data/tests/morphology-tags.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- morphology-tags`
Expected: FAIL — cannot resolve `../src/morphology/tags.js`.

- [ ] **Step 3: Write the tables**

`packages/data/src/morphology/tags.ts`:
```ts
// Human labels for Quranic Arabic Corpus morphology codes.
// Source: corpus.quran.com/documentation/tagset.jsp (fetched 2026-07-04).
// Pure static reference — no logic. Any code/tag absent here degrades to the
// raw code at the call site (never crash, never hide).

// 45 part-of-speech codes (every value seen in word_segments.pos_tag).
export const POS_LABELS: Record<string, { en: string; ar?: string }> = {
  // Nominals
  N: { en: 'Noun', ar: 'اسم' },
  PN: { en: 'Proper noun', ar: 'اسم علم' },
  ADJ: { en: 'Adjective', ar: 'صفة' },
  IMPN: { en: 'Imperative verbal noun', ar: 'اسم فعل أمر' },
  PRON: { en: 'Personal pronoun', ar: 'ضمير' },
  DEM: { en: 'Demonstrative pronoun', ar: 'اسم إشارة' },
  REL: { en: 'Relative pronoun', ar: 'اسم موصول' },
  T: { en: 'Time adverb', ar: 'ظرف زمان' },
  LOC: { en: 'Location adverb', ar: 'ظرف مكان' },
  // Verb
  V: { en: 'Verb', ar: 'فعل' },
  // Prepositions & lām prefixes
  P: { en: 'Preposition', ar: 'حرف جر' },
  EMPH: { en: 'Emphatic lām prefix', ar: 'لام التوكيد' },
  IMPV: { en: 'Imperative lām prefix', ar: 'لام الأمر' },
  PRP: { en: 'Purpose lām prefix', ar: 'لام التعليل' },
  // Conjunctions
  CONJ: { en: 'Coordinating conjunction', ar: 'حرف عطف' },
  SUB: { en: 'Subordinating conjunction', ar: 'حرف مصدري' },
  // Determiner
  DET: { en: 'Determiner', ar: 'أل التعريف' },
  // Particles
  ACC: { en: 'Accusative particle', ar: 'حرف نصب' },
  AMD: { en: 'Amendment particle', ar: 'حرف إضراب' },
  ANS: { en: 'Answer particle', ar: 'حرف جواب' },
  AVR: { en: 'Aversion particle', ar: 'حرف ردع' },
  CAUS: { en: 'Particle of cause', ar: 'حرف سببية' },
  CERT: { en: 'Particle of certainty', ar: 'حرف تحقيق' },
  CIRC: { en: 'Circumstantial particle', ar: 'واو الحال' },
  COM: { en: 'Comitative particle', ar: 'واو المعية' },
  COND: { en: 'Conditional particle', ar: 'أداة شرط' },
  EQ: { en: 'Equalization particle', ar: 'حرف تسوية' },
  EXH: { en: 'Exhortation particle', ar: 'حرف تحضيض' },
  EXL: { en: 'Explanation particle', ar: 'حرف تفصيل' },
  EXP: { en: 'Exceptive particle', ar: 'أداة استثناء' },
  FUT: { en: 'Future particle', ar: 'حرف استقبال' },
  INC: { en: 'Inceptive particle', ar: 'حرف ابتداء' },
  INT: { en: 'Particle of interpretation', ar: 'حرف تفسير' },
  INTG: { en: 'Interrogative particle', ar: 'حرف استفهام' },
  NEG: { en: 'Negative particle', ar: 'حرف نفي' },
  PREV: { en: 'Preventive particle', ar: 'حرف كاف' },
  PRO: { en: 'Prohibition particle', ar: 'حرف نهي' },
  REM: { en: 'Resumption particle', ar: 'حرف استئناف' },
  RES: { en: 'Restriction particle', ar: 'أداة حصر' },
  RET: { en: 'Retraction particle', ar: 'حرف إضراب' },
  RSLT: { en: 'Result particle', ar: 'حرف واقع في جواب الشرط' },
  SUP: { en: 'Supplemental particle', ar: 'حرف زائد' },
  SUR: { en: 'Surprise particle', ar: 'حرف فجاءة' },
  VOC: { en: 'Vocative particle', ar: 'حرف نداء' },
  // Quranic initials (disconnected letters)
  INL: { en: 'Quranic initials', ar: 'حروف مقطعة' },
};

// `raw`-list feature tags → labels. Person/gender/number, aspect, voice,
// derivation, verb form, state, plus the standalone plural/vocative markers.
export const FEATURE_LABELS: Record<string, string> = {
  // Person / gender / number
  '1S': '1st person singular',
  '1P': '1st person plural',
  '2MS': '2nd person masculine singular',
  '2FS': '2nd person feminine singular',
  '2MD': '2nd person masculine dual',
  '2FD': '2nd person feminine dual',
  '2D': '2nd person dual',
  '2MP': '2nd person masculine plural',
  '2FP': '2nd person feminine plural',
  '3MS': '3rd person masculine singular',
  '3FS': '3rd person feminine singular',
  '3MD': '3rd person masculine dual',
  '3FD': '3rd person feminine dual',
  '3D': '3rd person dual',
  '3MP': '3rd person masculine plural',
  '3FP': '3rd person feminine plural',
  MS: 'Masculine singular',
  FS: 'Feminine singular',
  MD: 'Masculine dual',
  FD: 'Feminine dual',
  MP: 'Masculine plural',
  FP: 'Feminine plural',
  P: 'Plural',
  // Aspect
  PERF: 'Perfect',
  IMPF: 'Imperfect',
  IMPV: 'Imperative',
  // Voice
  ACT: 'Active voice',
  PASS: 'Passive voice',
  // Derivation
  PCPL: 'Participle',
  VN: 'Verbal noun',
  // State
  INDEF: 'Indefinite',
  // Vocative marker
  '+VOC': 'Vocative',
  // Verb forms
  '(I)': 'Form I',
  '(II)': 'Form II',
  '(III)': 'Form III',
  '(IV)': 'Form IV',
  '(V)': 'Form V',
  '(VI)': 'Form VI',
  '(VII)': 'Form VII',
  '(VIII)': 'Form VIII',
  '(IX)': 'Form IX',
  '(X)': 'Form X',
  '(XI)': 'Form XI',
  '(XII)': 'Form XII',
};

// `case`/`gender` arrive already worded from the scrape (e.g. "genitive").
// Normalize to title case for display.
export const CASE_LABELS: Record<string, string> = {
  genitive: 'Genitive',
  nominative: 'Nominative',
  accusative: 'Accusative',
};

export const GENDER_LABELS: Record<string, string> = {
  masculine: 'Masculine',
  feminine: 'Feminine',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @quran-corpus/data test -- morphology-tags`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/morphology/tags.ts packages/data/tests/morphology-tags.test.ts
git commit -m "feat(data): add morphology label tables"
```

---

### Task 2: `decodeSegment` + decoded types (`packages/data`)

Pure function turning a raw `WordSegment` into a `DecodedSegment`. Deterministic, tolerant of bad/missing JSON.

**Files:**
- Create: `packages/data/src/morphology/decode.ts`
- Modify: `packages/data/src/types.ts` (append `DecodedFeature`, `DecodedSegment`)
- Modify: `packages/data/src/index.ts` (export `decodeSegment` + the two types)
- Test: `packages/data/tests/morphology-decode.test.ts`

**Interfaces:**
- Consumes: `WordSegment` (from `types.ts`), `buckwalterToArabic` (`text/arabic.js`), `POS_LABELS`/`FEATURE_LABELS`/`CASE_LABELS`/`GENDER_LABELS` (Task 1).
- Produces:
  - `interface DecodedFeature { key: string; label: string; value: string }`
  - `interface DecodedSegment { role: 'prefix' | 'stem' | 'suffix'; pos: { code: string; en: string; ar?: string }; features: DecodedFeature[]; rootArabic?: string; lemma?: string; unknownTags: string[] }`
  - `function decodeSegment(segment: WordSegment): DecodedSegment`

- [ ] **Step 1: Add the types**

Append to `packages/data/src/types.ts`:
```ts
export interface DecodedFeature {
  key: string;
  label: string;
  value: string;
}

export interface DecodedSegment {
  role: 'prefix' | 'stem' | 'suffix';
  pos: { code: string; en: string; ar?: string };
  features: DecodedFeature[];
  rootArabic?: string;
  lemma?: string;
  unknownTags: string[];
}
```

- [ ] **Step 2: Write the failing test**

`packages/data/tests/morphology-decode.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { decodeSegment } from '../src/morphology/decode.js';
import type { WordSegment } from '../src/types.js';

function seg(over: Partial<WordSegment>): WordSegment {
  return {
    id: 1,
    word_id: 1,
    segment_index: 0,
    segment_type: 'stem',
    pos_tag: 'N',
    form_arabic: null,
    form_buckwalter: null,
    features_json: null,
    lemma: null,
    root: null,
    ...over,
  };
}

describe('decodeSegment', () => {
  it('decodes role + POS label (en + ar)', () => {
    const d = decodeSegment(seg({ segment_type: 'prefix', pos_tag: 'P' }));
    expect(d.role).toBe('prefix');
    expect(d.pos).toEqual({ code: 'P', en: 'Preposition', ar: 'حرف جر' });
  });

  it('null segment_type defaults role to stem', () => {
    expect(decodeSegment(seg({ segment_type: null })).role).toBe('stem');
  });

  it('maps case + gender to labeled features', () => {
    const d = decodeSegment(
      seg({ features_json: '{"case":"genitive","gender":"masculine"}' }),
    );
    expect(d.features).toContainEqual({ key: 'case', label: 'Case', value: 'Genitive' });
    expect(d.features).toContainEqual({ key: 'gender', label: 'Gender', value: 'Masculine' });
  });

  it('maps raw tags to unlabeled features', () => {
    const d = decodeSegment(
      seg({ pos_tag: 'V', features_json: '{"raw":["PERF","3MS","(IV)"]}' }),
    );
    const vals = d.features.map((f) => f.value);
    expect(vals).toContain('Perfect');
    expect(vals).toContain('3rd person masculine singular');
    expect(vals).toContain('Form IV');
    expect(d.unknownTags).toEqual([]);
  });

  it('pushes unknown raw tags to unknownTags, never features', () => {
    const d = decodeSegment(seg({ features_json: '{"raw":["ZZZ"]}' }));
    expect(d.unknownTags).toEqual(['ZZZ']);
    expect(d.features.some((f) => f.value === 'ZZZ')).toBe(false);
  });

  it('unknown POS code falls back to raw code as en', () => {
    const d = decodeSegment(seg({ pos_tag: 'ZZ' }));
    expect(d.pos).toEqual({ code: 'ZZ', en: 'ZZ' });
  });

  it('malformed features_json yields no features, no throw', () => {
    const d = decodeSegment(seg({ features_json: '{bad json' }));
    expect(d.features).toEqual([]);
    expect(d.unknownTags).toEqual([]);
  });

  it('null features_json yields no features', () => {
    expect(decodeSegment(seg({ features_json: null })).features).toEqual([]);
  });

  it('converts Buckwalter root to Arabic; passes lemma through', () => {
    const d = decodeSegment(seg({ root: 'smw', lemma: 'ٱسْم' }));
    expect(d.rootArabic).toBe('سمو');
    expect(d.lemma).toBe('ٱسْم');
  });

  it('omits rootArabic/lemma when absent', () => {
    const d = decodeSegment(seg({ root: null, lemma: null }));
    expect(d.rootArabic).toBeUndefined();
    expect(d.lemma).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- morphology-decode`
Expected: FAIL — cannot resolve `../src/morphology/decode.js`.

- [ ] **Step 4: Write the implementation**

`packages/data/src/morphology/decode.ts`:
```ts
import type { WordSegment, DecodedSegment, DecodedFeature } from '../types.js';
import { buckwalterToArabic } from '../text/arabic.js';
import { POS_LABELS, FEATURE_LABELS, CASE_LABELS, GENDER_LABELS } from './tags.js';

type Features = { case?: string; gender?: string; raw?: string[] };

function parseFeatures(json: string | null): Features {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Features;
    }
  } catch {
    // malformed → no features (spec: tolerant, never throw)
  }
  return {};
}

/**
 * Decode one raw `WordSegment` into display-ready structured grammar.
 * Pure and deterministic. Unknown codes/tags degrade to the raw value
 * (POS → raw code as `en`; raw feature tag → `unknownTags`) — never throws,
 * never hides.
 */
export function decodeSegment(segment: WordSegment): DecodedSegment {
  const role: DecodedSegment['role'] =
    segment.segment_type === 'prefix' || segment.segment_type === 'suffix'
      ? segment.segment_type
      : 'stem';

  const code = segment.pos_tag ?? '';
  const label = POS_LABELS[code];
  const pos: DecodedSegment['pos'] = { code, en: label?.en ?? code };
  if (label?.ar) pos.ar = label.ar;

  const features: DecodedFeature[] = [];
  const unknownTags: string[] = [];
  const f = parseFeatures(segment.features_json);

  if (f.case) features.push({ key: 'case', label: 'Case', value: CASE_LABELS[f.case] ?? f.case });
  if (f.gender)
    features.push({ key: 'gender', label: 'Gender', value: GENDER_LABELS[f.gender] ?? f.gender });
  if (Array.isArray(f.raw)) {
    for (const tag of f.raw) {
      const human = FEATURE_LABELS[tag];
      if (human) features.push({ key: 'feature', label: '', value: human });
      else unknownTags.push(tag);
    }
  }

  const decoded: DecodedSegment = { role, pos, features, unknownTags };
  if (segment.root) decoded.rootArabic = buckwalterToArabic(segment.root);
  if (segment.lemma) decoded.lemma = segment.lemma;
  return decoded;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @quran-corpus/data test -- morphology-decode`
Expected: PASS (10 tests).

- [ ] **Step 6: Export from index**

Edit `packages/data/src/index.ts`. Add after the `buckwalterToArabic` export line (line 32):
```ts
export { decodeSegment } from './morphology/decode.js';
```
Add to the `export type { ... }` block (alongside `WordDetail`):
```ts
  DecodedSegment,
  DecodedFeature,
```

- [ ] **Step 7: Type-check + build the package**

Run: `pnpm --filter @quran-corpus/data type-check && pnpm --filter @quran-corpus/data build`
Expected: both pass; `dist/` now exports `decodeSegment`, `DecodedSegment`, `DecodedFeature`.

- [ ] **Step 8: Commit**

```bash
git add packages/data/src/morphology/decode.ts packages/data/src/types.ts packages/data/src/index.ts packages/data/tests/morphology-decode.test.ts
git commit -m "feat(data): add decodeSegment morphology decoder"
```

---

### Task 3: Rewrite `SegmentCard` to render decoded output (`apps/web`)

Card consumes a `DecodedSegment` (decoding happens in the parent RSC — client stays lean, label tables never ship to browser).

**Files:**
- Modify: `apps/web/src/components/morphology/SegmentCard.tsx` (full rewrite)
- Test: `apps/web/src/test/SegmentCard.test.tsx`

**Interfaces:**
- Consumes: `DecodedSegment` (from `@quran-corpus/data`, Task 2).
- Produces: `SegmentCard({ segment: DecodedSegment; index: number })`.

- [ ] **Step 1: Ensure data package is built** (Task 2 Step 7 must have run)

Run: `pnpm --filter @quran-corpus/data build`
Expected: PASS.

- [ ] **Step 2: Write the failing test**

`apps/web/src/test/SegmentCard.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DecodedSegment } from '@quran-corpus/data';
import { SegmentCard } from '../components/morphology/SegmentCard';

function decoded(over: Partial<DecodedSegment> = {}): DecodedSegment {
  return {
    role: 'stem',
    pos: { code: 'N', en: 'Noun', ar: 'اسم' },
    features: [],
    unknownTags: [],
    ...over,
  };
}

describe('SegmentCard', () => {
  it('renders role and POS English + Arabic labels', () => {
    render(<SegmentCard segment={decoded({ role: 'prefix' })} index={0} />);
    expect(screen.getByText(/prefix/i)).toBeInTheDocument();
    expect(screen.getByText('Noun')).toBeInTheDocument();
    expect(screen.getByText('اسم')).toBeInTheDocument();
  });

  it('renders labeled features and plain feature chips', () => {
    render(
      <SegmentCard
        index={0}
        segment={decoded({
          features: [
            { key: 'case', label: 'Case', value: 'Genitive' },
            { key: 'feature', label: '', value: 'Perfect' },
          ],
        })}
      />,
    );
    expect(screen.getByText('Case')).toBeInTheDocument();
    expect(screen.getByText('Genitive')).toBeInTheDocument();
    expect(screen.getByText('Perfect')).toBeInTheDocument();
  });

  it('renders unknown tags verbatim as fallback chips', () => {
    render(<SegmentCard index={0} segment={decoded({ unknownTags: ['ZZZ'] })} />);
    expect(screen.getByText('ZZZ')).toBeInTheDocument();
  });

  it('renders Arabic root and lemma when present', () => {
    render(
      <SegmentCard index={0} segment={decoded({ rootArabic: 'سمو', lemma: 'ٱسْم' })} />,
    );
    expect(screen.getByText('سمو')).toBeInTheDocument();
    expect(screen.getByText('ٱسْم')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/web test -- SegmentCard`
Expected: FAIL — SegmentCard still expects a raw `WordSegment` (type error / `pos.en` undefined).

- [ ] **Step 4: Rewrite the component**

Replace entire `apps/web/src/components/morphology/SegmentCard.tsx`:
```tsx
import type { DecodedSegment } from '@quran-corpus/data';

interface SegmentCardProps {
  segment: DecodedSegment;
  index: number;
}

const chip =
  'rounded-full bg-paper-200 px-2.5 py-0.5 text-xs text-paper-700 dark:bg-night-100 dark:text-paper-300';

export function SegmentCard({ segment, index }: SegmentCardProps) {
  const { role, pos, features, rootArabic, lemma, unknownTags } = segment;

  return (
    <div className="rounded-xl border border-paper-200 p-4 dark:border-night-100">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-paper-500">
          {index + 1}. {role}
        </span>
        <span className={`${chip} font-medium`}>{pos.en}</span>
        {pos.ar && (
          <span className={`${chip} font-arabic`} dir="rtl">
            {pos.ar}
          </span>
        )}
      </div>

      {features.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {features.map((f, i) => (
            <span key={`${f.key}-${i}`} className={chip}>
              {f.label ? `${f.label}: ${f.value}` : f.value}
            </span>
          ))}
        </div>
      )}

      {unknownTags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {unknownTags.map((t) => (
            <span key={t} className={`${chip} font-mono`}>
              {t}
            </span>
          ))}
        </div>
      )}

      {(rootArabic || lemma) && (
        <div className="mt-2 flex flex-wrap gap-2" dir="rtl">
          {rootArabic && (
            <span className="font-arabic text-sm text-paper-700 dark:text-paper-300">
              {rootArabic}
            </span>
          )}
          {lemma && (
            <span className="font-arabic text-sm text-paper-700 dark:text-paper-300">
              {lemma}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @quran-corpus/web test -- SegmentCard`
Expected: PASS (4 tests). (WordDetailView still passes a raw segment — fixed in Task 5; type-check deferred to Task 5 Step 8.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/morphology/SegmentCard.tsx apps/web/src/test/SegmentCard.test.tsx
git commit -m "feat(web): render decoded morphology in SegmentCard"
```

---

### Task 4: `FullAnalysis` collapsible (`apps/web`)

Client component holding the verbatim scraped prose (`morphology_description`) and Arabic iʿrab (`grammar_arabic`), collapsed by default, Framer height spring, `prefers-reduced-motion` → instant.

**Files:**
- Create: `apps/web/src/components/morphology/FullAnalysis.tsx`
- Test: `apps/web/src/test/FullAnalysis.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `FullAnalysis({ description?: string; grammarArabic?: string })`. Renders nothing if both absent.

- [ ] **Step 1: Write the failing test**

`apps/web/src/test/FullAnalysis.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FullAnalysis } from '../components/morphology/FullAnalysis';

// vitest hoists vi.mock above imports, so the framer stub is applied before
// FullAnalysis loads — the collapsible renders synchronously in tests.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => false,
}));

describe('FullAnalysis', () => {
  it('renders nothing when both fields absent', () => {
    const { container } = render(<FullAnalysis />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is collapsed by default (content hidden), expands on click', () => {
    render(<FullAnalysis description="It is a genitive noun." />);
    expect(screen.queryByText('It is a genitive noun.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /full analysis/i }));
    expect(screen.getByText('It is a genitive noun.')).toBeInTheDocument();
  });

  it('toggle button exposes aria-expanded state', () => {
    render(<FullAnalysis description="x" />);
    const btn = screen.getByRole('button', { name: /full analysis/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders Arabic grammar RTL when expanded', () => {
    render(<FullAnalysis grammarArabic="اسم مجرور" />);
    fireEvent.click(screen.getByRole('button', { name: /full analysis/i }));
    const ar = screen.getByText('اسم مجرور');
    expect(ar).toHaveAttribute('dir', 'rtl');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/web test -- FullAnalysis`
Expected: FAIL — cannot resolve `../components/morphology/FullAnalysis`.

- [ ] **Step 3: Write the component**

`apps/web/src/components/morphology/FullAnalysis.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface FullAnalysisProps {
  description?: string;
  grammarArabic?: string;
}

/**
 * Collapsible holding the verbatim scraped morphology prose + Arabic iʿrab.
 * Secondary to the decoded cards; also the graceful display for function words
 * that have no segments. Renders nothing when both fields are absent.
 */
export function FullAnalysis({ description, grammarArabic }: FullAnalysisProps) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  if (!description && !grammarArabic) return null;

  const body = (
    <div className="space-y-3 pt-3">
      {description && (
        <p className="text-sm leading-relaxed text-paper-700 dark:text-paper-300">
          {description}
        </p>
      )}
      {grammarArabic && (
        <p dir="rtl" className="font-arabic text-xl text-paper-800 dark:text-paper-200">
          {grammarArabic}
        </p>
      )}
    </div>
  );

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg text-sm font-semibold uppercase tracking-wide text-paper-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-paper-500"
      >
        <span>Full analysis</span>
        <span aria-hidden className={open ? 'rotate-180 transition-transform' : 'transition-transform'}>
          ▾
        </span>
      </button>

      {reducedMotion ? (
        open && body
      ) : (
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="overflow-hidden"
            >
              {body}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @quran-corpus/web test -- FullAnalysis`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/morphology/FullAnalysis.tsx apps/web/src/test/FullAnalysis.test.tsx
git commit -m "feat(web): add FullAnalysis collapsible for scraped prose"
```

---

### Task 5: Wire decode into `WordDetailView` + trim `MorphologySummary` (`apps/web`)

Decode segments server-side in `WordDetailView`, render decoded cards as the primary section, host prose in `FullAnalysis`. Trim `MorphologySummary` to header chips only (prose/Arabic move to `FullAnalysis`; reader popover inherits the leaner summary — intended per spec).

**Files:**
- Modify: `apps/web/src/components/morphology/WordDetailView.tsx`
- Modify: `apps/web/src/components/morphology/MorphologySummary.tsx`
- Test: `apps/web/src/test/WordDetailView.test.tsx` (create)
- Test: `apps/web/src/test/MorphologySummary.test.tsx` (create)

**Interfaces:**
- Consumes: `decodeSegment`, `WordDetail`, `Word` (from `@quran-corpus/data`); `SegmentCard` (Task 3, `DecodedSegment`); `FullAnalysis` (Task 4).
- Produces: unchanged public props — `WordDetailView({ detail, gloss?, rootHref? })`, `MorphologySummary({ word, gloss? })`.

- [ ] **Step 1: Write the failing MorphologySummary test**

`apps/web/src/test/MorphologySummary.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Word } from '@quran-corpus/data';
import { MorphologySummary } from '../components/morphology/MorphologySummary';

function word(over: Partial<Word> = {}): Word {
  return {
    id: 1, ayah_id: 1, position: 1, text_arabic: 'بِسْمِ',
    transliteration: 'bismi', root: 'س م و', lemma: 'ٱسْم',
    root_buckwalter: 'smw', lemma_buckwalter: null, pos_tag: 'N',
    morphology_json: null, morphology_description: 'PROSE HERE',
    grammar_arabic: 'ARABIC HERE', audio_url: null, ...over,
  };
}

describe('MorphologySummary (trimmed)', () => {
  it('renders transliteration, gloss, and POS/root/lemma chips', () => {
    render(<MorphologySummary word={word()} gloss="In the name" />);
    expect(screen.getByText('bismi')).toBeInTheDocument();
    expect(screen.getByText('In the name')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  it('no longer renders verbatim prose or Arabic grammar (moved to FullAnalysis)', () => {
    render(<MorphologySummary word={word()} />);
    expect(screen.queryByText('PROSE HERE')).not.toBeInTheDocument();
    expect(screen.queryByText('ARABIC HERE')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @quran-corpus/web test -- MorphologySummary`
Expected: FAIL — prose/Arabic still rendered (`PROSE HERE` found).

- [ ] **Step 3: Trim MorphologySummary**

Replace `apps/web/src/components/morphology/MorphologySummary.tsx`:
```tsx
import type { Word } from '@quran-corpus/data';

interface MorphologySummaryProps {
  word: Word;
  gloss?: string;
}

const chip =
  'rounded-full bg-paper-200 px-3 py-0.5 text-sm text-paper-700 dark:bg-night-100 dark:text-paper-300';

/**
 * Shared, non-interactive header presenter for a word: transliteration, gloss,
 * and POS/root/lemma chips. Verbatim prose + Arabic grammar now live in the
 * FullAnalysis collapsible on the word page (kept out of here so the reader
 * popover stays compact). Reused by the reader popover and word-detail view.
 */
export function MorphologySummary({ word, gloss }: MorphologySummaryProps) {
  return (
    <div>
      {word.transliteration && (
        <p className="mb-1 text-lg text-paper-500">{word.transliteration}</p>
      )}

      {gloss && <p className="mb-4 text-base text-paper-700 dark:text-paper-300">{gloss}</p>}

      <div className="flex flex-wrap gap-2">
        {word.pos_tag && <span className={`${chip} font-medium`}>{word.pos_tag}</span>}
        {word.root && <span className={`${chip} font-arabic`}>{word.root}</span>}
        {word.lemma && <span className={`${chip} font-arabic`}>{word.lemma}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify MorphologySummary passes**

Run: `pnpm --filter @quran-corpus/web test -- MorphologySummary`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing WordDetailView test**

`apps/web/src/test/WordDetailView.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import type { WordDetail, Word, WordSegment } from '@quran-corpus/data';
import { WordDetailView } from '../components/morphology/WordDetailView';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
// FullAnalysis is a client component with framer — stub to a plain always-open box.
vi.mock('../components/morphology/FullAnalysis', () => ({
  FullAnalysis: ({ description, grammarArabic }: { description?: string; grammarArabic?: string }) => (
    <div data-testid="full-analysis">{description}{grammarArabic}</div>
  ),
}));

const baseWord: Word = {
  id: 1, ayah_id: 1, position: 1, text_arabic: 'بِسْمِ',
  transliteration: 'bismi', root: 'س م و', lemma: 'ٱسْم',
  root_buckwalter: 'smw', lemma_buckwalter: null, pos_tag: 'N',
  morphology_json: null, morphology_description: 'In the name — genitive noun.',
  grammar_arabic: 'اسم مجرور', audio_url: null,
};

function segment(over: Partial<WordSegment>): WordSegment {
  return {
    id: 1, word_id: 1, segment_index: 0, segment_type: 'stem', pos_tag: 'N',
    form_arabic: null, form_buckwalter: null, features_json: null,
    lemma: null, root: null, ...over,
  };
}

function detail(segments: WordSegment[]): WordDetail {
  return { word: baseWord, segments, concept_tags: [] };
}

describe('WordDetailView', () => {
  it('decodes segments into cards with human POS labels', () => {
    render(<WordDetailView detail={detail([segment({ pos_tag: 'P' })])} />);
    expect(screen.getByText('Preposition')).toBeInTheDocument();
  });

  it('omits the Segments section when there are no segments', () => {
    render(<WordDetailView detail={detail([])} />);
    expect(screen.queryByRole('heading', { name: /segments/i })).not.toBeInTheDocument();
  });

  it('passes scraped prose + Arabic grammar to FullAnalysis', () => {
    render(<WordDetailView detail={detail([])} />);
    const fa = screen.getByTestId('full-analysis');
    expect(fa).toHaveTextContent('In the name — genitive noun.');
    expect(fa).toHaveTextContent('اسم مجرور');
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @quran-corpus/web test -- WordDetailView`
Expected: FAIL — no `FullAnalysis` rendered; `Preposition` not found (card still shows raw code).

- [ ] **Step 7: Rewire WordDetailView**

Replace `apps/web/src/components/morphology/WordDetailView.tsx`:
```tsx
import Link from 'next/link';
import type { WordDetail } from '@quran-corpus/data';
import { decodeSegment } from '@quran-corpus/data';
import { SegmentedWord } from './SegmentedWord';
import { MorphologySummary } from './MorphologySummary';
import { SegmentCard } from './SegmentCard';
import { FullAnalysis } from './FullAnalysis';

interface WordDetailViewProps {
  detail: WordDetail;
  gloss?: string;
  rootHref?: string;
}

export function WordDetailView({ detail, gloss, rootHref }: WordDetailViewProps) {
  const { word, segments, concept_tags } = detail;
  const orderedSegments = [...segments].sort((a, b) => a.segment_index - b.segment_index);
  const decoded = orderedSegments.map((seg) => ({ id: seg.id, decoded: decodeSegment(seg) }));

  return (
    <article className="space-y-8">
      <header className="mx-auto max-w-md">
        <SegmentedWord word={word} segments={orderedSegments} {...(gloss ? { gloss } : {})} />
      </header>

      <MorphologySummary word={word} {...(gloss ? { gloss } : {})} />

      {decoded.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-paper-500">
            Segments
          </h2>
          <div className="space-y-3">
            {decoded.map((d, i) => (
              <SegmentCard key={d.id} segment={d.decoded} index={i} />
            ))}
          </div>
        </section>
      )}

      <FullAnalysis
        {...(word.morphology_description ? { description: word.morphology_description } : {})}
        {...(word.grammar_arabic ? { grammarArabic: word.grammar_arabic } : {})}
      />

      {concept_tags.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-paper-500">
            Concepts
          </h2>
          <div className="flex flex-wrap gap-2">
            {concept_tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-paper-200 px-3 py-1 text-sm text-paper-700 dark:bg-night-100 dark:text-paper-300"
              >
                {tag.tag_label}
              </span>
            ))}
          </div>
        </section>
      )}

      {rootHref && (
        <Link
          href={rootHref}
          className="inline-flex items-center gap-1 rounded-full bg-paper-900 px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-paper-700 dark:bg-paper-100 dark:text-night-200"
        >
          View root in dictionary →
        </Link>
      )}
    </article>
  );
}
```

- [ ] **Step 8: Run WordDetailView test + full type-check**

Run: `pnpm --filter @quran-corpus/web test -- WordDetailView && pnpm --filter @quran-corpus/web type-check`
Expected: WordDetailView PASS (3 tests); type-check PASS (SegmentCard now fed `DecodedSegment` from Task 3 — mismatch resolved).

- [ ] **Step 9: Full quality gate**

Run: `pnpm --filter @quran-corpus/web lint && pnpm --filter @quran-corpus/web test && pnpm --filter @quran-corpus/data test`
Expected: all PASS. (`exactOptionalPropertyTypes` is why `description`/`grammarArabic` are spread conditionally — never pass `undefined`.)

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/morphology/WordDetailView.tsx apps/web/src/components/morphology/MorphologySummary.tsx apps/web/src/test/WordDetailView.test.tsx apps/web/src/test/MorphologySummary.test.tsx
git commit -m "feat(web): decode word-page grammar, move prose to FullAnalysis"
```

---

## Notes / risks

- **Reader popover regression (intended):** `WordPopover` reuses `MorphologySummary`; trimming drops verbatim prose + Arabic from the popover. Spec accepts this (popover = quick glance; full page = detail). No popover code change; its existing test `WordPopover.test.tsx` must still pass — verify in Task 5 Step 9's full `web test` run.
- **Decode site = RSC:** `WordDetailView` is a server component (no `'use client'`), so `decodeSegment` runs server-side and the label tables never enter the client bundle. Only `FullAnalysis` is `'use client'`.
- **Framer height:auto:** `AnimatePresence` + `motion.div` animating `height: 'auto'` is measured by Framer natively — no manual ref measurement.
- **Out of scope:** concept tags (parser stub, 0 rows), any scraper/schema/query change, reader popover redesign.
