import type { Selection } from "@/components/maps/FieldMap";
import { SMAP_CELL_HA, type MoistureReading, type NdviPixel } from "@/lib/demo/spatial";
import { addDays, longDate } from "@/lib/dates";
import type { FieldSummary } from "@/lib/fieldSummary";
import { fmt, signed } from "@/lib/format";
import { obsProvenance } from "@/lib/provenance";
import type { Discovery, Field, LatLng, Provenance } from "@/types";

/** Everything the detail panel shows for whatever is selected on the map. */
export interface SelectionDetail {
  title: string;
  /** Observation type, in plain words */
  type: string;
  position: LatLng;
  source: Provenance | null;
  sourceName: string;
  date: string | null;
  /** How much ground the value describes */
  coverage: string;
  values: { label: string; value: string; swatch?: { kind: "moisture" | "ndvi"; value: number } }[];
  note: string;
  link?: { href: string; label: string };
}

interface Context {
  field: Field;
  summary: FieldSummary;
  moisture: MoistureReading[];
  pixels: NdviPixel[];
  discoveries: Discovery[];
}

export function describeSelection(selection: Selection, { field, summary, moisture, pixels, discoveries }: Context): SelectionDetail {
  const { latest } = summary;

  if (selection.type === "station") {
    return {
      title: field.station.name, type: "Field station", position: field.station.position, source: obsProvenance(field, "surfaceVwc", latest),
      sourceName: field.station.status === "planned"
        ? `${field.station.id} · planned site, not installed; readings simulated from its design`
        : `${field.station.id} · simulated, no hardware connected`,
      date: latest.date, coverage: "A single point in the field",
      values: [
        { label: "Soil moisture, 10 cm", value: `${fmt(latest.surfaceVwc, 1)} %` },
        { label: "Soil moisture, 40 cm", value: `${fmt(latest.deepVwc, 1)} %` },
        { label: "Soil temperature, 10 cm", value: `${fmt(latest.soilTempC, 1)} °C` },
        { label: obsProvenance(field, "rainMm", latest) === "measurement" ? "Rainfall that day" : "Rainfall that day (NASA, not a gauge)", value: `${fmt(latest.rainMm, 1)} mm` },
      ],
      note: field.station.note ?? "The station measures one point. Conditions elsewhere in the field can differ.",
    };
  }

  if (selection.type === "moisture") {
    const m = moisture.find((x) => x.id === selection.id) ?? moisture[0];
    return {
      title: m.label, type: "Soil moisture measurement", position: m.position, source: "measurement",
      sourceName: "Handheld probe", date: addDays(latest.date, -1), coverage: "A single point, 0–10 cm deep",
      values: [
        { label: "Surface soil moisture", value: `${fmt(m.value, 1)} %`, swatch: { kind: "moisture", value: m.value } },
        { label: "Compared with the station", value: `${signed(m.value - latest.surfaceVwc)} points` },
      ],
      note: "Probe readings show how moisture varies across the field compared with the station.",
    };
  }

  if (selection.type === "anomaly") {
    const point = field.points.find((p) => p.id === selection.id);
    const d = discoveries.find((x) => x.kind === point?.discoveryKind);
    return {
      title: d?.title ?? point?.label ?? "Discovery", type: "Discovery location", position: point?.position ?? field.center, source: null,
      sourceName: "TERRA detector", date: d?.detectedOn ?? null, coverage: "Where the pattern was observed",
      values: d ? [{ label: "Status", value: d.status === "new" ? "New" : d.status === "investigating" ? "Investigating" : "Resolved" }] : [],
      note: d ? d.summary : "The detector rule for this location is not currently met.",
      link: d ? { href: `/discoveries/${d.id}`, label: "Open investigation" } : undefined,
    };
  }

  if (selection.type === "pixel") {
    const p = pixels.find((x) => x.id === selection.id) ?? pixels[0];
    return {
      title: "Vegetation pixel", type: "Vegetation index (NDVI)", source: "satellite", sourceName: "MODIS MOD13Q1",
      position: { lat: (p.bounds[0].lat + p.bounds[1].lat) / 2, lng: (p.bounds[0].lng + p.bounds[1].lng) / 2 },
      date: summary.lastNdvi?.date ?? null, coverage: "250 m × 250 m pixel (6.25 ha), 16-day composite",
      values: [
        { label: "NDVI", value: fmt(p.value, 2), swatch: { kind: "ndvi", value: p.value } },
        { label: "Share of pixel inside the field", value: `${fmt(p.insideShare * 100)} %` },
      ],
      note: p.insideShare < 0.6
        ? "Less than 60% of this pixel lies inside the field, so its value is mixed with neighbouring land."
        : "Most of this pixel lies inside the field, so it is a reasonable description of the canopy here.",
    };
  }

  if (selection.type === "smap") {
    return {
      title: "SMAP grid cell", type: "Surface soil moisture", position: field.center, source: "satellite", sourceName: "NASA SMAP",
      date: summary.lastSmap?.date ?? null, coverage: `~9 km × 9 km cell (about ${fmt(SMAP_CELL_HA)} ha)`,
      values: [
        { label: "Surface soil moisture", value: summary.lastSmap ? `${fmt(summary.lastSmap.smapVwc, 1)} %` : "Unavailable" },
        { label: "Station, same day", value: `${fmt(latest.surfaceVwc, 1)} %` },
      ],
      note: `The field is ${fmt(field.areaHa, 1)} ha, about ${fmt((field.areaHa / SMAP_CELL_HA) * 100, 1)}% of this cell. The value describes the wider landscape, not this field. The cell outline is indicative.`,
    };
  }

  return {
    title: field.name, type: "Field", position: field.center, source: null, sourceName: "Field record", date: null, coverage: `${fmt(field.areaHa, 1)} ha inside the boundary`,
    values: [
      { label: "Current crop", value: `${summary.crop.name}, day ${summary.dap}` },
      { label: "Soil texture", value: field.soil.texture },
      { label: "Open discoveries", value: String(discoveries.filter((d) => d.status !== "resolved").length) },
    ],
    note: "Select a marker or a satellite layer on the map to inspect an observation.",
  };
}

/** Observation dates are local calendar days at the field. */
export function formatWhen(date: string | null): string {
  return date ? longDate(date) : "Not dated";
}
