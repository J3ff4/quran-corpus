export const dynamic = 'force-dynamic';

import { getLemmaFrequency } from '@quran-corpus/data';
import { getDatabase } from '../../../lib/db';
import { FrequencyTable } from '../../../components/dictionary/FrequencyTable';

export default async function LemmaFrequencyPage() {
  const db = await getDatabase();
  const rows = (await getLemmaFrequency(db)).map((r) => ({ label: r.lemma, count: r.count }));
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">
        Lemma Frequency
      </h1>
      <FrequencyTable caption="Lemma Frequency" rows={rows} />
    </main>
  );
}
