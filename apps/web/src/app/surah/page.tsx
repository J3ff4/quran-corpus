import { getDatabase } from '../../lib/db';
import { getAllSurahs } from '@quran-corpus/data';
import { SurahCard } from '../../components/surah-list/SurahCard';

export const metadata = { title: 'Surahs — Quran Corpus' };

export default async function SurahListPage() {
  const db = await getDatabase();
  const surahs = await getAllSurahs(db);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">
        Quran
      </h1>
      {surahs.length === 0 ? (
        <p className="text-paper-500">
          No surahs found. Run{' '}
          <code className="rounded bg-paper-200 px-1 py-0.5 text-sm dark:bg-night-100">
            uv run scraper seed
          </code>{' '}
          to seed the database.
        </p>
      ) : (
        <ul className="space-y-2">
          {surahs.map((surah) => (
            <li key={surah.id}>
              <SurahCard surah={surah} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
