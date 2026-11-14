"""Shared HTTP, NASA CMR discovery, retry, and Earthdata Login client."""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

CMR_GRANULES_URL = "https://cmr.earthdata.nasa.gov/search/granules.json"


class EarthdataAuthRedirectSession(requests.Session):
    """Session preserving Authorization header across Earthdata URS redirects."""

    AUTH_HOST = "urs.earthdata.nasa.gov"

    def rebuild_auth(self, prepared_request: requests.PreparedRequest, response: requests.Response) -> None:
        headers = prepared_request.headers
        url = prepared_request.url or ""
        if "Authorization" in headers:
            original_host = requests.utils.urlparse(response.request.url).hostname
            redirect_host = requests.utils.urlparse(url).hostname
            if original_host != redirect_host and redirect_host != self.AUTH_HOST:
                # Earthdata redirects from DAAC -> urs.earthdata.nasa.gov -> DAAC with cookies
                if not (redirect_host or "").endswith(".nasa.gov"):
                    del headers["Authorization"]


class EarthdataClient:
    """Reusable NASA API & Earthdata CMR/OPeNDAP client with retry and rate limiting."""

    def __init__(
        self,
        timeout: int = 30,
        max_retries: int = 3,
        backoff_factor: float = 1.0,
        rate_limit_delay: float = 0.25,
    ) -> None:
        self.timeout = timeout
        self.rate_limit_delay = rate_limit_delay
        self._last_request_ts = 0.0

        self.session = EarthdataAuthRedirectSession()
        retry = Retry(
            total=max_retries,
            backoff_factor=backoff_factor,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "HEAD"],
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
        self.session.headers.update({"User-Agent": "TERRA-NASA-Data-Pipeline/1.0"})

    @property
    def token(self) -> str:
        return os.environ.get("EARTHDATA_TOKEN", "").strip()

    @property
    def username(self) -> str:
        return os.environ.get("EARTHDATA_USERNAME", "").strip()

    @property
    def password(self) -> str:
        return os.environ.get("EARTHDATA_PASSWORD", "").strip()

    def has_credentials(self) -> bool:
        return bool(self.token or (self.username and self.password))

    def _respect_rate_limit(self) -> None:
        elapsed = time.monotonic() - self._last_request_ts
        if elapsed < self.rate_limit_delay:
            time.sleep(self.rate_limit_delay - elapsed)
        self._last_request_ts = time.monotonic()

    def get_json(self, url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self._respect_rate_limit()
        resp = self.session.get(url, params=params, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    def search_cmr_granules(
        self,
        short_name: str,
        bbox: list[float],
        temporal: str,
        page_size: int = 100,
        max_pages: int = 5,
    ) -> list[dict[str, Any]]:
        """Query NASA CMR for granules intersecting the AOI bbox and temporal range."""
        bbox_str = ",".join(f"{v:.6f}" for v in bbox)
        all_granules: list[dict[str, Any]] = []

        for page_num in range(1, max_pages + 1):
            params = {
                "short_name": short_name,
                "bounding_box": bbox_str,
                "temporal": temporal,
                "page_size": page_size,
                "page_num": page_num,
            }
            payload = self.get_json(CMR_GRANULES_URL, params=params)
            entries = payload.get("feed", {}).get("entry", [])
            if not entries:
                break

            for entry in entries:
                data_url = None
                opendap_url = None
                for link in entry.get("links", []):
                    rel = link.get("rel", "")
                    href = link.get("href", "")
                    if rel.endswith("/data#") and href.startswith("https://") and not data_url:
                        if not href.endswith((".xml", ".qa", ".jpg", ".png")):
                            data_url = href
                    elif rel.endswith("/service#") and "opendap" in href and not opendap_url:
                        opendap_url = href

                all_granules.append(
                    {
                        "id": entry.get("id"),
                        "title": entry.get("title"),
                        "collection_concept_id": entry.get("collection_concept_id"),
                        "time_start": entry.get("time_start"),
                        "time_end": entry.get("time_end"),
                        "data_url": data_url,
                        "opendap_url": opendap_url,
                    }
                )

            if len(entries) < page_size:
                break

        return all_granules

    def download_authenticated(
        self,
        url: str,
        destination: Path,
    ) -> Path:
        """Download an Earthdata-protected granule or OPeNDAP subset using env credentials."""
        if not self.has_credentials():
            raise PermissionError(
                "Earthdata credentials missing. Set EARTHDATA_TOKEN or "
                "EARTHDATA_USERNAME/EARTHDATA_PASSWORD in environment / .env."
            )

        headers: dict[str, str] = {}
        auth = None
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        elif self.username and self.password:
            auth = (self.username, self.password)

        self._respect_rate_limit()
        destination.parent.mkdir(parents=True, exist_ok=True)
        with self.session.get(
            url, headers=headers, auth=auth, stream=True, timeout=max(self.timeout, 60)
        ) as resp:
            resp.raise_for_status()
            content_type = resp.headers.get("Content-Type", "").lower()
            if "text/html" in content_type:
                raise PermissionError(
                    f"Earthdata returned HTML login/redirect instead of data for {url}. "
                    "Verify EARTHDATA_TOKEN is valid and DAAC apps are authorized in your URS profile."
                )
            with destination.open("wb") as fh:
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk:
                        fh.write(chunk)
        return destination

