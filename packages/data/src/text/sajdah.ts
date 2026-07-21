/** Ayahs of prostration (sajdah tilawah) mark themselves in the Tanzil-sourced
 *  Uthmani text with U+06E9 ARABIC PLACE OF SAJDAH (۩) -- present for exactly
 *  the 15 ayahs of the Shafi'i/Hanbali convention. Deriving from that existing
 *  character avoids a hand-authored (surah, ayah) list that could drift out of
 *  sync with a future re-import. */
export function isSajdahAyah(textUthmani: string): boolean {
  return textUthmani.includes('۩');
}
