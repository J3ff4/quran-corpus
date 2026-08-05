from scraper.sources.perseus_keys import index_keys, key_candidates, normalise_key


def test_normalise_key_drops_the_hamza_seat_marks():
    assert normalise_key("SA^b") == "SAb"
    assert normalise_key("b`w") == "bw"


def test_index_keys_splits_a_joined_heading_into_both_spellings():
    assert index_keys("Sgw and SgY") == ["Sgw", "SgY"]
    assert index_keys("Dbw or DbY") == ["Dbw", "DbY"]


def test_index_keys_leaves_a_range_or_quasi_heading_whole():
    assert index_keys("hd &c.") == ["hd &c."]
    assert index_keys("Quasi Sgw") == ["Quasi Sgw"]


def test_index_keys_strips_heading_padding():
    assert index_keys(" tr ") == ["tr"]


def test_key_candidates_offers_the_geminate_and_weak_final_forms():
    assert key_candidates("Sxx") == ["Sxx", "Sx"]
    assert key_candidates("hdy") == ["hdy", "hdY", "hdw"]


def test_key_candidates_never_offers_the_definite_article_as_a_fallback():
    # `Al` is ال, grammar prose, not a root -- the geminate rule would hand it
    # to All (إلّ, 9:8). A direct lookup of Al must still work.
    assert key_candidates("All") == ["All"]
    assert key_candidates("Al") == ["Al"]
