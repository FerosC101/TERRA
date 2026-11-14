"""AOI loading, geometry validation, and spatial scale checks."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from shapely.geometry import shape
from shapely.validation import explain_validity


@dataclass
class AOIInfo:
    """Validated AOI geometry and derived spatial metadata."""

    location_id: str
    aoi_name: str
    crs: str
    geojson_path: str
    geometry_type: str
    centroid_lon: float
    centroid_lat: float
    bbox: list[float]  # [min_lon, min_lat, max_lon, max_lat]
    area_km2: float
    area_ha: float
    buffer_m: float
    is_valid: bool
    geojson_feature: dict[str, Any]
    resolution_notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "location_id": self.location_id,
            "aoi_name": self.aoi_name,
            "crs": self.crs,
            "geojson_path": self.geojson_path,
            "geometry_type": self.geometry_type,
            "centroid": {"lat": round(self.centroid_lat, 6), "lon": round(self.centroid_lon, 6)},
            "bbox": [round(v, 6) for v in self.bbox],
            "area_km2": round(self.area_km2, 4),
            "area_ha": round(self.area_ha, 2),
            "buffer_m": self.buffer_m,
            "is_valid": self.is_valid,
            "resolution_notes": self.resolution_notes,
            "geometry": self.geojson_feature.get("geometry"),
        }


def _compute_area_m2(geom: Any) -> float:
    """Compute approximate metric area on WGS84 using local equirectangular scaling."""
    minx, miny, maxx, maxy = geom.bounds
    lat0 = (miny + maxy) / 2.0
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110574.0

    def _ring_area(coords: list[tuple[float, float]]) -> float:
        pts = [(x * kx, y * ky) for x, y in coords]
        total = 0.0
        for i in range(len(pts) - 1):
            total += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
        return abs(total) / 2.0

    if geom.geom_type == "Polygon":
        ext = _ring_area(list(geom.exterior.coords))
        holes = sum(_ring_area(list(r.coords)) for r in geom.interiors)
        return max(0.0, ext - holes)
    if geom.geom_type == "MultiPolygon":
        return sum(_compute_area_m2(poly) for poly in geom.geoms)
    return 0.0


def _validate_coordinates_in_wgs84(geom: Any) -> None:
    """Ensure all coordinate vertices lie within valid geographic bounds."""
    minx, miny, maxx, maxy = geom.bounds
    if not (-180.0 <= minx <= 180.0 and -180.0 <= maxx <= 180.0):
        raise ValueError(f"Longitude out of [-180, 180] bounds: [{minx}, {maxx}]")
    if not (-90.0 <= miny <= 90.0 and -90.0 <= maxy <= 90.0):
        raise ValueError(f"Latitude out of [-90, 90] bounds: [{miny}, {maxy}]")


def _extract_primary_feature(geojson_data: dict[str, Any]) -> dict[str, Any]:
    gtype = geojson_data.get("type")
    if gtype == "FeatureCollection":
        features = geojson_data.get("features") or []
        if not features:
            raise ValueError("GeoJSON FeatureCollection contains no features.")
        if len(features) > 1:
            raise ValueError(
                f"Expected 1 AOI feature in GeoJSON, found {len(features)}. "
                "Provide a single authoritative AOI boundary."
            )
        return features[0]
    if gtype == "Feature":
        return geojson_data
    if gtype in {"Polygon", "MultiPolygon"}:
        return {"type": "Feature", "properties": {}, "geometry": geojson_data}
    raise ValueError(f"Unsupported GeoJSON root type: {gtype}")


def load_farm_config(config_path: str | Path) -> dict[str, Any]:
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Farm configuration file not found: {path}")
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"Invalid YAML structure in {path}")
    return data


def load_and_validate_aoi(
    config_or_path: str | Path | dict[str, Any],
    base_dir: str | Path | None = None,
) -> AOIInfo:
    """Load the AOI GeoJSON from farm config, validate geometry, and compute extent."""
    if isinstance(config_or_path, (str, Path)):
        cfg_path = Path(config_or_path)
        cfg = load_farm_config(cfg_path)
        root = Path(base_dir) if base_dir else cfg_path.parent.parent
    else:
        cfg = config_or_path
        root = Path(base_dir) if base_dir else Path.cwd()

    geojson_rel = cfg.get("geojson_path")
    if not geojson_rel:
        raise ValueError("farm_config.yaml must specify 'geojson_path'.")

    geojson_file = Path(geojson_rel)
    if not geojson_file.is_absolute():
        geojson_file = (root / geojson_file).resolve()
    if not geojson_file.exists():
        raise FileNotFoundError(f"AOI GeoJSON file not found: {geojson_file}")

    with geojson_file.open("r", encoding="utf-8") as fh:
        raw_geojson = json.load(fh)

    feature = _extract_primary_feature(raw_geojson)
    geometry_dict = feature.get("geometry")
    if not geometry_dict:
        raise ValueError("AOI GeoJSON feature has no geometry.")

    geom_type = geometry_dict.get("type")
    if geom_type not in {"Polygon", "MultiPolygon"}:
        raise ValueError(f"AOI geometry must be Polygon or MultiPolygon, got {geom_type}.")

    # Explicit ring closure check on raw coordinates before Shapely auto-closes anything.
    rings = (
        geometry_dict["coordinates"]
        if geom_type == "Polygon"
        else [ring for poly in geometry_dict["coordinates"] for ring in poly]
    )
    for idx, ring in enumerate(rings):
        if len(ring) < 4:
            raise ValueError(f"Polygon ring {idx} has fewer than 4 vertices.")
        if ring[0][:2] != ring[-1][:2]:
            raise ValueError(f"Polygon ring {idx} is not closed (first != last vertex).")

    geom = shape(geometry_dict)
    if not geom.is_valid:
        raise ValueError(f"Invalid AOI geometry: {explain_validity(geom)}")
    _validate_coordinates_in_wgs84(geom)

    area_m2 = _compute_area_m2(geom)
    if area_m2 <= 0:
        raise ValueError("AOI polygon has zero or negative area.")

    buffer_m = float(cfg.get("buffer_m", 0) or 0)
    effective_geom = geom
    if buffer_m > 0:
        # Convert buffer in meters to approximate degrees at centroid latitude.
        lat0 = geom.centroid.y
        deg_buffer = buffer_m / (111320.0 * max(0.1, math.cos(math.radians(lat0))))
        effective_geom = geom.buffer(deg_buffer)
        area_m2 = _compute_area_m2(effective_geom)

    min_lon, min_lat, max_lon, max_lat = effective_geom.bounds
    centroid = effective_geom.centroid
    area_km2 = area_m2 / 1_000_000.0
    area_ha = area_m2 / 10_000.0

    resolution_notes = [
        f"AOI area is {area_km2:.3f} km2 ({area_ha:.1f} ha), smaller than coarse satellite/reanalysis grid cells.",
        "NASA POWER (~55 km grid) represents regional agroclimatology enclosing the AOI, not field-level microclimate.",
        "GPM IMERG (0.1 deg ~11 km) and SMAP (9 km EASE-Grid 2.0) extract the enclosing/nearest grid cell without artificial downscaling.",
    ]

    return AOIInfo(
        location_id=str(cfg.get("location_id", "aoi_001")),
        aoi_name=str(
            cfg.get("aoi_name")
            or feature.get("properties", {}).get("name")
            or "Unnamed_AOI"
        ),
        crs=str(cfg.get("crs", "EPSG:4326")),
        geojson_path=str(geojson_file),
        geometry_type=effective_geom.geom_type,
        centroid_lon=float(centroid.x),
        centroid_lat=float(centroid.y),
        bbox=[float(min_lon), float(min_lat), float(max_lon), float(max_lat)],
        area_km2=area_km2,
        area_ha=area_ha,
        buffer_m=buffer_m,
        is_valid=True,
        geojson_feature=feature,
        resolution_notes=resolution_notes,
    )

