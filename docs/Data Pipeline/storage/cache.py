"""Raw file caching and incremental retrieval tracking for TERRA."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class FileCache:
    """Manages raw downloaded files and retrieval metadata to avoid redundant API calls."""

    def __init__(self, data_dir: str | Path = "data") -> None:
        self.data_dir = Path(data_dir)
        self.raw_dir = self.data_dir / "raw"
        self.metadata_dir = self.data_dir / "metadata"
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        self.index_path = self.metadata_dir / "retrieval_cache_index.json"

    def _load_index(self) -> dict[str, Any]:
        if not self.index_path.exists():
            return {}
        try:
            with self.index_path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return {}

    def _save_index(self, index: dict[str, Any]) -> None:
        with self.index_path.open("w", encoding="utf-8") as fh:
            json.dump(index, fh, indent=2)

    def raw_path(self, dataset: str, filename: str) -> Path:
        ds_dir = self.raw_dir / dataset.lower()
        ds_dir.mkdir(parents=True, exist_ok=True)
        return ds_dir / filename

    def build_cache_key(self, dataset: str, aoi_id: str, params: dict[str, Any]) -> str:
        payload = json.dumps({"dataset": dataset, "aoi": aoi_id, "params": params}, sort_keys=True)
        digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]
        return f"{dataset.lower()}_{aoi_id}_{digest}"

    def has_valid_file(self, path: Path) -> bool:
        return path.exists() and path.is_file() and path.stat().st_size > 0

    def get_cached_entry(self, cache_key: str) -> dict[str, Any] | None:
        index = self._load_index()
        entry = index.get(cache_key)
        if not entry:
            return None
        file_path = Path(entry.get("file_path", ""))
        if not self.has_valid_file(file_path):
            return None
        return entry

    def record_retrieval(
        self,
        cache_key: str,
        file_path: Path,
        dataset: str,
        aoi_id: str,
        source_url: str,
        extra_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        index = self._load_index()
        entry = {
            "cache_key": cache_key,
            "dataset": dataset,
            "aoi_id": aoi_id,
            "file_path": str(file_path),
            "source_url": source_url,
            "retrieved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "size_bytes": file_path.stat().st_size if file_path.exists() else 0,
            "metadata": extra_metadata or {},
        }
        index[cache_key] = entry
        self._save_index(index)
        return entry

