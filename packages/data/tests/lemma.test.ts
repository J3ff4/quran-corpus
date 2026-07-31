import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, runMigrations } from '../src/index.js';
import { getLemmaEntry, getLemmaConcordancePage, countLemmaConcordance } from '../src/queries/lemma.js';
import type { Client } from '@libsql/client';

async function seed(db: Client) {
  // 3 ayahs. Rooted verb lemma `qaAla` occurs 3x (words 100,101,102) so the
  // gloss distribution is UNBALANCED -- `said` x2 vs `He said,` x1 -- making
  // top_gloss deterministic (must be `said`, not tie-broken). The same 3 rows
  // carry an unbalanced (transliteration, pos_tag) pair -- (`qala`,V) x2 vs
  // (`yaqūlu`,N) x1, the minority one FIRST in table order -- so a query that
  // reads those two as bare GROUP BY columns can surface the inflected form,
  // which is what shipped `bimā` as the header for مَا. A rootless
  // particle `min` occurs once (word 103). A second language (`uz`) gloss on
  // word 100 exercises the `lang` parameter. Columns verified against live
  // schema: surahs(name_arabic,name_translit,name_translation,revelation_type,
  // ayah_count,order_number all NOT NULL); ayahs(surah_id,ayah_number,
  // text_uthmani NOT NULL); word_glosses has UNIQUE(word_id,language_code).
  await db.execute("INSERT INTO languages (code,name_native,name_english,direction) VALUES ('en','English','English','ltr'),('uz','Ozbek','Uzbek','ltr')");
  await db.execute("INSERT INTO surahs (id,name_arabic,name_translit,name_translation,revelation_type,ayah_count,order_number) VALUES (1,'x','x','x','meccan',3,1)");
  await db.execute("INSERT INTO ayahs (id,surah_id,ayah_number,text_uthmani,text_simple) VALUES (10,1,1,'a','a'),(11,1,2,'b','b'),(12,1,3,'c','c')");
  await db.execute("INSERT INTO roots (id,root_arabic,root_buckwalter,occurrence_count) VALUES (5,'قول','qwl',3)");
  // TWO definitions from competing sources, inserted with the ORDER BY loser
  // first, so `ORDER BY rd.source LIMIT 1` is actually exercised: with a single
  // row the ordering clause is unobservable and the test would pass against a
  // bare LIMIT 1. 'lane' < 'zzz-other' lexically, so 'to say' must win.
  await db.execute("INSERT INTO root_definitions (root_id,source,definition) VALUES (5,'zzz-other','SPURIOUS -- later source, must lose'),(5,'lane','to say')");
  await db.execute(`INSERT INTO words (id,ayah_id,position,text_arabic,transliteration,root,lemma,root_buckwalter,lemma_buckwalter,pos_tag) VALUES
    (100,10,1,'يقول','yaqūlu','قول','قَالَ','qwl','qaAla','N'),
    (101,11,1,'قال','qala','قول','قَالَ','qwl','qaAla','V'),
    (102,12,1,'قال','qala','قول','قَالَ','qwl','qaAla','V'),
    (103,10,2,'من','min',NULL,'مِن',NULL,'min','P')`);
  // Sibling non-match words in ayah 10, so verse_words rebuild has >1 entry.
  await db.execute(`INSERT INTO words (id,ayah_id,position,text_arabic,transliteration,root,lemma,root_buckwalter,lemma_buckwalter,pos_tag) VALUES
    (104,10,3,'ربك','rabbuka','ربب','رَبّ','rbb','rab~',NULL)`);
  // Every occurrence has a NULL surface `lemma` -- schema allows it, so
  // MIN(lemma) is null and getLemmaEntry must fall back to the transliterated
  // key. No such row in the current corpus; nothing enforces that.
  await db.execute(`INSERT INTO words (id,ayah_id,position,text_arabic,transliteration,root,lemma,root_buckwalter,lemma_buckwalter,pos_tag) VALUES
    (105,11,2,'بيت','baytu',NULL,NULL,NULL,'bayot','N')`);
  await db.execute("INSERT INTO word_glosses (word_id,language_code,gloss_text,source) VALUES (100,'en','said','corpus'),(101,'en','said','corpus'),(102,'en','He said,','corpus'),(103,'en','from','corpus'),(100,'uz','dedi','corpus')");
}

describe('lemma queries', () => {
  let db: Client;
  beforeEach(async () => { db = createDatabase('file::memory:'); await runMigrations(db); await seed(db); });

  it('getLemmaEntry: rooted lemma has count, frequency-ordered glosses, root_definition', async () => {
    const e = await getLemmaEntry(db, 'qaAla');
    expect(e).not.toBeNull();
    expect(e!.count).toBe(3);
    expect(e!.root_buckwalter).toBe('qwl');
    expect(e!.root_definition).toBe('to say');
    // `said` occurs 2x, `He said,` 1x -> most-frequent leads, and the trailing
    // comma the corpus carried over from the verse is cleaned off the second.
    expect(e!.top_glosses).toEqual(['said', 'He said']);
    expect(e!.lemma).toBe('قَالَ');
  });

  it('getLemmaEntry: senses list every POS with counts, most frequent first', async () => {
    // A lemma is not necessarily one part of speech. Reporting only the modal
    // tag stated "Relative pronoun" for مَا, which is wrong for 911 of its 2177
    // occurrences. Seed: (qala,V) x2 and (yaqūlu,N) x1 on the same lemma.
    const e = await getLemmaEntry(db, 'qaAla');
    expect(e!.senses).toEqual([
      { pos_tag: 'V', pos_label: 'Verb', count: 2 },
      { pos_tag: 'N', pos_label: 'Noun', count: 1 },
    ]);
  });

  it('getLemmaEntry: an unknown POS tag keeps the raw tag, an empty one is dropped', async () => {
    // Two different fallbacks, asserted together because the same row set
    // exercises both. `ZZZ` has no English label, so posLabelEn hands back the
    // tag itself and the chip reads "ZZZ 1" -- ugly but truthful.
    //
    // The empty tag is excluded by the query instead, because there is no
    // truthful chip to render for it: no label, and a coloured dot plus a bare
    // count reads as a sense the lemma does not have. Dropping the row is the
    // honest option, and the count line above the chips is unaffected (it is
    // its own COUNT(*), not a sum of these).
    await db.execute(`INSERT INTO words (id,ayah_id,position,text_arabic,transliteration,root,lemma,root_buckwalter,lemma_buckwalter,pos_tag) VALUES
      (106,12,2,'س','sin',NULL,'سٌ',NULL,'sino','ZZZ'),
      (107,12,3,'ش','shin',NULL,'شٌ',NULL,'sino','')`);
    const e = await getLemmaEntry(db, 'sino');
    expect(e!.senses).toEqual([{ pos_tag: 'ZZZ', pos_label: 'ZZZ', count: 1 }]);
  });

  it('getLemmaEntry: null surface lemma falls back to the transliterated key', async () => {
    // `words.lemma` is nullable, so MIN(lemma) can come back null and
    // `LemmaEntry.lemma: string` would be a lie -- the page header would render
    // blank in the Arabic face. Literal expectation, not buckwalterToArabic(),
    // so this cannot pass by agreeing with a broken converter.
    const e = await getLemmaEntry(db, 'bayot');
    expect(e!.lemma).toBe('بَيْت');
  });

  it('getLemmaEntry: root_definition is the first source in ORDER BY, not insertion order', async () => {
    // Matches getRootDefinitions, so /dictionary/lemma/qaAla and /dictionary/qwl
    // cannot disagree about which definition is "the" one. Without the ORDER BY
    // the pick is whichever row SQLite happens to visit.
    const e = await getLemmaEntry(db, 'qaAla');
    expect(e!.root_definition).toBe('to say');
  });

  it('getLemmaEntry: transliteration comes from the most frequent (translit, pos) pair', async () => {
    // Not constant per lemma -- it describes the occurrence. Live corpus: 2349
    // of 4832 lemmas carry >1 transliteration. Read as a bare column it
    // rendered مَا as `bimā` (prefix still attached) and could flip per import.
    // Taken as a PAIR: the majority pair is (qala,V), so the minority row's
    // `yaqūlu` must not leak through even though it is first in table order.
    const e = await getLemmaEntry(db, 'qaAla');
    expect(e!.transliteration).toBe('qala');
  });

  it('getLemmaEntry: lang parameter switches the gloss language', async () => {
    const en = await getLemmaEntry(db, 'qaAla', 'en');
    const uz = await getLemmaEntry(db, 'qaAla', 'uz');
    expect(en!.top_glosses[0]).toBe('said');
    expect(uz!.top_glosses[0]).toBe('dedi');
  });

  it('getLemmaEntry: rootless lemma -> null root + null definition', async () => {
    const e = await getLemmaEntry(db, 'min');
    expect(e!.root_buckwalter).toBeNull();
    expect(e!.root_definition).toBeNull();
    expect(e!.count).toBe(1);
  });

  it('getLemmaEntry: unknown -> null', async () => {
    expect(await getLemmaEntry(db, 'zzz')).toBeNull();
  });

  it('countLemmaConcordance matches occurrences', async () => {
    expect(await countLemmaConcordance(db, 'qaAla')).toBe(3);
    expect(await countLemmaConcordance(db, 'min')).toBe(1);
    expect(await countLemmaConcordance(db, 'zzz')).toBe(0);
  });

  it('getLemmaConcordancePage returns the matching words in surah/ayah/position order', async () => {
    const all = await getLemmaConcordancePage(db, 'qaAla', {});
    expect(all.map((r) => r.word_id)).toEqual([100, 101, 102]); // ordered by ayah
    expect(all.every((r) => r.form_id === null)).toBe(true);
    // Each entry carries the whole ayah's words for the verse-trim UI.
    const first = all[0]!;
    expect(first.verse_words.map((w) => w.id)).toEqual([100, 103, 104]); // ayah 10, by position
    // `ayah_id` is the internal join key for the verse rebuild and is not part
    // of ConcordanceEntry. Pinned because the map is hand-built: a refactor to
    // `{...r, form_id: null}` would silently widen the public shape.
    expect(first).not.toHaveProperty('ayah_id');
  });

  it('getLemmaConcordancePage honours limit + offset (no repeat/skip)', async () => {
    const page1 = await getLemmaConcordancePage(db, 'qaAla', { limit: 2, offset: 0 });
    const page2 = await getLemmaConcordancePage(db, 'qaAla', { limit: 2, offset: 2 });
    expect(page1.map((r) => r.word_id)).toEqual([100, 101]);
    expect(page2.map((r) => r.word_id)).toEqual([102]); // remainder, no overlap
  });

  it('getLemmaConcordancePage: unknown lemma -> empty', async () => {
    expect(await getLemmaConcordancePage(db, 'zzz', {})).toEqual([]);
  });

  it('getLemmaConcordancePage rejects out-of-range paging before it reaches SQL', async () => {
    // SQLite reads a negative LIMIT as "no limit", so `limit: -1` would return
    // the whole concordance and rebuild every one of its verses. The routes
    // clamp, but a direct caller binds these straight through.
    await expect(getLemmaConcordancePage(db, 'qaAla', { limit: -1 })).rejects.toThrow(RangeError);
    await expect(getLemmaConcordancePage(db, 'qaAla', { limit: 0 })).rejects.toThrow(RangeError);
    await expect(
      getLemmaConcordancePage(db, 'qaAla', { limit: 2, offset: -5 }),
    ).rejects.toThrow(RangeError);
    await expect(getLemmaConcordancePage(db, 'qaAla', { limit: 1.5 })).rejects.toThrow(RangeError);
  });
});
