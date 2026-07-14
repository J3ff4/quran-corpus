const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

interface BismillahProps {
  surahId: number;
}

/**
 * Basmala banner shown atop a surah's ayahs. Every surah opens with it except
 * Al-Fatiha (1, where it's ayah 1 itself) and At-Tawba (9, which has none).
 */
export function Bismillah({ surahId }: BismillahProps) {
  if (surahId === 1 || surahId === 9) return null;

  return (
    <p
      dir="rtl"
      aria-label="Bismillah"
      className="font-arabic my-4 text-center text-2xl text-paper-900 dark:text-paper-100"
    >
      {BASMALA}
    </p>
  );
}
