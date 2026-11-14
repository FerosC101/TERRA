"""Raster and gridded NetCDF4 / HDF5 spatial subset extraction over AOI bounds."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import h5py
import numpy as np
import xarray as xr

COMMON_FILL_VALUES = {-999.0, -9999.0, -9999.9, -32768.0}


def _is_fill_or_invalid(val: float, fill_value: float | None = None) -> bool:
    if not math.isfinite(val):
        return True
    if abs(val) > 1e15:  # catches standard NetCDF _FillValue like 9.96921e+36
        return True
    if fill_value is not None and math.isfinite(fill_value) and abs(val - fill_value) < 1e-6:
        return True
    return any(abs(val - fv) < 1e-6 for fv in COMMON_FILL_VALUES)


def _find_coord_array(ds: xr.Dataset, candidates: tuple[str, ...]) -> tuple[str | None, np.ndarray | None]:
    for name in candidates:
        if name in ds.coords:
            return name, np.asarray(ds.coords[name].values, dtype=float)
        if name in ds.variables:
            return name, np.asarray(ds.variables[name].values, dtype=float)
    return None, None


def _subset_1d_grid(
    ds: xr.Dataset,
    var_name: str,
    aoi_bbox: list[float],
    centroid_lon: float,
    centroid_lat: float,
) -> dict[str, Any]:
    min_lon, min_lat, max_lon, max_lat = aoi_bbox
    lon_name, lons = _find_coord_array(ds, ("lon", "longitude", "Lon", "Longitude", "x"))
    lat_name, lats = _find_coord_array(ds, ("lat", "latitude", "Lat", "Latitude", "y"))

    if lons is None or lats is None or lons.ndim != 1 or lats.ndim != 1:
        raise ValueError(f"1D lat/lon coordinates not found for variable {var_name}")

    da = ds[var_name]
    fill_attr = da.attrs.get("_FillValue")
    fill_val = float(fill_attr) if fill_attr is not None else None
    unit_attr = str(da.attrs.get("units", ""))

    # Squeeze time dimension if size 1 or select first slice
    for dim in list(da.dims):
        if dim not in {lat_name, lon_name} and da.sizes[dim] >= 1:
            da = da.isel({dim: 0})

    lat_idx = np.where((lats >= min_lat) & (lats <= max_lat))[0]
    lon_idx = np.where((lons >= min_lon) & (lons <= max_lon))[0]

    extraction_mode = "bbox_subset"
    if len(lat_idx) == 0 or len(lon_idx) == 0:
        # Coarse satellite pixel > 1.337 km2 AOI: compute 2x2 IDW around centroid and preserve nearest/max.
        n_lat = int(np.argmin(np.abs(lats - centroid_lat)))
        n_lon = int(np.argmin(np.abs(lons - centroid_lon)))
        nearest_raw = float(da.isel({lat_name: n_lat, lon_name: n_lon}).values)
        nearest_pixel_value: float | None = (
            None if _is_fill_or_invalid(nearest_raw, fill_val) else nearest_raw
        )

        lat_idx = np.sort(np.argsort(np.abs(lats - centroid_lat))[: min(2, len(lats))])
        lon_idx = np.sort(np.argsort(np.abs(lons - centroid_lon))[: min(2, len(lons))])
        sub = da.isel({lat_name: lat_idx, lon_name: lon_idx}).transpose(lat_name, lon_name)

        valid_pts: list[tuple[float, float]] = []
        sub_vals = np.asarray(sub.values, dtype=float)
        for i, glat in enumerate(lats[lat_idx]):
            for j, glon in enumerate(lons[lon_idx]):
                val = float(sub_vals[i, j])
                if not _is_fill_or_invalid(val, fill_val):
                    dist_deg = math.hypot(float(glat) - centroid_lat, float(glon) - centroid_lon)
                    valid_pts.append((val, dist_deg))

        if valid_pts:
            exact = [val for val, dist in valid_pts if dist < 1e-9]
            if exact:
                idw_val = float(np.mean(exact))
            else:
                weights = [1.0 / (dist ** 2) for _, dist in valid_pts]
                idw_val = float(
                    sum(w * val for (val, _), w in zip(valid_pts, weights)) / sum(weights)
                )
            neighborhood_max: float | None = float(max(val for val, _ in valid_pts))
        else:
            idw_val = None
            neighborhood_max = None

        extraction_mode = (
            "idw_2x2_coarse_grid" if int(sub_vals.size) > 1 else "nearest_grid_cell_containing_aoi"
        )
        return {
            "value": idw_val,
            "nearest_pixel_value": nearest_pixel_value,
            "neighborhood_max": neighborhood_max,
            "valid_pixel_count": len(valid_pts),
            "total_pixel_count": int(sub_vals.size),
            "unit": unit_attr,
            "extraction_mode": extraction_mode,
            "grid_cell_center": {
                "lat": round(float(lats[n_lat]), 6),
                "lon": round(float(lons[n_lon]), 6),
            },
        }

    sub = da.isel({lat_name: lat_idx, lon_name: lon_idx})
    arr = np.asarray(sub.values, dtype=float).ravel()
    valid_vals = [float(v) for v in arr if not _is_fill_or_invalid(float(v), fill_val)]

    grid_lats = lats[lat_idx]
    grid_lons = lons[lon_idx]
    cell_lat = float(np.mean(grid_lats))
    cell_lon = float(np.mean(grid_lons))

    return {
        "value": float(np.mean(valid_vals)) if valid_vals else None,
        "nearest_pixel_value": float(np.mean(valid_vals)) if valid_vals else None,
        "neighborhood_max": float(max(valid_vals)) if valid_vals else None,
        "valid_pixel_count": len(valid_vals),
        "total_pixel_count": int(arr.size),
        "unit": unit_attr,
        "extraction_mode": extraction_mode,
        "grid_cell_center": {"lat": round(cell_lat, 6), "lon": round(cell_lon, 6)},
    }


def extract_aoi_from_netcdf(
    file_path: str | Path,
    aoi_bbox: list[float],
    centroid_lon: float,
    centroid_lat: float,
    variable_names: list[str],
) -> dict[str, dict[str, Any]]:
    """Extract AOI values for requested variables from NetCDF4 or simple HDF5 files."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Raster file not found: {path}")

    results: dict[str, dict[str, Any]] = {}

    # Try opening root or 'Grid' group (GPM IMERG NetCDF4/HDF5 often nests variables under 'Grid')
    groups_to_try: list[str | None] = [None, "Grid"]
    for grp in groups_to_try:
        try:
            ds = xr.open_dataset(path, group=grp) if grp else xr.open_dataset(path)
        except Exception:
            continue

        try:
            for var_name in variable_names:
                if var_name in ds.data_vars and var_name not in results:
                    results[var_name] = _subset_1d_grid(
                        ds, var_name, aoi_bbox, centroid_lon, centroid_lat
                    )
        finally:
            ds.close()

        if len(results) == len(variable_names):
            return results

    # Fallback: 2D EASE-Grid / nested HDF5 extraction (typical for SMAP SPL3SMP_E / SPL4SMGP)
    missing_vars = [v for v in variable_names if v not in results]
    if missing_vars:
        h5_results = extract_aoi_from_smap_hdf5(
            path, aoi_bbox, centroid_lon, centroid_lat, missing_vars
        )
        results.update(h5_results)

    return results


def extract_aoi_from_smap_hdf5(
    file_path: str | Path,
    aoi_bbox: list[float],
    centroid_lon: float,
    centroid_lat: float,
    variable_names: list[str],
    max_distance_deg: float = 0.25,
) -> dict[str, dict[str, Any]]:
    """Extract AOI subset from SMAP HDF5 groups (2D lat/lon EASE-Grid 2.0)."""
    path = Path(file_path)
    min_lon, min_lat, max_lon, max_lat = aoi_bbox
    results: dict[str, dict[str, Any]] = {}

    candidate_groups = [
        "",
        "Soil_Moisture_Retrieval_Data_AM",
        "Soil_Moisture_Retrieval_Data_PM",
        "Geophysical_Data",
    ]

    with h5py.File(path, "r") as hf:
        # Locate lat/lon datasets anywhere at root or inside groups (supports AM & _pm suffixes)
        for grp_name in candidate_groups:
            grp = hf if grp_name == "" else hf.get(grp_name)
            if grp is None:
                continue

            lat_ds = None
            lon_ds = None
            for k in ("latitude", "latitude_pm", "cell_lat", "lat"):
                if k in grp:
                    lat_ds = np.asarray(grp[k][...], dtype=float)
                    break
                if k in hf:
                    lat_ds = np.asarray(hf[k][...], dtype=float)
                    break
            for k in ("longitude", "longitude_pm", "cell_lon", "lon"):
                if k in grp:
                    lon_ds = np.asarray(grp[k][...], dtype=float)
                    break
                if k in hf:
                    lon_ds = np.asarray(hf[k][...], dtype=float)
                    break

            if lat_ds is None or lon_ds is None:
                continue

            # Replace SMAP invalid lat/lon fill (-9999)
            valid_geo = (
                np.isfinite(lat_ds)
                & np.isfinite(lon_ds)
                & (lat_ds >= -90.0)
                & (lat_ds <= 90.0)
                & (lon_ds >= -180.0)
                & (lon_ds <= 180.0)
            )
            no_overpass = False
            extraction_mode = "bbox_subset"
            mask = None
            if not np.any(valid_geo):
                no_overpass = True
                extraction_mode = "no_overpass_covering_aoi"
                lat_grid, lon_grid = lat_ds, lon_ds
            else:
                if lat_ds.ndim == 1 and lon_ds.ndim == 1:
                    lat_grid, lon_grid = np.meshgrid(lat_ds, lon_ds, indexing="ij")
                else:
                    lat_grid, lon_grid = lat_ds, lon_ds

                in_bbox = (
                    valid_geo
                    & (lat_grid >= min_lat)
                    & (lat_grid <= max_lat)
                    & (lon_grid >= min_lon)
                    & (lon_grid <= max_lon)
                )

                if not np.any(in_bbox):
                    dist2 = np.where(
                        valid_geo,
                        (lat_grid - centroid_lat) ** 2 + (lon_grid - centroid_lon) ** 2,
                        np.inf,
                    )
                    min_idx = np.unravel_index(int(np.argmin(dist2)), dist2.shape)
                    min_dist_deg = float(math.sqrt(float(dist2[min_idx])))
                    if min_dist_deg > max_distance_deg:
                        no_overpass = True
                        extraction_mode = "no_overpass_covering_aoi"
                    else:
                        extraction_mode = "nearest_grid_cell_containing_aoi"
                        mask = np.zeros_like(lat_grid, dtype=bool)
                        mask[min_idx] = True
                else:
                    mask = in_bbox

            suffix = "_pm" if grp_name.endswith("_PM") else ""
            for var_name in variable_names:
                existing = results.get(var_name)
                if existing and existing.get("extraction_mode") != "no_overpass_covering_aoi":
                    continue

                ds_key = var_name if var_name in grp else (f"{var_name}{suffix}" if suffix else var_name)
                if ds_key not in grp:
                    continue

                dset = grp[ds_key]
                units_raw = dset.attrs.get("units", b"")
                unit_str = (
                    units_raw.decode("utf-8", errors="ignore")
                    if isinstance(units_raw, bytes)
                    else str(units_raw)
                )

                if no_overpass or mask is None:
                    results[var_name] = {
                        "value": None,
                        "valid_pixel_count": 0,
                        "total_pixel_count": 0,
                        "unit": unit_str,
                        "extraction_mode": extraction_mode,
                        "group": grp_name or "root",
                        "grid_cell_center": None,
                    }
                    continue

                arr = np.asarray(dset[...], dtype=float)
                fill_attr = dset.attrs.get("_FillValue")
                fill_val = float(np.asarray(fill_attr).ravel()[0]) if fill_attr is not None else None

                selected = arr[mask].ravel()
                valid_vals = [float(v) for v in selected if not _is_fill_or_invalid(float(v), fill_val)]

                results[var_name] = {
                    "value": float(np.mean(valid_vals)) if valid_vals else None,
                    "valid_pixel_count": len(valid_vals),
                    "total_pixel_count": int(selected.size),
                    "unit": unit_str,
                    "extraction_mode": extraction_mode,
                    "group": grp_name or "root",
                    "grid_cell_center": {
                        "lat": round(float(np.mean(lat_grid[mask])), 6),
                        "lon": round(float(np.mean(lon_grid[mask])), 6),
                    },
                }

    return results

