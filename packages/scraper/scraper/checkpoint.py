import json
from pathlib import Path


class Checkpoint:
    """Persist scraping progress for resumable runs without re-scraping surahs."""

    def __init__(self, path: str = "checkpoint.json") -> None:
        self._path = Path(path)
        self._state: dict[str, bool] = self._load()

    def _load(self) -> dict[str, bool]:
        if self._path.exists():
            return json.loads(self._path.read_text())
        return {}

    def is_done(self, key: str) -> bool:
        return bool(self._state.get(key))

    def mark_done(self, key: str) -> None:
        self._state[key] = True
        self._path.write_text(json.dumps(self._state, indent=2))

    def reset(self) -> None:
        self._state = {}
        if self._path.exists():
            self._path.unlink()
