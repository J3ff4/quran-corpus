from scraper.sources import corpus_quran
from scraper.sources.corpus_parser import ParsedWord


def test_process_page_leaves_text_arabic_empty(monkeypatch):
    pw = ParsedWord(
        verse_number=1, position=1, transliteration="qul",
        pos_tag="V", english_gloss="Say", morphology_json=None,
    )
    monkeypatch.setattr(corpus_quran, "parse_verse_words", lambda html: [pw])
    captured = {}

    class FakeDB:
        def get_ayah(self, chapter, verse):
            return {"id": 42, "text_uthmani": "بِسْمِ ٱللَّهِ"}
        def upsert_word(self, word):
            captured["word"] = word
            return 7
        def upsert_word_gloss(self, gloss):
            captured["gloss"] = gloss

    corpus_quran._process_page("<html/>", 1, FakeDB())
    assert captured["word"].text_arabic == ""
    assert captured["word"].transliteration == "qul"
    assert captured["gloss"].gloss_text == "Say"


def test_process_page_forwards_grammar_note(monkeypatch):
    pw = ParsedWord(
        verse_number=1, position=1, transliteration="qul",
        pos_tag="V", english_gloss="Say", morphology_json=None,
        grammar_note="فعل أمر",
    )
    monkeypatch.setattr(corpus_quran, "parse_verse_words", lambda html: [pw])
    captured = {}

    class FakeDB:
        def get_ayah(self, chapter, verse):
            return {"id": 42, "text_uthmani": "بِسْمِ ٱللَّهِ"}
        def upsert_word(self, word):
            captured["word"] = word
            return 7
        def upsert_word_gloss(self, gloss):
            captured["gloss"] = gloss

    corpus_quran._process_page("<html/>", 1, FakeDB())
    assert captured["word"].grammar_note == "فعل أمر"
