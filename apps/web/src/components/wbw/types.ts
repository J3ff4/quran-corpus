import type { Surah, SurahName, WordSegment } from '@quran-corpus/data';

export interface PickerSurah {
  id: number;
  /** Already localized -- the picker labels options with it verbatim. */
  name: string;
  ayah_count: number;
}

/** `names` comes from `getSurahNames`, which already covers all 114 with a
 *  per-surah fallback; the `??` guards a caller that passes a partial map. */
export function toPickerSurah(
  s: Pick<Surah, 'id' | 'name_translit' | 'ayah_count'>,
  names: Map<number, SurahName>,
): PickerSurah {
  return {
    id: s.id,
    name: names.get(s.id)?.name ?? s.name_translit,
    ayah_count: s.ayah_count,
  };
}

export interface WbwCell {
  surahId: number;
  ayahNumber: number;
  position: number;
  arabic: string;
  translit: string | null;
  gloss: string | null;
  glossLang: string | null;
  /** The span this word's gloss covers; NULL when the gloss is its own. */
  glossGroup: number | null;
  posTag: string | null;
  posLabel: string | null;
  segments: WordSegment[];
  grammarNote: string | null;
}

export interface WbwAyah {
  ayahNumber: number;
  cells: WbwCell[];
  textUthmani: string;
}
