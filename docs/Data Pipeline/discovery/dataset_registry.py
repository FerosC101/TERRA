"""Dataset catalog loader for TERRA NASA datasets."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


class DatasetRegistry:
    """In-memory catalog of configured NASA Earth observation datasets."""

    def __init__(self, datasets: dict[str, dict[str, Any]]) -> None:
        self._datasets = datasets

    def list_datasets(self, include_planned: bool = True) -> dict[str, dict[str, Any]]:
        if include_planned:
            return dict(self._datasets)
        return {
            key: val
            for key, val in self._datasets.items()
            if val.get("status") == "active"
        }

    def get(self, key: str) -> dict[str, Any]:
        if key not in self._datasets:
            raise KeyError(f"Unknown dataset '{key}'. Available: {list(self._datasets.keys())}")
        return self._datasets[key]


def load_dataset_registry(datasets_yaml: str | Path) -> DatasetRegistry:
    path = Path(datasets_yaml)
    if not path.exists():
        raise FileNotFoundError(f"Datasets catalog not found: {path}")
    with path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    datasets = raw.get("datasets", {})
    if not isinstance(datasets, dict) or not datasets:
        raise ValueError(f"No datasets defined in {path}")
    return DatasetRegistry(datasets)

