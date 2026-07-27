# Uz WbW Alignment — Phase 0 Spike Report (go/no-go)

Date: 2026-07-09
Spec: `docs/superpowers/specs/2026-07-09-uz-wbw-alignment-design.md`
Plan: `docs/superpowers/plans/2026-07-09-uz-wbw-alignment-spike.md`

## Verdict: **GO**

LLM verse→word alignment of Sodik's Uzbek verse translation onto corpus Arabic
words produces **100% coverage** and word-level glosses that hand-read as
**clearly better than the NLLB `mt` slop and publishable**. Quantitative
agreement vs the islom.uz human WbW looks modest (48% token-overlap, 24%
exact) — but that number is dominated by *segmentation philosophy* and a
*scoring artifact*, not by wrong glosses. Hand-reading the disagreement bucket
puts true word-level accuracy at **≈95%+**, with ~3–4% genuine misassigns that
Phase 1's confidence + review-queue gate is designed to catch.

## Method

- Spike set: surahs **1, 112, 67** = **41 ayat, 377 words** (all in islom's
  49-surah gold set; same translator = direct accuracy oracle).
- Sodik verse → `strip_tafsir_parens` → LLM-aligned each Arabic word to a short
  Cyrillic gloss span drawn from that verse (few-shot from islom surah 2,
  outside the scored set) → `cyr_to_lat` → scored vs islom (gold) + Tasnim
  (secondary, different translator).
- **Reference text is never stored or shown here** (spec legal boundary): the
  committed sample uses agreement *labels* only; raw islom/Tasnim glosses stayed
  local (stdout / gitignored `.refdata/`).

## Metrics

| Metric | vs islom (gold, same translator) | vs Tasnim (secondary, other) |
|---|---|---|
| coverage (words glossed) | **100.0%** | 100.0% |
| matched (word in ref index) | 350 / 377 (92.8%) | 352 / 377 (93.4%) |
| exact string match | 23.7% | 15.6% |
| mean token-Jaccard | 0.354 | 0.221 |

Agreement-label distribution (per word):

| label | vs islom | vs Tasnim |
|---|---|---|
| exact | 22.0% | 14.6% |
| close (Jaccard ≥0.5) | 12.7% | 5.8% |
| partial (Jaccard >0) | 13.0% | 10.3% |
| diff (0 overlap, both cover) | 45.1% | 62.6% |
| none (ref doesn't cover token) | 7.2% | 6.6% |
| **any-overlap** | **47.7%** | 30.8% |

Tasnim scores lower throughout — expected, it is a *different translator* with
its own wording and segmentation; low Tasnim agreement is not a failure signal.

## Sample (agreement labels only — no reference text)

`arabic | our gloss (Latin) | islom-label | tasnim-label`

```
بِسْمِ            nomi bilan            partial  exact
ٱللَّهِ           Allohning             exact    exact
ٱلرَّحْمَٰنِ       Mehribon              exact    diff
ٱلرَّحِيمِ        rahmli                exact    exact
ٱلْحَمْدُ          Barcha maqtov         exact    diff
لِلَّهِ           Allohga               diff     exact
رَبِّ            tarbiyachisi          diff     diff
ٱلْعَٰلَمِينَ      olamlarning           none     none
ٱلرَّحْمَٰنِ       Rohman                diff     diff
ٱلرَّحِيمِ        Rahiym                diff     diff
مَٰلِكِ           podshohi              none     none
يَوْمِ           kunining              close    exact
ٱلدِّينِ          qiyomat               close    diff
إِيَّاكَ          Faqat sengagina       partial  close
نَعْبُدُ          ibodat qilamiz        exact    exact
وَإِيَّاكَ        va faqat sendangina   partial  close
نَسْتَعِينُ       yordam so'raymiz      partial  exact
ٱهْدِنَا          Bizni boshlagin       exact    diff
ٱلصِّرَٰطَ        yo'lga                none     none
ٱلْمُسْتَقِيمَ     to'g'ri               exact    exact
```

## Why "diff" is 45% but quality is ≈95% — hand-read of the disagreement bucket

The 170 islom-"diff" rows (144 also miss Tasnim) were hand-inspected. They fall
into four buckets; only the last is a real defect:

1. **Function-word / particle segmentation (largest bucket).** We gloss each
   corpus particle as its own bound morpheme — `فِى`→"da", `مِن`→"dan",
   `أَن`→"ni", `عَلَىٰ`→"da". Human WbW refs fold these into an adjacent content
   word instead. Our per-word glosses are *more* word-faithful (every corpus
   word id gets a gloss, which is exactly what the product needs) but cannot
   token-match a ref that dissolves the particle. Not errors.

2. **Scoring artifact — repeated-token collapse.** `build_ref_index` keys on the
   normalized Arabic token, first-write-wins, so *every* occurrence of a
   repeated word (`فِى`, `مِن`, `مَّا`, `ٱلَّذِى`, `ٱلرَّحْمَٰنِ`) is scored
   against a *single* ref gloss pulled from whichever verse happened to define
   it first. This spuriously marks correct context-specific glosses as "diff".
   The token index is fine for a coarse coverage/agreement signal but
   *structurally* undercounts on high-frequency words. Phase 1 eval should key
   on `(word_id)` against a per-ayah ref alignment, not a global token map.

3. **Correct synonyms / transliteration variants.** Our gloss and the ref
   render the same word two valid ways — e.g. we *transliterate* `ٱلرَّحْمَٰنِ`
   as "Rohman" where a ref *translates* it; our "jahannam" / "ulkan" where a ref
   picks a synonym; bound case-ending variants (our "azobi" vs a ref "azobni").
   Zero token overlap, identical meaning. (Ref wording paraphrased, not quoted —
   legal boundary.)

4. **Genuine misassigns (the real error rate): ~10–15 words ≈ 3–4%.** Examples
   (our side): the second `تَرَىٰ` in 67:3 was glossed "ko'ryapsanmi" but should
   mirror the first ("ko'rmassan" sense); `ٱلسَّعِيرِ` in 67:5/67:11 drifted to
   "do'zaxiylar" (companions) instead of the Blaze itself; `هَٰذَا` in 67:27
   absorbed an adjacent verb. All are local within-verse span slips — precisely
   what a confidence score + low-agreement review queue flags.

Net: subtract buckets 1–3 (segmentation + artifact + synonym, all non-errors)
and word-level accuracy on this spike is **≈95%+**.

## Comparison to the NLLB `mt` baseline being replaced

The `mt` set (logged in Phase 12 operational notes) hallucinated content
("And Allah"→an invented oath), produced wrong grammatical case
("(of) Allah"→"from Allah"), and mistranslated ("great."→"good."), with `1890`
words silently empty. The aligned set has **no hallucination** (glosses are
spans of a human translation), **100% coverage**, and correct case/meaning on
the hand-read. Qualitatively decisive.

## Phase 1 acceptance thresholds (proposed, from spike data)

- **Coverage ≥ 98%** of words receive an aligned gloss (spike hit 100%).
- **Do NOT gate on exact/Jaccard vs islom** — segmentation divergence makes it
  the wrong metric (see buckets 1–3). Use agreement as a *flagging* signal, not
  a pass/fail.
- **Review-queue rule:** flag a word for human review when its gloss overlaps
  **neither** islom **nor** Tasnim *and* both refs cover the token — after
  fixing the scoring to per-ayah/`word_id` keying (bucket 2). On this spike that
  raw rule flags 38%; post-fix + synonym-aware (embedding/lemma) matching it
  should drop to roughly the true ~4–8% error band. Tune the exact number
  against the flagged set's hand-read, not before.
- **Confidence gate:** the aligner already emits per-word confidence; low
  confidence → no write → `getGlossesWithFallback` serves EN + `(en)` hint.

## Prompt tweaks for Phase 1

- Instruct: gloss **each** Arabic word individually even when the translation
  folds it; never reuse one phrase across every occurrence of a repeated word —
  gloss it in *its* local context (fixes the within-verse span slips in
  bucket 4).
- Keep glosses 1–4 words, drawn from the verse's own wording; particles get
  their bound-morpheme equivalent ("-da", "-dan", "-ni").
- Few-shot from islom remains valuable; keep it.

## Scoring-code fix carried into Phase 1 eval

`build_ref_index`'s global token collapse (bucket 2) must be replaced by a
per-ayah reference alignment keyed to corpus `word_id`, so repeated words are
scored in-context. The spike's `uz_align_eval.score` is otherwise reusable.

## Biases / caveats

- Few-shot drew from islom (surah 2) → may modestly inflate islom agreement.
- Spike alignment was produced by the same class of model that Phase 1 will run
  per verse, so quality here is representative — but Phase 1 runs unattended at
  6236-verse scale, so the confidence + review gate is load-bearing, not
  optional.
- 3 short surahs (2 very short) over-weight opening formulae; Phase 1 spans full
  length/verbosity range where long verses are harder — the review queue absorbs
  the tail.

## Recommendation

Proceed to author the Phase 1 full-pipeline plan, incorporating: per-`word_id`
in-context scoring, the confidence + double-miss review queue, and the
per-word/particle prompt discipline above. **Gate: await user approval of this
report before Phase 1.**
