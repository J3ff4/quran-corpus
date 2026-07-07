import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import {
  getRootByBuckwalter,
  getAllRoots,
  getRootArabicList,
  getRootsByFrequency,
  searchRoots,
  getRootEntry,
  getRootConcordance,
  getRootConcordancePage,
  countRootConcordance,
  getRootSearchList,
  getRootForms,
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
    `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('smw','س م و',5),('ktb','ك ت ب',319),('$Am','ش أ م',3) RETURNING id`,
  );
  const smwId = r.rows[0]!['id'] as number;
  await db.execute({
    sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_arabic,form_translit,occurrence_count) VALUES (?,0,'Noun','ٱسْم','ism',5)`,
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
  it('getAllRoots is in Arabic hijāʾī order, not Buckwalter', async () => {
    // hijāʾī index: س=12 (smw) < ش=13 ($Am) < ك=22 (ktb)
    expect((await getAllRoots(db)).map((r) => r.root_buckwalter)).toEqual([
      'smw', '$Am', 'ktb',
    ]);
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
  it('getRootForms excludes null-arabic (junk) rows', async () => {
    const smwId = (await getRootByBuckwalter(db, 'smw'))!.id;
    // a See-Also-style junk row: pos_label set, form_arabic NULL
    await db.execute({
      sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_arabic,occurrence_count) VALUES (?,50,'Lane''s Lexicon',NULL,0)`,
      args: [smwId],
    });
    const forms = await getRootForms(db, smwId);
    expect(forms.every((f) => f.form_arabic !== null)).toBe(true);
    expect(forms.some((f) => f.pos_label === "Lane's Lexicon")).toBe(false);
  });
  it('getRootConcordance rebuilds verse from words + keeps gloss', async () => {
    const c = await getRootConcordance(db, 'smw');
    expect(c).toHaveLength(1);
    expect(c[0]?.gloss).toBe('In (the) name');
    expect(c[0]?.verse_words.map((w) => w.text_arabic)).toEqual(['بِسْمِ', 'ٱللَّهِ']);
    const ids = c[0]!.verse_words.map((w) => w.id);
    expect(ids).toContain(c[0]!.word_id); // matched word is among the verse words
  });
  it('getRootConcordance unknown root -> []', async () => {
    expect(await getRootConcordance(db, 'zzz')).toEqual([]);
  });
  it('getRootArabicList returns every root_arabic', async () => {
    expect((await getRootArabicList(db)).sort()).toEqual(['س م و', 'ش أ م', 'ك ت ب']);
  });
  it('getRootSearchList returns every root, ktb (no forms) with a null blob', async () => {
    const list = await getRootSearchList(db);
    expect(list.length).toBe(3);
    expect(list.find((r) => r.root_buckwalter === 'ktb')?.gloss_blob).toBeNull();
  });
  it('getRootSearchList concatenates a root’s form glosses', async () => {
    const smwId = (await getRootByBuckwalter(db, 'smw'))!.id;
    await db.execute({
      sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,gloss,occurrence_count) VALUES (?,1,'Noun','name',1),(?,2,'Noun','high place',1)`,
      args: [smwId, smwId],
    });
    const smw = (await getRootSearchList(db)).find((r) => r.root_buckwalter === 'smw');
    expect(smw?.gloss_blob).toBe('name high place');
  });
  it('getRootConcordance batches ayah IDs (batchSize=1) without dropping words', async () => {
    // a2 in a second ayah; same root 'bat' matched in two ayahs -> two batches
    const a2 = await db.execute(
      `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,2,'x') RETURNING id`,
    );
    const a2id = a2.rows[0]!['id'] as number;
    const a1 = await db.execute(`SELECT id FROM ayahs WHERE surah_id=1 AND ayah_number=1`);
    const a1id = a1.rows[0]!['id'] as number;
    await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
            VALUES (?,9,'بَتْ','bat','N'),(?,1,'بَتّ','bat','N')`,
      args: [a1id, a2id],
    });
    const c = await getRootConcordance(db, 'bat', 'en', 1);
    expect(c).toHaveLength(2);
    // each entry's verse_words come from its own ayah (batch boundary intact)
    expect(c.every((e) => e.verse_words.some((w) => w.id === e.word_id))).toBe(true);
  });
  it('getRootConcordancePage windows with limit/offset; count is total', async () => {
    await db.execute(
      `INSERT INTO surahs (id,name_arabic,name_translit,name_translation,revelation_type,ayah_count,order_number) VALUES (2,'ب','b','b','meccan',5,2)`,
    );
    // 5 matched words for root 'pag', one per ayah of surah 2 (deterministic order)
    for (let n = 1; n <= 5; n++) {
      const a = await db.execute({
        sql: `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (2,?,'ص') RETURNING id`,
        args: [n],
      });
      const aid = a.rows[0]!['id'] as number;
      await db.execute({
        sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag) VALUES (?,1,'ص','pag','N')`,
        args: [aid],
      });
    }
    expect(await countRootConcordance(db, 'pag')).toBe(5);
    expect(await countRootConcordance(db, 'zzz')).toBe(0);
    expect((await getRootConcordancePage(db, 'pag', { limit: 2, offset: 0 })).length).toBe(2);
    const last = await getRootConcordancePage(db, 'pag', { limit: 2, offset: 4 });
    expect(last.length).toBe(1);
    // paged entries still rebuild their verse via the shared helper
    expect(last[0]!.verse_words.some((w) => w.id === last[0]!.word_id)).toBe(true);
    // offset past the end -> empty
    expect((await getRootConcordancePage(db, 'pag', { limit: 2, offset: 5 })).length).toBe(0);
  });
  it('two matches in one ayah -> two entries, same verse_words, distinct word_id', async () => {
    const a = await db.execute(`SELECT id FROM ayahs WHERE surah_id=1 AND ayah_number=1`);
    const aid = a.rows[0]!['id'] as number;
    await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
            VALUES (?,3,'كَتَبَ','ktb','V'),(?,4,'كِتَٰب','ktb','N')`,
      args: [aid, aid],
    });
    const c = await getRootConcordance(db, 'ktb');
    expect(c).toHaveLength(2);
    expect(c[0]!.word_id).not.toBe(c[1]!.word_id);
    expect(c[0]!.verse_words).toEqual(c[1]!.verse_words);
  });
});
