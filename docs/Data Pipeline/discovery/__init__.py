"""Dataset registry and live spatial/temporal coverage discovery."""

from discovery.coverage_checker import check_dataset_coverage
from discovery.dataset_registry import DatasetRegistry, load_dataset_registry

__all__ = [
    "DatasetRegistry",
    "load_dataset_registry",
    "check_dataset_coverage",
]

