import type { Surah, WordSegment } from '@quran-corpus/data';

export interface PickerSurah {
  id: number;
  name_translit: string;
  ayah_count: number;
}

export function toPickerSurah(s: Pick<Surah, 'id' | 'name_translit' | 'ayah_count'>): PickerSurah {
  return { id: s.id, name_translit: s.name_translit, ayah_count: s.ayah_count };
}

export interface WbwCell {
  surahId: number;
  ayahNumber: number;
  position: number;
  arabic: string;
  translit: string | null;
  gloss: string | null;
  glossLang: string | null;
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
