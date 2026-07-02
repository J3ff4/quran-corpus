import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getLemmaFrequency, getVerbConcordance } from '../src/queries/dictionary.js';

let db: Client;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await db.execute(
    `INSERT INTO surahs (id,name_arabic,name_translit,name_translation,revelation_type,ayah_count,order_number) VALUES (1,'ا','a','a','meccan',7,1)`,
  );
  const a = await db.execute(
    `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,1,'x') RETURNING id`,
  );
  const ayahId = a.rows[0]!['id'] as number;
  // lemma 'qwl' appears 3x, 'ktb' 1x; two verbs, one noun.
  await db.execute({
    sql: `INSERT INTO words (ayah_id,position,text_arabic,lemma,lemma_buckwalter,pos_tag) VALUES
          (?,1,'قَالَ','قول','qwl','V'),
          (?,2,'يَقُولُ','قول','qwl','V'),
          (?,3,'قَوْل','قول','qwl','N'),
          (?,4,'كَتَبَ','كتب','ktb','V')`,
    args: [ayahId, ayahId, ayahId, ayahId],
  });
});
afterAll(() => db.close());

describe('getLemmaFrequency', () => {
  it('ranks lemmas by count', async () => {
    const rows = await getLemmaFrequency(db);
    expect(rows[0]?.lemma_buckwalter).toBe('qwl');
    expect(rows[0]?.count).toBe(3);
  });
});

describe('getVerbConcordance', () => {
  it('includes only verbs, grouped by lemma', async () => {
    const rows = await getVerbConcordance(db);
    const lemmas = rows.map((r) => r.lemma);
    expect(lemmas).toContain('قول');
    expect(lemmas).toContain('كتب');
    // 'qwl' as verb appears twice (the noun row is excluded)
    const qwl = rows.find((r) => r.lemma === 'قول');
    expect(qwl?.count).toBe(2);
  });
});
