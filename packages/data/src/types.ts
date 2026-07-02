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

export interface ConcordanceEntry {
  surah_id: number;
  ayah_number: number;
  position: number;
  word_id: number;
  text_arabic: string;
  transliteration: string | null;
  gloss: string | null;
  verse_text: string;
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
  form_arabic: string;
  count: number;
}
