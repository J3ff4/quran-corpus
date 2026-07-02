export const dynamic = 'force-dynamic';

import { getVerbConcordance } from '@quran-corpus/data';
import { getDatabase } from '../../../lib/db';
import { FrequencyTable } from '../../../components/dictionary/FrequencyTable';

export default async function VerbConcordancePage() {
  const db = await getDatabase();
  const rows = (await getVerbConcordance(db)).map((r) => ({
    label: r.form_arabic,
    sub: r.lemma ?? undefined,
    count: r.count,
  }));
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">
        Verb Concordance
      </h1>
      <FrequencyTable caption="Verb Concordance" rows={rows} />
    </main>
  );
}
