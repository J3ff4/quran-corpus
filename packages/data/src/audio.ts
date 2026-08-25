// Where recitation audio for an ayah comes from.
//
// Shared because web and mobile were about to disagree: the web reader built
// this URL inline in useAyahAudio, and mobile needed the same source once it
// turned out no thin endpoint has ever been deployed. Two copies of a URL
// template mean two reciters the day one of them is changed.
//
// Pure string work with no imports, so it is safe in the browser bundle, in the
// Metro graph, and in node alike.

/** everyayah.com serves every reciter below as static per-ayah mp3. */
export const AYAH_AUDIO_ORIGIN = 'https://everyayah.com';

export interface Reciter {
  /** Stable app-side id. This is what gets persisted, never the folder. */
  id: string;
  /** everyayah.com path segment. */
  folder: string;
  /** Display name, English. */
  label: string;
  bitrateKbps: 64 | 128;
}

/**
 * The reciters the apps offer, and the allowlist `ayahAudioUrl` validates
 * against.
 *
 * Muallim and Minshawy-Murattal are 128 kbps because everyayah has no 64 kbps
 * folder for them. That is the umbrella plan's "prefer 64, fall back to the
 * highest available" resolved at authoring time rather than at runtime: which
 * bitrates exist is a fixed property of the host, not something to probe.
 *
 * Alafasy is deliberately absent (owner ruling, umbrella decision 37). He is
 * the default in most Quran apps and in the mockup, so this is exactly the
 * entry a later well-meaning edit adds back; `audio.test.ts` fails if it
 * returns.
 *
 * Every folder returned HTTP 200 for 002255.mp3 when probed 2026-08-25.
 */
export const RECITERS: readonly Reciter[] = [
  { id: 'husary', folder: 'Husary_64kbps', label: 'Mahmoud Khalil Al-Husary (Murattal)', bitrateKbps: 64 },
  { id: 'husary-muallim', folder: 'Husary_Muallim_128kbps', label: 'Al-Husary (Muallim)', bitrateKbps: 128 },
  { id: 'husary-mujawwad', folder: 'Husary_Mujawwad_64kbps', label: 'Al-Husary (Mujawwad)', bitrateKbps: 64 },
  { id: 'minshawy', folder: 'Minshawy_Murattal_128kbps', label: 'Mohamed Siddiq El-Minshawi (Murattal)', bitrateKbps: 128 },
  { id: 'minshawy-mujawwad', folder: 'Minshawy_Mujawwad_64kbps', label: 'El-Minshawi (Mujawwad)', bitrateKbps: 64 },
  { id: 'abdul-basit', folder: 'Abdul_Basit_Murattal_64kbps', label: 'Abdul Basit (Murattal)', bitrateKbps: 64 },
  { id: 'sudais', folder: 'Abdurrahmaan_As-Sudais_64kbps', label: 'Abdurrahman As-Sudais', bitrateKbps: 64 },
  { id: 'shuraym', folder: 'Saood_ash-Shuraym_64kbps', label: 'Saud Al-Shuraim', bitrateKbps: 64 },
  { id: 'shatri', folder: 'Abu_Bakr_Ash-Shaatree_64kbps', label: 'Abu Bakr Al-Shatri', bitrateKbps: 64 },
  { id: 'ayyoub', folder: 'Muhammad_Ayyoub_64kbps', label: 'Muhammad Ayyoub', bitrateKbps: 64 },
];

/**
 * Husary on both products (owner ruling 2026-08-24, umbrella decision 38).
 *
 * `ayahAudioUrl` is shared, so the web reader moves off Abdul Basit with this
 * constant. That is intended, not an oversight.
 */
export const DEFAULT_RECITER_ID = 'husary';

/** The reciter with this id, or null. Never throws; callers decide. */
export function reciterById(id: string): Reciter | null {
  return RECITERS.find((reciter) => reciter.id === id) ?? null;
}

// A cheap upper bound (286 = al-Baqarah, the longest surah). The point is to
// keep a non-integer or out-of-range value out of the URL, not to know each
// surah's exact length -- a coordinate inside the bound but past its surah's
// end simply 404s at the host.
const MAX_SURAH = 114;
const MAX_AYAH = 286;

/**
 * The public audio URL for one ayah.
 *
 * Every input is validated rather than interpolated as given: this builds a URL
 * that is handed straight to a media player, so a caller passing something like
 * `'1/../..'` must not be able to steer the path.
 */
export function ayahAudioUrl(
  surahId: number,
  ayahNumber: number,
  reciterId: string = DEFAULT_RECITER_ID,
): string {
  if (!Number.isInteger(surahId) || surahId < 1 || surahId > MAX_SURAH) {
    throw new RangeError(`surahId must be an integer in 1..${MAX_SURAH}, got ${surahId}`);
  }
  if (!Number.isInteger(ayahNumber) || ayahNumber < 1 || ayahNumber > MAX_AYAH) {
    throw new RangeError(`ayahNumber must be an integer in 1..${MAX_AYAH}, got ${ayahNumber}`);
  }

  // Looked up, never interpolated. This value comes from a row in the
  // on-device settings table, and it lands in a URL path -- a folder of
  // '../..' would walk off the audio host entirely. RECITERS is the allowlist.
  const reciter = reciterById(reciterId);
  if (!reciter) throw new RangeError(`Unknown reciter ${reciterId}`);

  const surah = String(surahId).padStart(3, '0');
  const ayah = String(ayahNumber).padStart(3, '0');
  return `${AYAH_AUDIO_ORIGIN}/data/${reciter.folder}/${surah}${ayah}.mp3`;
}
