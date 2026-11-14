"""CLI entrypoint for the TERRA NASA Earth Observation Data Pipeline."""

from __future__ import annotations

import argparse
import json
import os
import sys

import uvicorn
from rich.console import Console
from rich.table import Table

from pipelines.nasa_pipeline import TerraNasaPipeline

console = Console()


def _print_summary(report: dict) -> None:
    aoi = report.get("aoi", {})
    console.print(
        f"\n[bold green]TERRA NASA Pipeline Complete[/bold green] — "
        f"AOI: [cyan]{aoi.get('aoi_name')}[/cyan] ({aoi.get('area_km2')} km2 / {aoi.get('area_ha')} ha)"
    )
    console.print(
        f"Centroid: lat={aoi.get('centroid', {}).get('lat')}, lon={aoi.get('centroid', {}).get('lon')} | "
        f"Date range: {report.get('date_range', {}).get('start_date')} .. {report.get('date_range', {}).get('end_date')}"
    )
    console.print(
        f"Earthdata Credentials Configured: {report.get('earthdata_credentials_configured')} | "
        f"Records Upserted: [bold]{report.get('total_records_upserted')}[/bold]\n"
    )

    table = Table(title="Dataset Execution Summary")
    table.add_column("Dataset", style="cyan")
    table.add_column("Retrieval Status")
    table.add_column("Records", justify="right")
    table.add_column("Quality Status")
    table.add_column("Notes")

    for ds_name, info in report.get("datasets", {}).items():
        notes = ""
        if ds_name == "GPM_IMERG":
            notes = f"CMR granules={info.get('cmr_granules_discovered', 0)}"
            if info.get("message"):
                notes += " | " + info["message"][:70]
        elif ds_name == "SMAP":
            prods = info.get("products", {})
            parts = [
                f"{p}:{pinfo.get('cmr_granules_discovered', 0)} CMR"
                for p, pinfo in prods.items()
            ]
            notes = ", ".join(parts)
        elif info.get("warnings"):
            notes = "; ".join(info["warnings"])[:80]

        table.add_row(
            ds_name,
            str(info.get("retrieval_status")),
            str(info.get("records_processed", 0)),
            str(info.get("quality_status")),
            notes,
        )
    console.print(table)


def main() -> int:
    parser = argparse.ArgumentParser(description="TERRA NASA Earth Observation Data Pipeline")
    parser.add_argument(
        "--action",
        choices=["run", "discover", "download", "process", "validate", "serve"],
        default="run",
        help="Pipeline action to execute (default: run)",
    )
    parser.add_argument("--config", default="config/farm_config.yaml", help="Path to farm config YAML")
    parser.add_argument("--datasets-config", default="config/datasets.yaml", help="Path to datasets YAML")
    parser.add_argument("--data-dir", default="data", help="Base data directory")
    parser.add_argument("--start-date", default=None, help="Override start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", default=None, help="Override end date (YYYY-MM-DD)")
    parser.add_argument(
        "--datasets",
        nargs="+",
        default=None,
        help="Optional subset of datasets (e.g. NASA_POWER GPM_IMERG SMAP)",
    )
    parser.add_argument("--force-refresh", action="store_true", help="Bypass raw download cache")
    parser.add_argument("--host", default=os.environ.get("TERRA_API_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("TERRA_API_PORT", "8000")))

    args = parser.parse_args()

    if args.action == "serve":
        console.print(f"Starting TERRA FastAPI server on http://{args.host}:{args.port} ...")
        uvicorn.run("api.routes:app", host=args.host, port=args.port, reload=False)
        return 0

    pipeline = TerraNasaPipeline(
        farm_config_path=args.config,
        datasets_config_path=args.datasets_config,
        data_dir=args.data_dir,
    )

    if args.action == "discover":
        res = pipeline.discover(start_date=args.start_date, end_date=args.end_date, query_cmr=True)
        console.print_json(json.dumps(res))
        return 0

    if args.action == "download":
        raw = pipeline.download(
            start_date=args.start_date,
            end_date=args.end_date,
            datasets=args.datasets,
            force_refresh=args.force_refresh,
        )
        summary = {
            k: {sk: sv for sk, sv in v.items() if sk != "payload"} if isinstance(v, dict) else v
            for k, v in raw.items()
        }
        console.print_json(json.dumps(summary, default=str))
        return 0

    if args.action in {"process", "validate"}:
        # Process already cached/local files (without forcing remote download if present)
        raw = pipeline.download(
            start_date=args.start_date,
            end_date=args.end_date,
            datasets=args.datasets,
            force_refresh=False,
        )
        s_date = args.start_date or str(pipeline.farm_config["start_date"])
        e_date = args.end_date or str(pipeline.farm_config["end_date"])
        report = pipeline.process_and_validate(raw, s_date, e_date)
        _print_summary(report)
        return 0

    report = pipeline.run(
        start_date=args.start_date,
        end_date=args.end_date,
        datasets=args.datasets,
        force_refresh=args.force_refresh,
    )
    _print_summary(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())

