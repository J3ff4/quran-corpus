export interface VerseRef {
  surah: number;
  ayah: number | null;
  position: number | null;
}

export interface Surah {
  id: number;
  name_arabic: string;
  name_translit: string;
  name_translation: string;
  revelation_type: 'meccan' | 'medinan';
  ayah_count: number;
  order_number: number;
}

export interface Ayah {
  id: number;
  surah_id: number;
  ayah_number: number;
  text_uthmani: string;
  text_simple: string | null;
  juz: number | null;
  page: number | null;
  audio_url: string | null;
}

export interface Word {
  id: number;
  ayah_id: number;
  position: number;
  text_arabic: string;
  transliteration: string | null;
  root: string | null;
  lemma: string | null;
  root_buckwalter: string | null;
  lemma_buckwalter: string | null;
  pos_tag: string | null;
  morphology_json: string | null;
  morphology_description: string | null;
  grammar_arabic: string | null;
  grammar_note: string | null;
  audio_url: string | null;
}

export interface Language {
  code: string;
  name_native: string;
  name_english: string;
  direction: 'ltr' | 'rtl';
}

export interface Translation {
  id: number;
  ayah_id: number;
  language_code: string;
  translator: string;
  text: string;
}

export interface WordGloss {
  id: number;
  word_id: number;
  language_code: string;
  gloss_text: string;
}

export interface Root {
  id: number;
  root_buckwalter: string;
  root_arabic: string;
  occurrence_count: number;
}

export interface RootSearchItem {
  id: number;
  root_buckwalter: string;
  root_arabic: string;
  occurrence_count: number;
  /** Space-joined form glosses for this root, lowercased at the call site for
   *  search matching. Null when the root has no forms with a gloss. */
  gloss_blob: string | null;
}

export interface RootForm {
  id: number;
  root_id: number;
  sort_order: number;
  pos_label: string;
  form_arabic: string | null;
  form_translit: string | null;
  gloss: string | null;
  occurrence_count: number;
}

export interface RootDefinition {
  id: number;
  root_id: number;
  source: string;
  definition: string;
}

export interface RootEntry {
  root: Root;
  forms: RootForm[];
  definitions: RootDefinition[];
}

export interface VerseWord {
  id: number;
  position: number;
  text_arabic: string;
  /** True if this word begins a new clause (first segment's pos_tag ∈ boundary
   *  set: SUB/REM -- subordinating conjunctions and resumptive particles,
   *  i.e. genuine sentence-starters. Plain coordinating CONJ (wa-/fa-) is
   *  deliberately excluded: it fires on almost every item in an enumerated
   *  list ("X and Y and Z"), which isn't a clause boundary. Present only on
   *  concordance verses; absent elsewhere. */
  starts_clause?: boolean;
}

export interface ConcordanceEntry {
  surah_id: number;
  ayah_number: number;
  position: number;
  word_id: number;
  text_arabic: string;
  transliteration: string | null;
  gloss: string | null;
  verse_words: VerseWord[];
  /** The derived form (root_forms.id) this occurrence's lemma matches, via
   *  exact lemma-text join -- null when no root_forms row has a matching
   *  form_arabic (data gap; occurrence still shows, just untagged/unfiltered). */
  form_id: number | null;
}

export interface WordSegment {
  id: number;
  word_id: number;
  segment_index: number;
  segment_type: string | null;
  pos_tag: string | null;
  form_arabic: string | null;
  form_buckwalter: string | null;
  features_json: string | null;
  lemma: string | null;
  root: string | null;
}

export interface ConceptTag {
  id: number;
  word_id: number;
  tag_label: string;
  tag_type: string | null;
}

export interface WordDetail {
  word: Word;
  segments: WordSegment[];
  concept_tags: ConceptTag[];
}

export interface LemmaFrequencyEntry {
  lemma: string;
  lemma_buckwalter: string | null;
  count: number;
}

export interface VerbConcordanceEntry {
  lemma: string | null;
  lemma_buckwalter: string | null;
  form_arabic: string;
  count: number;
}

/** One grammatical sense a lemma is tagged with, and how often. A lemma is not
 *  necessarily one part of speech: مَا is tagged six ways (relative 1266,
 *  negative 704, interrogative 92, subordinating 79, conditional 23,
 *  superlative 13), so naming only the commonest misdescribes 42% of its
 *  occurrences. */
export interface LemmaSense {
  pos_tag: string;
  /** Human label via posLabelEn; falls back to the raw tag. */
  pos_label: string;
  count: number;
}

export interface LemmaEntry {
  lemma: string;
  lemma_buckwalter: string;
  transliteration: string | null;
  root_buckwalter: string | null;
  count: number;
  /** Every POS this lemma is tagged with, most frequent first. Length >1 means
   *  the header must show the breakdown rather than a single label. */
  senses: LemmaSense[];
  /** Most frequent word-by-word glosses, cleaned and de-duplicated, commonest
   *  first. Contextual translations, NOT definitions -- see text/gloss.ts. */
  top_glosses: string[];
  root_definition: string | null;
  /** `root_definitions.source` of the definition above; null when there is
   *  none. Carried so the page can credit it — the text is third-party and
   *  licensed (§11), and which source won depends on what the root has. */
  root_definition_source: string | null;
}

export interface VerseHit {
  surah_id: number;
  ayah_number: number;
  source: string;
  snippet: string;
}

export interface JumpVerse {
  surah_id: number;
  ayah_number: number | null;
  text_uthmani: string;
  words: { position: number; text_arabic: string }[];
  highlightPosition: number | null;
}

export interface SearchResult {
  jump: JumpVerse | null;
  verses: VerseHit[];
  roots: Root[];
}

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
