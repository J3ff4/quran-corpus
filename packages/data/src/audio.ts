// Where recitation audio for an ayah comes from.
//
// Shared because web and mobile were about to disagree: the web reader built
// this URL inline in useAyahAudio, and mobile needed the same source once it
// turned out no thin endpoint has ever been deployed. Two copies of a URL
// template mean two reciters the day one of them is changed.
//
// Pure string work with no imports, so it is safe in the browser bundle, in the
// Metro graph, and in node alike.

/** The recitation both apps play. everyayah.com serves it as static mp3. */
export const AYAH_AUDIO_RECITER = 'Abdul_Basit_Murattal_64kbps';
export const AYAH_AUDIO_ATTRIBUTION = 'Abdul Basit Murattal — everyayah.com';
export const AYAH_AUDIO_ORIGIN = 'https://everyayah.com';

// A cheap upper bound (286 = al-Baqarah, the longest surah). The point is to
// keep a non-integer or out-of-range value out of the URL, not to know each
// surah's exact length -- a coordinate inside the bound but past its surah's
// end simply 404s at the host.
const MAX_SURAH = 114;
const MAX_AYAH = 286;

/**
 * The public audio URL for one ayah.
 *
 * Both coordinates are validated rather than interpolated as given: this
 * builds a URL that is handed straight to a media player, so a caller passing
 * something like `'1/../..'` must not be able to steer the path.
 */
export function ayahAudioUrl(surahId: number, ayahNumber: number): string {
  if (!Number.isInteger(surahId) || surahId < 1 || surahId > MAX_SURAH) {
    throw new RangeError(`surahId must be an integer in 1..${MAX_SURAH}, got ${surahId}`);
  }
  if (!Number.isInteger(ayahNumber) || ayahNumber < 1 || ayahNumber > MAX_AYAH) {
    throw new RangeError(`ayahNumber must be an integer in 1..${MAX_AYAH}, got ${ayahNumber}`);
  }

  const surah = String(surahId).padStart(3, '0');
  const ayah = String(ayahNumber).padStart(3, '0');
  return `${AYAH_AUDIO_ORIGIN}/data/${AYAH_AUDIO_RECITER}/${surah}${ayah}.mp3`;
}
