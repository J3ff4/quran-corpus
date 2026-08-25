export interface AyahCoordinate {
  surah: number;
  ayah: number;
}

/**
 * Owner-curated. Do not add to this list without asking -- it is editorial
 * content, not data (umbrella decision 24).
 *
 * PENDING THE OWNER'S STRIKE-THROUGH. This is the full 118-candidate draft from
 * docs/design/m6/ayah-of-the-day-draft.md, which has not been reviewed yet: no
 * entry has been struck, so nothing has been removed. Every coordinate was
 * re-validated against the live corpus DB -- each ayah exists and each has an
 * English translation row, so none can render blank -- but that is correctness,
 * not editorial approval. Deleting a line here is all a strike takes.
 *
 * At 118 the rotation repeats roughly every four months.
 */
export const AYAH_OF_THE_DAY: readonly AyahCoordinate[] = [
  { surah: 1, ayah: 1 }, // Al-Fatiha
  { surah: 1, ayah: 5 }, // Al-Fatiha
  { surah: 1, ayah: 6 }, // Al-Fatiha
  { surah: 2, ayah: 152 }, // Al-Baqara
  { surah: 2, ayah: 153 }, // Al-Baqara
  { surah: 2, ayah: 186 }, // Al-Baqara
  { surah: 2, ayah: 216 }, // Al-Baqara
  { surah: 2, ayah: 255 }, // Al-Baqara
  { surah: 2, ayah: 261 }, // Al-Baqara
  { surah: 2, ayah: 263 }, // Al-Baqara
  { surah: 2, ayah: 277 }, // Al-Baqara
  { surah: 2, ayah: 285 }, // Al-Baqara
  { surah: 2, ayah: 286 }, // Al-Baqara
  { surah: 3, ayah: 8 }, // Aal-Imran
  { surah: 3, ayah: 26 }, // Aal-Imran
  { surah: 3, ayah: 31 }, // Aal-Imran
  { surah: 3, ayah: 103 }, // Aal-Imran
  { surah: 3, ayah: 133 }, // Aal-Imran
  { surah: 3, ayah: 139 }, // Aal-Imran
  { surah: 3, ayah: 159 }, // Aal-Imran
  { surah: 3, ayah: 185 }, // Aal-Imran
  { surah: 3, ayah: 190 }, // Aal-Imran
  { surah: 4, ayah: 36 }, // An-Nisa
  { surah: 4, ayah: 58 }, // An-Nisa
  { surah: 4, ayah: 135 }, // An-Nisa
  { surah: 5, ayah: 8 }, // Al-Maidah
  { surah: 5, ayah: 32 }, // Al-Maidah
  { surah: 6, ayah: 59 }, // Al-Anam
  { surah: 6, ayah: 162 }, // Al-Anam
  { surah: 7, ayah: 56 }, // Al-Araf
  { surah: 7, ayah: 180 }, // Al-Araf
  { surah: 7, ayah: 199 }, // Al-Araf
  { surah: 7, ayah: 204 }, // Al-Araf
  { surah: 8, ayah: 2 }, // Al-Anfal
  { surah: 8, ayah: 46 }, // Al-Anfal
  { surah: 9, ayah: 40 }, // At-Tawbah
  { surah: 9, ayah: 51 }, // At-Tawbah
  { surah: 9, ayah: 129 }, // At-Tawbah
  { surah: 10, ayah: 57 }, // Yunus
  { surah: 10, ayah: 62 }, // Yunus
  { surah: 11, ayah: 88 }, // Hud
  { surah: 11, ayah: 114 }, // Hud
  { surah: 12, ayah: 4 }, // Yusuf
  { surah: 12, ayah: 87 }, // Yusuf
  { surah: 12, ayah: 101 }, // Yusuf
  { surah: 13, ayah: 11 }, // Ar-Rad
  { surah: 13, ayah: 28 }, // Ar-Rad
  { surah: 14, ayah: 7 }, // Ibrahim
  { surah: 14, ayah: 34 }, // Ibrahim
  { surah: 15, ayah: 9 }, // Al-Hijr
  { surah: 16, ayah: 18 }, // An-Nahl
  { surah: 16, ayah: 90 }, // An-Nahl
  { surah: 16, ayah: 97 }, // An-Nahl
  { surah: 16, ayah: 128 }, // An-Nahl
  { surah: 17, ayah: 23 }, // Al-Isra
  { surah: 17, ayah: 24 }, // Al-Isra
  { surah: 17, ayah: 80 }, // Al-Isra
  { surah: 17, ayah: 82 }, // Al-Isra
  { surah: 18, ayah: 10 }, // Al-Kahf
  { surah: 18, ayah: 46 }, // Al-Kahf
  { surah: 18, ayah: 110 }, // Al-Kahf
  { surah: 19, ayah: 96 }, // Maryam
  { surah: 20, ayah: 114 }, // Ta-Ha
  { surah: 20, ayah: 124 }, // Ta-Ha
  { surah: 21, ayah: 87 }, // Al-Anbiya
  { surah: 21, ayah: 107 }, // Al-Anbiya
  { surah: 22, ayah: 46 }, // Al-Hajj
  { surah: 23, ayah: 1 }, // Al-Muminun
  { surah: 23, ayah: 118 }, // Al-Muminun
  { surah: 24, ayah: 22 }, // An-Nur
  { surah: 24, ayah: 35 }, // An-Nur
  { surah: 25, ayah: 63 }, // Al-Furqan
  { surah: 25, ayah: 74 }, // Al-Furqan
  { surah: 26, ayah: 80 }, // Ash-Shuara
  { surah: 28, ayah: 77 }, // Al-Qasas
  { surah: 29, ayah: 69 }, // Al-Ankabut
  { surah: 30, ayah: 21 }, // Ar-Rum
  { surah: 30, ayah: 22 }, // Ar-Rum
  { surah: 31, ayah: 18 }, // Luqman
  { surah: 31, ayah: 34 }, // Luqman
  { surah: 33, ayah: 35 }, // Al-Ahzab
  { surah: 33, ayah: 56 }, // Al-Ahzab
  { surah: 33, ayah: 70 }, // Al-Ahzab
  { surah: 35, ayah: 5 }, // Fatir
  { surah: 36, ayah: 82 }, // Ya-Sin
  { surah: 39, ayah: 53 }, // Az-Zumar
  { surah: 40, ayah: 60 }, // Ghafir
  { surah: 41, ayah: 33 }, // Fussilat
  { surah: 41, ayah: 34 }, // Fussilat
  { surah: 42, ayah: 43 }, // Ash-Shura
  { surah: 46, ayah: 15 }, // Al-Ahqaf
  { surah: 47, ayah: 7 }, // Muhammad
  { surah: 48, ayah: 29 }, // Al-Fath
  { surah: 49, ayah: 10 }, // Al-Hujurat
  { surah: 49, ayah: 12 }, // Al-Hujurat
  { surah: 49, ayah: 13 }, // Al-Hujurat
  { surah: 50, ayah: 16 }, // Qaf
  { surah: 51, ayah: 56 }, // Adh-Dhariyat
  { surah: 53, ayah: 39 }, // An-Najm
  { surah: 55, ayah: 13 }, // Ar-Rahman
  { surah: 57, ayah: 4 }, // Al-Hadid
  { surah: 59, ayah: 22 }, // Al-Hashr
  { surah: 64, ayah: 11 }, // At-Taghabun
  { surah: 65, ayah: 2 }, // At-Talaq
  { surah: 67, ayah: 2 }, // Al-Mulk
  { surah: 73, ayah: 8 }, // Al-Muzzammil
  { surah: 76, ayah: 8 }, // Al-Insan
  { surah: 89, ayah: 27 }, // Al-Fajr
  { surah: 93, ayah: 5 }, // Ad-Duha
  { surah: 93, ayah: 7 }, // Ad-Duha
  { surah: 94, ayah: 5 }, // Ash-Sharh
  { surah: 103, ayah: 2 }, // Al-Asr
  { surah: 103, ayah: 3 }, // Al-Asr
  { surah: 107, ayah: 7 }, // Al-Maun
  { surah: 109, ayah: 6 }, // Al-Kafirun
  { surah: 112, ayah: 1 }, // Al-Ikhlas
  { surah: 113, ayah: 1 }, // Al-Falaq
  { surah: 114, ayah: 1 }, // An-Nas
];

/**
 * The day's ayah: a cycle through the list, indexed by day number.
 *
 * A cycle rather than a hash of the date string: hashing collides, which shows
 * the same ayah twice in a fortnight while some entries never appear at all.
 * The day number keeps it deterministic -- same day, same ayah, nothing stored
 * -- and walks the whole list in order before repeating.
 */
export function ayahForDay(day: string): AyahCoordinate {
  const dayNumber = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000);
  // Twice-modulo, not once: JS `%` keeps the sign of the left operand, so a day
  // before 1970 would index past the start of the array and hand the card an
  // undefined coordinate.
  const index = ((dayNumber % AYAH_OF_THE_DAY.length) + AYAH_OF_THE_DAY.length) % AYAH_OF_THE_DAY.length;
  const entry = AYAH_OF_THE_DAY[index];
  if (!entry) throw new Error(`no ayah for day ${day}`);
  return entry;
}
