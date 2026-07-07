PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS surahs (
  id               INTEGER PRIMARY KEY,
  name_arabic      TEXT    NOT NULL,
  name_translit    TEXT    NOT NULL,
  name_translation TEXT    NOT NULL,
  revelation_type  TEXT    NOT NULL CHECK(revelation_type IN ('meccan', 'medinan')),
  ayah_count       INTEGER NOT NULL,
  order_number     INTEGER NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ayahs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  surah_id     INTEGER NOT NULL REFERENCES surahs(id) ON DELETE CASCADE,
  ayah_number  INTEGER NOT NULL,
  text_uthmani TEXT    NOT NULL,
  text_simple  TEXT,
  juz          INTEGER CHECK(juz BETWEEN 1 AND 30),
  page         INTEGER,
  audio_url    TEXT,
  UNIQUE(surah_id, ayah_number)
);

CREATE TABLE IF NOT EXISTS words (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ayah_id         INTEGER NOT NULL REFERENCES ayahs(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  text_arabic     TEXT    NOT NULL,
  transliteration TEXT,
  root            TEXT,
  lemma           TEXT,
  root_buckwalter TEXT,
  lemma_buckwalter TEXT,
  pos_tag         TEXT,
  morphology_json TEXT,
  morphology_description TEXT,
  grammar_arabic  TEXT,
  audio_url       TEXT,
  UNIQUE(ayah_id, position)
);

CREATE TABLE IF NOT EXISTS languages (
  code         TEXT PRIMARY KEY,
  name_native  TEXT NOT NULL,
  name_english TEXT NOT NULL,
  direction    TEXT NOT NULL CHECK(direction IN ('ltr', 'rtl'))
);

CREATE TABLE IF NOT EXISTS translations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ayah_id       INTEGER NOT NULL REFERENCES ayahs(id) ON DELETE CASCADE,
  language_code TEXT    NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  translator    TEXT    NOT NULL,
  text          TEXT    NOT NULL,
  UNIQUE(ayah_id, language_code, translator)
);

CREATE TABLE IF NOT EXISTS word_glosses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id       INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  language_code TEXT    NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  gloss_text    TEXT    NOT NULL,
  UNIQUE(word_id, language_code)
);

CREATE TABLE IF NOT EXISTS roots (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  root_buckwalter  TEXT    NOT NULL UNIQUE,
  root_arabic      TEXT    NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 0,
  -- Materialized hijāʾī rank (1..N) from compareRootsArabic, written by
  -- backfillRootSortOrder so prev/next neighbor lookup is an indexed O(1) query
  -- instead of sorting every root per force-dynamic page view. NULL until
  -- backfilled (fresh rebuild); getRootNeighbors falls back to the full sort.
  sort_order       INTEGER
);

CREATE TABLE IF NOT EXISTS root_forms (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  root_id          INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL,
  pos_label        TEXT    NOT NULL,
  form_arabic      TEXT,
  form_translit    TEXT,
  gloss            TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(root_id, sort_order)
);

CREATE TABLE IF NOT EXISTS root_definitions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  root_id    INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
  source     TEXT    NOT NULL,
  definition TEXT    NOT NULL,
  UNIQUE(root_id, source)
);

CREATE TABLE IF NOT EXISTS word_segments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id         INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  segment_index   INTEGER NOT NULL,
  segment_type    TEXT,
  pos_tag         TEXT,
  form_arabic     TEXT,
  form_buckwalter TEXT,
  features_json   TEXT,
  lemma           TEXT,
  root            TEXT,
  UNIQUE(word_id, segment_index)
);

CREATE TABLE IF NOT EXISTS word_concept_tags (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id   INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  tag_label TEXT    NOT NULL,
  tag_type  TEXT,
  UNIQUE(word_id, tag_label)
);

CREATE INDEX IF NOT EXISTS idx_ayahs_surah         ON ayahs(surah_id);
CREATE INDEX IF NOT EXISTS idx_words_ayah          ON words(ayah_id);
CREATE INDEX IF NOT EXISTS idx_translations_ayah   ON translations(ayah_id, language_code);
CREATE INDEX IF NOT EXISTS idx_word_glosses_word   ON word_glosses(word_id, language_code);
CREATE INDEX IF NOT EXISTS idx_words_root_bw       ON words(root_buckwalter);
CREATE INDEX IF NOT EXISTS idx_words_lemma_bw      ON words(lemma_buckwalter);
CREATE INDEX IF NOT EXISTS idx_root_forms_root     ON root_forms(root_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_root_defs_root      ON root_definitions(root_id);
CREATE INDEX IF NOT EXISTS idx_roots_sort_order     ON roots(sort_order);
CREATE INDEX IF NOT EXISTS idx_word_segments_word  ON word_segments(word_id, segment_index);
CREATE INDEX IF NOT EXISTS idx_word_segments_root  ON word_segments(root);
CREATE INDEX IF NOT EXISTS idx_word_concept_word   ON word_concept_tags(word_id);

-- Global search (Phase 07b). Unified FTS5 over normalized Arabic + translation
-- text. Arabic body is normalized in app code before insert (backfill) --
-- the tokenizer only folds Latin/Cyrillic. ref_id = ayahs.id for source='ar',
-- translations.id for translation rows (stable key for trigger sync).
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  surah_id UNINDEXED,
  ayah_number UNINDEXED,
  source UNINDEXED,
  ref_id UNINDEXED,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS trg_translations_ai AFTER INSERT ON translations BEGIN
  INSERT INTO search_fts (surah_id, ayah_number, source, ref_id, body)
  SELECT a.surah_id, a.ayah_number, NEW.language_code, NEW.id, NEW.text
  FROM ayahs a WHERE a.id = NEW.ayah_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_translations_ad AFTER DELETE ON translations BEGIN
  DELETE FROM search_fts WHERE source = OLD.language_code AND ref_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_translations_au AFTER UPDATE ON translations BEGIN
  DELETE FROM search_fts WHERE source = OLD.language_code AND ref_id = OLD.id;
  INSERT INTO search_fts (surah_id, ayah_number, source, ref_id, body)
  SELECT a.surah_id, a.ayah_number, NEW.language_code, NEW.id, NEW.text
  FROM ayahs a WHERE a.id = NEW.ayah_id;
END;
