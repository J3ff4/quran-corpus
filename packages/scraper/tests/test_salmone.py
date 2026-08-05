import io
import tarfile
import tempfile

import pytest

from scraper.sources import salmone
from scraper.sources.salmone import (
    EXPECTED_ROOTS,
    SALMONE_MEMBER,
    build_index,
    download_salmone,
    lookup,
)

ROOT_XML = (
    '<div2 part="N" n="SbE" org="uniform" type="root">'
    '<entryFree key="A^aSobaEu"><sense>Finger; digit.</sense></entryFree>'
    "</div2>"
)
# The real file writes `n` before `type` in all 6654 tags, but nothing in TEI
# guarantees that, and a positional pattern fails by matching *nothing* rather
# than raising. Both orders are fixtures so the matcher stays order-blind.
ROOT_XML_TYPE_FIRST = (
    '<div2 type="root" part="N" n="Sdr">'
    '<entryFree key="Sador"><sense>Breast, chest.</sense></entryFree>'
    "</div2>"
)
DOC = f"<?xml version='1.0'?><TEI.2><text><body>{ROOT_XML}</body></text></TEI.2>"


def _write_xml(tmp_path, body=DOC):
    path = tmp_path / "salmone.xml"
    path.write_text(body, encoding="utf-8")
    return path


def test_build_index_keys_each_root_entry(tmp_path):
    index = build_index(_write_xml(tmp_path), expected=1, anchors={})
    assert "SbE" in index and "A^aSobaEu" in index["SbE"]


def test_build_index_reads_either_attribute_order(tmp_path):
    body = (
        "<?xml version='1.0'?><TEI.2><text><body>"
        f"{ROOT_XML}{ROOT_XML_TYPE_FIRST}</body></text></TEI.2>"
    )
    index = build_index(_write_xml(tmp_path, body), expected=2, anchors={})
    assert sorted(index) == ["SbE", "Sdr"]


def test_build_index_rejects_a_file_holding_no_root_entries(tmp_path):
    # A truncated download parses as valid XML and yields an empty index, which
    # reads downstream as "Salmone covers none of our roots" -- a successful run.
    bad = _write_xml(
        tmp_path, "<?xml version='1.0'?><TEI.2><text><body/></text></TEI.2>"
    )
    with pytest.raises(ValueError, match="expected"):
        build_index(bad)


def test_build_index_expected_none_disables_the_gate(tmp_path):
    # Documented escape hatch; without an assertion nothing catches the gate
    # being written against EXPECTED_ROOTS instead of `expected`.
    index = build_index(_write_xml(tmp_path), expected=None, anchors={})
    assert index.keys() == {"SbE"}


def test_build_index_rejects_a_source_truncated_partway(tmp_path):
    # The failure this gate exists for: a transfer cut mid-file leaves whole,
    # well-formed root entries behind. Emptiness never catches that -- only the
    # key count does. `expected` defaults to the measured EXPECTED_ROOTS.
    with pytest.raises(ValueError, match=str(EXPECTED_ROOTS)):
        build_index(_write_xml(tmp_path))


def test_build_index_rejects_a_source_whose_count_is_right_but_text_moved(tmp_path):
    # The failure the key count cannot see: parity holds, the entry does not.
    # A re-edited member keeping 1 root while its sense text changed would
    # otherwise index clean and gloss wrong, with nothing raised anywhere.
    path = _write_xml(tmp_path)
    assert build_index(path, expected=1, anchors={"SbE": "A^aSobaEu"}) is not None
    with pytest.raises(ValueError, match="does not hold"):
        build_index(path, expected=1, anchors={"SbE": "text that moved away"})
    with pytest.raises(ValueError, match="does not hold"):
        build_index(path, expected=1, anchors={"gone": "any"})


def test_build_index_keys_a_spaced_heading_by_its_lead_token(tmp_path):
    # Three of the 18 real spaced headings' shapes: a bracketed aorist stem, a
    # trailing-dash alternate spelling, and a two-word phrase heading that must
    # stay whole (the phrase-heading risk perseus_keys.index_keys also refuses).
    body = (
        "<?xml version='1.0'?><TEI.2><text><body>"
        '<div2 n="w$m [y$m]" type="root">'
        '<entryFree key="wa$ama"><sense>Branded.</sense></entryFree></div2>'
        '<div2 n="qysr -" type="root">'
        '<entryFree key="qay~asara"><sense>Measured.</sense></entryFree></div2>'
        '<div2 n="*w Alfrwp" type="root">'
        '<entryFree key="*awoAlfurwp"><sense>A phrase entry.</sense></entryFree>'
        "</div2></body></text></TEI.2>"
    )
    path = _write_xml(tmp_path, body)
    index = build_index(path, expected=None, anchors={})
    assert len(index) == 5  # 2 keys each for the first two, 1 for the phrase
    assert lookup(index, "w$m") is not None  # lead token of a bracketed heading
    assert lookup(index, "qysr") is not None  # lead token of a dash heading
    assert "y$m" not in index  # the bracketed aorist stem is not a root key
    assert lookup(index, "*w Alfrwp") is not None  # phrase heading keyed whole
    assert lookup(index, "*w") is None  # leaking the lead token would be wrong
    # the gate accepts the measured count
    assert build_index(path, expected=5, anchors={}) is not None


def test_lookup_finds_a_geminate_under_lanes_two_letter_key(tmp_path):
    path = tmp_path / "s.xml"
    path.write_text(
        '<div2 n="Sx" type="root"><entryFree key="Sax~a"><sense>Deafened.</sense>'
        "</entryFree></div2>",
        encoding="utf-8",
    )
    assert lookup(build_index(path, expected=1, anchors={}), "Sxx") is not None


def test_download_salmone_extracts_only_the_dictionary_member(tmp_path, monkeypatch):
    # The tarball also ships Lane and four Quran translations, ~15 MB we already
    # have or do not want on disk twice.
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name, body in (
            (SALMONE_MEMBER, DOC.encode()),
            ("Arabic/Lane/opensource/b0.xml", b"<TEI.2/>"),
        ):
            info = tarfile.TarInfo(name)
            info.size = len(body)
            tar.addfile(info, io.BytesIO(body))
    payload = buf.getvalue()

    class _Resp:
        content = payload

        def raise_for_status(self):
            return None

    monkeypatch.setattr(
        "scraper.http_retry.get_with_retry", lambda _client, _url: _Resp()
    )
    out = download_salmone(tmp_path)
    assert out.name == "salmone.xml" and out.read_text("utf-8") == DOC
    assert not (tmp_path / "Arabic").exists()  # nothing else unpacked

    # Each run takes its own scratch name, so two concurrent `--force` writers
    # cannot write through one another's file and publish a half-written one
    # under the final name. A fixed `salmone.xml.part` was shared by both.
    seen: list[str] = []
    real_mkstemp = tempfile.mkstemp

    def _spy(**kwargs):
        fd, name = real_mkstemp(**kwargs)
        seen.append(name)
        return fd, name

    monkeypatch.setattr(tempfile, "mkstemp", _spy)
    download_salmone(tmp_path, force=True)
    download_salmone(tmp_path, force=True)
    assert len(set(seen)) == 2
    assert out.read_text("utf-8") == DOC
    assert not list(tmp_path.glob("salmone.xml.*"))  # each cleans up after itself


def test_download_salmone_raises_when_the_member_is_missing(tmp_path, monkeypatch):
    # A repacked Wayback snapshot without this path used to surface a bare
    # tarfile KeyError from extractfile(name) instead of this message.
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        body = b"<TEI.2/>"
        info = tarfile.TarInfo("Arabic/Lane/opensource/b0.xml")
        info.size = len(body)
        tar.addfile(info, io.BytesIO(body))
    payload = buf.getvalue()

    class _Resp:
        content = payload

        def raise_for_status(self):
            return None

    monkeypatch.setattr(
        "scraper.http_retry.get_with_retry", lambda _client, _url: _Resp()
    )
    with pytest.raises(ValueError, match="missing from the Perseus tarball"):
        download_salmone(tmp_path)


def test_download_salmone_is_idempotent(tmp_path, monkeypatch):
    existing = tmp_path / "salmone.xml"
    existing.write_text(DOC, encoding="utf-8")

    def _boom(*_args, **_kwargs):
        raise AssertionError("re-fetched a file already on disk")

    monkeypatch.setattr("scraper.http_retry.get_with_retry", _boom)
    assert download_salmone(tmp_path) == existing


def test_download_salmone_refuses_a_member_that_declares_a_huge_size(
    tmp_path, monkeypatch
):
    # A tar header's size is what `extractfile().read()` expands to, so a small
    # archive can name a 50 GB member. Only the declared size is faked here --
    # writing 64 MB of real payload to prove the point would be the same test,
    # slower.
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        body = DOC.encode()
        info = tarfile.TarInfo(SALMONE_MEMBER)
        info.size = len(body)
        tar.addfile(info, io.BytesIO(body))
    payload = bytearray(buf.getvalue())

    class _Resp:
        content = bytes(payload)

        def raise_for_status(self):
            return None

    monkeypatch.setattr(
        "scraper.http_retry.get_with_retry", lambda _client, _url: _Resp()
    )
    monkeypatch.setattr(salmone, "MAX_MEMBER_BYTES", len(DOC.encode()) - 1)
    with pytest.raises(ValueError, match="over the"):
        download_salmone(tmp_path)
    assert not (tmp_path / "salmone.xml").exists()  # nothing written
