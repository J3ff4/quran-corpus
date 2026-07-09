from __future__ import annotations

from scraper.mt import MtProvider


class FakeMt:
    """Deterministic stand-in used across gloss tests."""
    def translate(self, texts: list[str]) -> list[str]:
        return [f"uz:{t}" for t in texts]


def test_fake_satisfies_protocol() -> None:
    p: MtProvider = FakeMt()
    assert p.translate(["from", "Allah"]) == ["uz:from", "uz:Allah"]


def test_nllb_importable_without_torch() -> None:
    # Module must import even when transformers/torch absent (lazy load).
    from scraper.mt import NllbMt
    assert NllbMt is not None


class _FakeTok:
    """Tokenizer that fails to resolve the target-language token (returns unk)."""
    unk_token_id = 3

    def convert_tokens_to_ids(self, token):
        return self.unk_token_id


def test_translate_raises_when_target_token_unresolved() -> None:
    # If the tokenizer has no special token for uzn_Latn, generation would not be
    # forced to Uzbek and non-Uzbek text could be persisted as 'mt'. Must raise.
    import pytest

    from scraper.mt import NllbMt

    mt = NllbMt()
    mt._tok = _FakeTok()
    mt._model = object()  # non-None so _load() short-circuits before torch import
    with pytest.raises(ValueError, match="uzn_Latn"):
        mt.translate(["from"])
