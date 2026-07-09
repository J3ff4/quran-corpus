"""Machine-translation providers for word glosses (swappable, SOLID).

MtProvider is the seam: gloss tooling depends on the protocol, not a vendor.
NllbMt is the one concrete impl — Meta NLLB-200 distilled-600M, run locally
(free, offline, no key). Heavy deps (transformers, torch) are imported lazily
so the module and the fast tests never need them; install with the `mt` extra.
"""
from __future__ import annotations

from typing import Protocol


class MtProvider(Protocol):
    def translate(self, texts: list[str]) -> list[str]:
        """English strings -> Uzbek (Latin). len(out) == len(texts)."""
        ...


class NllbMt:
    """NLLB-200 distilled-600M, English (eng_Latn) -> Uzbek Latin (uzn_Latn)."""

    _MODEL = "facebook/nllb-200-distilled-600M"
    _SRC = "eng_Latn"
    _TGT = "uzn_Latn"

    def __init__(self, batch_size: int = 32) -> None:
        self._batch_size = batch_size
        self._tok = None
        self._model = None

    def _load(self) -> None:
        if self._model is not None:
            return
        # Lazy: only paid when a real translation runs.
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer  # noqa: PLC0415

        self._tok = AutoTokenizer.from_pretrained(self._MODEL, src_lang=self._SRC)
        self._model = AutoModelForSeq2SeqLM.from_pretrained(self._MODEL)

    def translate(self, texts: list[str]) -> list[str]:
        if not texts:
            return []
        self._load()
        assert self._tok is not None and self._model is not None
        # NLLB registers each language code as a special token; generation must be
        # forced to it. If it doesn't resolve (unk / None), generate() wouldn't be
        # pinned to Uzbek and non-Uzbek text could be persisted as 'mt' — fail loud.
        bos = self._tok.convert_tokens_to_ids(self._TGT)
        if bos is None or bos == self._tok.unk_token_id:
            raise ValueError(
                f"tokenizer has no target-language token for {self._TGT!r}; "
                "cannot force generation to Uzbek"
            )
        out: list[str] = []
        for i in range(0, len(texts), self._batch_size):
            chunk = texts[i : i + self._batch_size]
            enc = self._tok(chunk, return_tensors="pt", padding=True, truncation=True)
            gen = self._model.generate(
                **enc, forced_bos_token_id=bos, max_length=128
            )
            out.extend(self._tok.batch_decode(gen, skip_special_tokens=True))
        return out
