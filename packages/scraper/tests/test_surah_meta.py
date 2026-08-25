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
    # Revelation order, not mushaf order: al-Fatiha is the fifth revealed.
    assert s.order_number == 5


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


def test_order_number_is_a_permutation_of_the_revelation_ranks():
    ranks = sorted(s.order_number for s in get_all_surahs())
    # A duplicate or a gap breaks UNIQUE(order_number) on insert and silently
    # drops a surah out of any revelation-ordered list.
    assert ranks == list(range(1, 115))


def test_order_number_is_not_the_mushaf_order():
    surahs = get_all_surahs()
    # This column duplicated `id` until 2026-08-25, which made a
    # revelation-ordered list render identically to the plain surah list --
    # wrong, and completely plausible on screen.
    assert sum(1 for s in surahs if s.order_number == s.id) < 114


def test_revelation_order_opens_with_al_alaq_and_closes_with_an_nasr():
    by_rank = sorted(get_all_surahs(), key=lambda s: s.order_number)
    assert by_rank[0].id == 96, "al-Alaq is the first revealed"
    assert by_rank[1].id == 68 and by_rank[2].id == 73 and by_rank[3].id == 74
    assert by_rank[-1].id == 110, "an-Nasr is the last revealed"
    assert by_rank[-2].id == 9, "at-Tawba is the second to last"


def test_the_hijra_splits_the_revelation_order_cleanly():
    by_rank = sorted(get_all_surahs(), key=lambda s: s.order_number)
    # The Meccan period ends when the Medinan one begins, so the two must be
    # contiguous blocks. This is the cross-check that catches a transposition
    # the permutation test cannot see: revelation_type is imported data this
    # table did not author, and a rank swapped across the boundary breaks it.
    meccan, medinan = by_rank[:86], by_rank[86:]
    assert all(s.revelation_type == "meccan" for s in meccan)
    assert all(s.revelation_type == "medinan" for s in medinan)
