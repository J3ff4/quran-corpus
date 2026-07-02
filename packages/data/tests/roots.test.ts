import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import {
  getRootByBuckwalter,
  getAllRoots,
  getRootsByFrequency,
  searchRoots,
  getRootEntry,
  getRootConcordance,
} from '../src/queries/roots.js';

let db: Client;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await db.execute(
    `INSERT INTO languages (code,name_native,name_english,direction) VALUES ('en','English','English','ltr')`,
  );
  await db.execute(
    `INSERT INTO surahs (id,name_arabic,name_translit,name_translation,revelation_type,ayah_count,order_number) VALUES (1,'ا','a','a','meccan',7,1)`,
  );
  const a = await db.execute(
    `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,1,'بِسْمِ ٱللَّهِ') RETURNING id`,
  );
  const ayahId = a.rows[0]!['id'] as number;
  await db.execute({
    sql: `INSERT INTO words (ayah_id,position,text_arabic,transliteration,root,root_buckwalter,pos_tag) VALUES (?,1,'بِسْمِ','bismi','س م و','smw','P'),(?,2,'ٱللَّهِ','l-lahi',NULL,NULL,'PN')`,
    args: [ayahId, ayahId],
  });
  const w = await db.execute(`SELECT id FROM words WHERE position=1`);
  const wid = w.rows[0]!['id'] as number;
  await db.execute({
    sql: `INSERT INTO word_glosses (word_id,language_code,gloss_text) VALUES (?, 'en','In (the) name')`,
    args: [wid],
  });
  const r = await db.execute(
    `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('smw','س م و',5),('ktb','ك ت ب',319) RETURNING id`,
  );
  const smwId = r.rows[0]!['id'] as number;
  await db.execute({
    sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_translit,occurrence_count) VALUES (?,0,'Noun','ism',5)`,
    args: [smwId],
  });
  await db.execute({
    sql: `INSERT INTO root_definitions (root_id,source,definition) VALUES (?,'lane','To be high')`,
    args: [smwId],
  });
});
afterAll(() => db.close());

describe('roots queries', () => {
  it('getRootByBuckwalter', async () => {
    expect((await getRootByBuckwalter(db, 'smw'))?.root_arabic).toBe('س م و');
  });
  it('getRootByBuckwalter unknown -> null', async () => {
    expect(await getRootByBuckwalter(db, 'zzz')).toBeNull();
  });
  it('getAllRoots alphabetical', async () => {
    expect((await getAllRoots(db)).map((r) => r.root_buckwalter)).toEqual(['ktb', 'smw']);
  });
  it('getRootsByFrequency', async () => {
    expect((await getRootsByFrequency(db))[0]?.root_buckwalter).toBe('ktb');
  });
  it('searchRoots by buckwalter', async () => {
    expect((await searchRoots(db, 'smw')).length).toBe(1);
  });
  it('getRootEntry bundles forms + definitions', async () => {
    const e = await getRootEntry(db, 'smw');
    expect(e?.forms.length).toBe(1);
    expect(e?.definitions[0]?.definition).toBe('To be high');
  });
  it('getRootConcordance returns occurrences with gloss + verse text', async () => {
    const c = await getRootConcordance(db, 'smw');
    expect(c).toHaveLength(1);
    expect(c[0]?.gloss).toBe('In (the) name');
    expect(c[0]?.verse_text).toContain('بِسْمِ');
  });
});
