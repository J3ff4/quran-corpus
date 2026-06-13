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
  pos_tag         TEXT,
  morphology_json TEXT,
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
  language_code TEXT    NOT NULL REFERENCES languages(code),
  translator    TEXT    NOT NULL,
  text          TEXT    NOT NULL,
  UNIQUE(ayah_id, language_code, translator)
);

CREATE TABLE IF NOT EXISTS word_glosses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id       INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  language_code TEXT    NOT NULL REFERENCES languages(code),
  gloss_text    TEXT    NOT NULL,
  UNIQUE(word_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_ayahs_surah         ON ayahs(surah_id);
CREATE INDEX IF NOT EXISTS idx_words_ayah          ON words(ayah_id);
CREATE INDEX IF NOT EXISTS idx_translations_ayah   ON translations(ayah_id, language_code);
CREATE INDEX IF NOT EXISTS idx_word_glosses_word   ON word_glosses(word_id, language_code);
