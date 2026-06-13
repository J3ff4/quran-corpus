from scraper.surah_meta import get_all_surahs


def test_surah_count_is_114():
    surahs = get_all_surahs()
    assert len(surahs) == 114


def test_first_surah_al_fatiha():
    surahs = get_all_surahs()
    s = surahs[0]
    assert s.id == 1
    assert s.name_arabic == "الفاتحة"
    assert s.revelation_type == "meccan"
    assert s.ayah_count == 7
    assert s.order_number == 1


def test_second_surah_al_baqara():
    surahs = get_all_surahs()
    s = surahs[1]
    assert s.id == 2
    assert s.revelation_type == "medinan"
    assert s.ayah_count == 286


def test_last_surah_an_nas():
    surahs = get_all_surahs()
    s = surahs[113]
    assert s.id == 114
    assert s.name_arabic == "الناس"
    assert s.revelation_type == "meccan"
    assert s.ayah_count == 6


def test_ids_are_sequential():
    surahs = get_all_surahs()
    for i, s in enumerate(surahs, start=1):
        assert s.id == i, f"Expected id={i}, got id={s.id} for {s.name_translit}"


def test_all_have_valid_revelation_type():
    surahs = get_all_surahs()
    for s in surahs:
        assert s.revelation_type in ("meccan", "medinan"), (
            f"{s.name_translit} has invalid type"
        )
