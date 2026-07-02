import type { Ayah, Word } from '@quran-corpus/data';

export interface WordLoc {
  surah: number;
  ayah: number;
  position: number;
}

export function wordLocation(ayah: Ayah, word: Word): WordLoc {
  return { surah: ayah.surah_id, ayah: ayah.ayah_number, position: word.position };
}

export function wordHref(loc: WordLoc): string {
  return `/word/${loc.surah}/${loc.ayah}/${loc.position}`;
}
