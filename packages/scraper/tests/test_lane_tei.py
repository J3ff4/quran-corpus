import pytest

from scraper.sources.lane_tei import (
    VOLUMES,
    build_index,
    download_volumes,
    index_keys,
    key_candidates,
    lookup,
    lookup_key,
    normalise_key,
)

# Synthetic TEI -- real volumes are 67 MB of third-party data and never enter
# the repo (CLAUDE.md §9). Shape copied from _S0.xml, content invented.
VOLUME_XML = """<?xml version="1.0" encoding="UTF-8"?>
<TEI.2><text><body>
<div1 type="alphabetical letter" n="S">
  <div2 n="Sbg" type="root"><entryFree id="n1" key="Sabag"><form><orth
    lang="ar">Sabag</orth></form> (S,) <hi rend="ital">He dyed it;</hi>
    or <hi rend="ital">coloured it.</hi></entryFree></div2>
  <div2 n="Sx" type="root"><entryFree id="n2" key="Sax~"><form><orth
    lang="ar">Sax~</orth></form> <hi rend="ital">A hard rock.</hi></entryFree></div2>
  <div2 n="SdY" type="root"><entryFree id="n3" key="SadaY"><form><orth
    lang="ar">SadaY</orth></form> <hi rend="ital">It echoed.</hi></entryFree></div2>
  <div2 n="SA^b" type="root"><entryFree id="n4" key="SA^b"><form><orth
    lang="ar">SA^b</orth></form> <hi rend="ital">It hit the
    mark.</hi></entryFree></div2>
</div1>
</body></text></TEI.2>
"""


def test_volumes_cover_every_letter_file():
    # 36 files; the underscore prefix is what keeps emphatics apart from plain
    # letters, so losing it silently merges ص into س.
    assert len(VOLUMES) == 36
    assert "_S0.xml" in VOLUMES and "s0.xml" in VOLUMES
    assert "$0.xml" in VOLUMES


def test_normalise_key_strips_lanes_hamza_marks():
    assert normalise_key("SA^b") == "SAb"
    assert normalise_key("Sbg") == "Sbg"


def test_key_candidates_collapses_a_geminate_to_two_letters():
    assert "Sx" in key_candidates("Sxx")
    assert "Sd" in key_candidates("Sdd")


def test_key_candidates_does_not_collapse_a_doubled_quadriliteral():
    # Lane files reduplicated quadriliterals directly (lblb, kbkb, qsqs); no
    # `hdhd -> hd` convention exists, and following it credited the hoopoe root
    # with "He demolished, threw it down" -- a different root's definition.
    assert key_candidates("hdhd") == ["hdhd"]
    assert "Sl" not in key_candidates("SlSl")


def test_key_candidates_never_offers_the_definite_article():
    # `Al` is ال, the article, not a root: All (ties of kinship, 9:8) would get
    # a page of grammar prose. The two-letter geminate rule still applies to it.
    assert "Al" not in key_candidates("All")


def test_key_candidates_offers_alif_maqsura():
    assert "SdY" in key_candidates("Sdy")


def test_key_candidates_always_offers_the_root_itself_first():
    assert key_candidates("Sbg")[0] == "Sbg"


# Lane's Supplement: the base volume keeps a stub pointing at the *1 volume,
# which holds the real entry. Shape copied from h0.xml/h1.xml's `hzm`.
STUB_XML = """<?xml version="1.0" encoding="UTF-8"?>
<TEI.2><text><body>
<div1 type="alphabetical letter" n="h">
  <div2 n="hzm" type="root"><entryFree>See Supplement   </entryFree></div2>
</div1>
</body></text></TEI.2>
"""
SUPPLEMENT_XML = """<?xml version="1.0" encoding="UTF-8"?>
<TEI.2><text><body>
<div1 type="alphabetical letter" n="h">
  <div2 n="hzm" type="root"><entryFree id="n5" key="hazam"><form><orth
    lang="ar">hazam</orth></form> <hi rend="ital">It was routed,
    defeated.</hi></entryFree></div2>
</div1>
</body></text></TEI.2>
"""


def _index(tmp_path, extra: dict[str, str] | None = None):
    # build_index requires the full set, so stub the rest out (see F10).
    for name in VOLUMES:
        (tmp_path / name).write_text("", encoding="utf-8")
    (tmp_path / "_S0.xml").write_text(VOLUME_XML, encoding="utf-8")
    for name, text in (extra or {}).items():
        (tmp_path / name).write_text(text, encoding="utf-8")
    return build_index(tmp_path)


def test_build_index_keys_every_root_entry(tmp_path):
    assert set(_index(tmp_path)) == {"Sbg", "Sx", "SdY", "SAb"}


def test_lookup_finds_a_direct_key(tmp_path):
    assert "He dyed it" in lookup(_index(tmp_path), "Sbg")


def test_lookup_finds_a_geminate_under_its_two_letter_form(tmp_path):
    assert "A hard rock" in lookup(_index(tmp_path), "Sxx")


def test_lookup_finds_a_weak_final_under_alif_maqsura(tmp_path):
    assert "It echoed" in lookup(_index(tmp_path), "Sdy")


def test_lookup_returns_none_for_a_root_lane_lacks(tmp_path):
    assert lookup(_index(tmp_path), "hmn") is None


def test_build_index_prefers_the_supplement_over_a_see_supplement_stub(tmp_path):
    # h0 sorts before h1, so first-writer-wins kept the stub and `hzm` came out
    # as the run's only no_gloss quarantine.
    index = _index(tmp_path, {"h0.xml": STUB_XML, "h1.xml": SUPPLEMENT_XML})
    assert "It was routed" in index["hzm"]


def test_build_index_keeps_the_first_substantive_entry_of_a_duplicate(tmp_path):
    # Only a stub loses the collision; two real entries still keep the earlier.
    index = _index(tmp_path, {"h0.xml": SUPPLEMENT_XML, "h1.xml": STUB_XML})
    assert "It was routed" in index["hzm"]


def test_index_keys_splits_a_heading_naming_two_spellings():
    assert index_keys("Sgw and SgY") == ["Sgw", "SgY"]


def test_index_keys_splits_a_heading_joined_with_or():
    assert index_keys("Dbw or DbY") == ["Dbw", "DbY"]


def test_index_keys_leaves_a_plain_heading_alone():
    assert index_keys("Sbg") == ["Sbg"]


def test_index_keys_strips_padding_from_a_heading():
    # t0.xml files one heading as `n=" tr "`. Keyed verbatim it is unreachable:
    # key_candidates never emits a key holding spaces, so the root reports
    # "Lane has no entry" when Lane has one.
    assert index_keys(" tr ") == ["tr"]
    assert index_keys("Sgw  and  SgY ") == ["Sgw", "SgY"]


def test_index_keys_leaves_a_range_or_quasi_heading_whole():
    # `X &c.` is a range heading and `Quasi X` is Lane's section for words
    # treated under a root they do not derive from -- neither names a second
    # spelling, so keying them as roots would file another article's text.
    assert index_keys("ytm &c.") == ["ytm &c."]
    assert index_keys("Quasi $dqm") == ["Quasi $dqm"]


# One article, two spellings in the heading -- 103 of Lane's root entries are
# filed this way, and nine phase-21 gap roots live only here.
JOINED_XML = """<?xml version="1.0" encoding="UTF-8"?>
<TEI.2><text><body>
<div1 type="alphabetical letter" n="S">
  <div2 n="Sgw and SgY" type="root"><entryFree id="n9"><form><orth
    lang="ar">Sagaw</orth></form> <hi rend="ital">He inclined.</hi></entryFree></div2>
</div1>
</body></text></TEI.2>
"""
# A bare cross-reference, not a `See Supplement` stub: this is the shape that
# wins the `bwA`/`bwA^` collision after normalise_key merges the two.
CROSS_REF_XML = """<?xml version="1.0" encoding="UTF-8"?>
<TEI.2><text><body>
<div1 type="alphabetical letter" n="b">
  <div2 n="bwA" type="root"><entryFree id="n2">see <foreign
    lang="ar">bwA</foreign> below.</entryFree></div2>
</div1>
</body></text></TEI.2>
"""
SEATED_XML = """<?xml version="1.0" encoding="UTF-8"?>
<TEI.2><text><body>
<div1 type="alphabetical letter" n="b">
  <div2 n="bwA^" type="root"><entryFree id="n3"><form><orth
    lang="ar">bA'</orth></form> <hi rend="ital">He returned, went
    back.</hi></entryFree></div2>
</div1>
</body></text></TEI.2>
"""


def test_lookup_reaches_both_roots_of_a_joined_heading(tmp_path):
    index = _index(tmp_path, {"g0.xml": JOINED_XML})
    assert "He inclined" in lookup(index, "Sgw")
    assert "He inclined" in lookup(index, "SgY")


def test_build_index_prefers_an_entry_that_yields_a_gloss(tmp_path):
    # `bwA` (بوأ, 3:121) and `bwA^` collapse to one key. The seat-less entry is
    # a cross-reference with no italic run, so keeping it strands the real one.
    index = _index(tmp_path, {"b0.xml": CROSS_REF_XML, "w0.xml": SEATED_XML})
    assert "He returned" in index["bwA"]


def test_build_index_rejects_an_incomplete_volume_directory(tmp_path):
    # A mis-pointed directory used to yield a small non-empty index, which slips
    # past build_rows' empty-index guard and reports a near-total not_in_lane
    # run as a success.
    (tmp_path / "_S0.xml").write_text(VOLUME_XML, encoding="utf-8")
    with pytest.raises(ValueError, match="missing 35"):
        build_index(tmp_path)


def test_lookup_key_reports_which_lane_key_matched(tmp_path):
    # The human gate has to see when a gloss came from a non-direct key.
    index = _index(tmp_path)
    assert lookup_key(index, "Sbg") == "Sbg"
    assert lookup_key(index, "Sxx") == "Sx"
    assert lookup_key(index, "hmn") is None


def _fake_fetch(tmp_path, monkeypatch) -> list[str]:
    """Stub out the network for download_volumes; returns the list of URLs got."""

    class _Resp:
        content = b"<TEI.2/>"

    class _Client:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    seen: list[str] = []

    def fake_get(client, url):
        seen.append(url)
        assert not list(tmp_path.glob("*.part"))  # previous write already renamed
        return _Resp()

    monkeypatch.setattr("httpx.Client", lambda **kw: _Client())
    # lane_tei imports it inside the function, so patch it at the source module.
    monkeypatch.setattr("scraper.http_retry.get_with_retry", fake_get)
    return seen


def test_download_volumes_renames_into_place_through_the_retry_wrapper(
    tmp_path, monkeypatch
):
    # A raw client.get aborts the whole fetch on one transient 5xx, and a
    # non-atomic write leaves a truncated volume that the resume check reads as
    # complete -- build_index then silently drops the rest of that volume.
    seen = _fake_fetch(tmp_path, monkeypatch)
    paths = download_volumes(tmp_path, rate_limit=0)
    assert len(seen) == 36 and len(paths) == 36
    assert not list(tmp_path.glob("*.part"))
    assert (tmp_path / "_S0.xml").read_bytes() == b"<TEI.2/>"


def test_download_volumes_skips_present_volumes_unless_forced(tmp_path, monkeypatch):
    # The resume path is what the atomic write exists to make safe; nothing
    # asserted it, so dropping either `path.exists()` or `and not force` would
    # re-fetch 67 MB on every run and still pass the suite.
    seen = _fake_fetch(tmp_path, monkeypatch)

    download_volumes(tmp_path, rate_limit=0)
    seen.clear()
    assert len(download_volumes(tmp_path, rate_limit=0)) == 36
    assert seen == []  # every volume present -> no request
    assert len(download_volumes(tmp_path, force=True, rate_limit=0)) == 36
    assert len(seen) == 36


def test_download_volumes_rate_limits_only_the_fetches(tmp_path, monkeypatch):
    # §11: ~1 req/1-2s. `get_with_retry` spaces out failures only, so without
    # this the 36 GETs leave back to back. Charged per fetch, never per volume --
    # a resumed run must not sleep once per skipped file.
    seen = _fake_fetch(tmp_path, monkeypatch)
    naps: list[float] = []
    monkeypatch.setattr("time.sleep", naps.append)

    download_volumes(tmp_path)
    assert len(seen) == 36 and naps == [1.5] * 35  # between fetches, not after

    naps.clear()
    download_volumes(tmp_path)  # all present now
    assert naps == []


@pytest.mark.parametrize("bad", [-1.0, float("nan"), float("inf")])
def test_download_volumes_rejects_an_unusable_rate_limit(tmp_path, bad):
    # Before any side effect: time.sleep rejects the first two only after volume
    # 1 is written, and accepts inf outright -- the run then hangs, which reads
    # as a slow mirror rather than a bad argument.
    dest = tmp_path / "not-yet"  # pytest already made tmp_path, so mkdir there
    with pytest.raises(ValueError, match="rate_limit must be finite"):  # is a no-op
        download_volumes(dest, rate_limit=bad)
    assert not dest.exists()  # guard ran before dest.mkdir()


# `SgY`'s own article, filed after the `Sgw and SgY` one. Real shape: Hyw has a
# dedicated entry that lost to `HY: or HY and Hyw`, and jr*q to `jrdq and jr*q`.
DEDICATED_XML = """<?xml version="1.0" encoding="UTF-8"?>
<TEI.2><text><body>
<div1 type="alphabetical letter" n="w">
  <div2 n="SgY" type="root"><entryFree id="n10"><form><orth
    lang="ar">SagaY</orth></form> <hi rend="ital">He listened.</hi></entryFree></div2>
</div1>
</body></text></TEI.2>
"""
DEDICATED_STUB_XML = DEDICATED_XML.replace(
    '<hi rend="ital">He listened.</hi>', "see above."
)


def test_build_index_prefers_a_dedicated_entry_over_a_joined_heading(tmp_path):
    # A shared heading is only partly about either root; the root's own <div2>
    # is about it, so it takes the key even though it is written second.
    index = _index(tmp_path, {"g0.xml": JOINED_XML, "w0.xml": DEDICATED_XML})
    assert "He listened" in index["SgY"]
    assert "He inclined" in index["Sgw"]  # the joined heading keeps its other key


def test_build_index_keeps_a_joined_heading_over_a_glossless_dedicated_entry(tmp_path):
    index = _index(tmp_path, {"g0.xml": JOINED_XML, "w0.xml": DEDICATED_STUB_XML})
    assert "He inclined" in index["SgY"]
