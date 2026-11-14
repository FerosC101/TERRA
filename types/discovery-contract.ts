/**
 * Discovery Engine data contract — PROPOSED, see docs/ai-ml/DECISIONS.md D-002.
 * Not yet agreed by the team. Used by lib/science/discovery and lib/demo/syntheticFieldDays.ts.
 *
 * Input:  one `FieldDay` per field per local calendar day. Each value carries its
 *         variable, source, product, provenance, depth, period and quality, in a
 *         single canonical unit per variable.
 * Output: `AnomalyRecord`, numbers only. The UI's `Discovery` (types/index.ts) is
 *         the human-readable layer built from one or more of these.
 *
 * Field sensors, manual readings and the NASA pipeline (branch
 * `feat/nasa-data-pipeline`) each reach these shapes through an adapter.
 */
import type { DiscoveryKind, LatLng, Provenance } from "./index";

/**
 * Canonical unit of each variable. Values are stored in these units only;
 * display code converts (e.g. m³/m³ → %).
 */
export interface VariableUnits {
  /** Volumetric soil water content. The pipeline uses m³/m³; the demo series uses % (×100). */
  soil_moisture: "m3/m3";
  soil_temperature: "degC";
  /** Bulk electrical conductivity. Varies with moisture and temperature; not a nutrient reading. */
  bulk_ec: "dS/m";
  /** Accumulated precipitation over the value's period. */
  precipitation: "mm/day";
  air_temperature_max: "degC";
  /** FAO-56 grass reference evapotranspiration. */
  et0: "mm/day";
  ndvi: "dimensionless";
  /** Not provided by the NASA pipeline yet (ECOSTRESS is not collected). */
  land_surface_temperature: "degC";
}

export type Variable = keyof VariableUnits;

/** Canonical units, plus "mm" for totals over a multi-day window. */
export type Unit = VariableUnits[Variable] | "mm";

/** Matches the ids in data/sources.ts, plus `manual` for readings a person logs (follow-ups). */
export type SourceId = "station" | "manual" | "smap" | "imerg" | "modis" | "ecostress" | "power";

/**
 * How the value summarises raw data: a daily mean, total or maximum of samples
 * (e.g. daily max air temperature), a single satellite overpass, or a multi-day
 * composite (MODIS 16-day NDVI).
 */
export type Aggregation = "mean" | "total" | "max" | "instant" | "composite";

export type ValueQuality = "ok" | "warning" | "invalid" | "missing";

export interface ObservationValue<V extends Variable> {
  variable: V;
  source: SourceId;
  /** Product id and version (e.g. "GPM_3IMERGDF 07B"), or sensor model for station values. */
  product: string;
  /**
   * Set per value, not per source: one source can yield both kinds
   * (e.g. a satellite retrieval and a model-assimilated product from the same mission).
   */
  provenance: Provenance;
  /** null when quality is "invalid" or "missing". */
  value: number | null;
  unit: VariableUnits[V];
  /** Sensor depth below the surface, cm. null when the product defines its own layer (see data/sources.ts). */
  depthCm: number | null;
  /** Physical sensor id, for station and manual readings. */
  sensorId?: string;
  aggregation: Aggregation;
  /** Period the value represents, UTC ISO-8601 ending in "Z". start === end for an instantaneous overpass. */
  period: { start: string; end: string };
  /** Number of raw samples aggregated, when known. */
  sampleCount?: number;
  quality: ValueQuality;
  qualityNote?: string;
}

/** Any one value, with its unit tied to its variable. */
export type AnyObservationValue = { [V in Variable]: ObservationValue<V> }[Variable];

/**
 * Discovery Engine input: everything known about one field on one local calendar day.
 * Which day a value belongs to:
 * - period of 24 h or less: the local day containing the period's midpoint
 *   (a UTC-day product lands on the local day it overlaps most: 16 of 24 h at UTC+8);
 * - longer period (composite): the local day containing the period's end, so a value
 *   never appears before all of its data exists (no look-ahead).
 * A record is one field's FieldDays for consecutive dates, with at most one value
 * per variable/source/depth per day: adapters aggregate several sensors first.
 * Example: docs/contracts/discovery-contract.mock.json
 */
export interface FieldDay {
  fieldId: string;
  /** Local calendar date, YYYY-MM-DD, in the field's time zone (see FieldLocation). */
  date: string;
  values: AnyObservationValue[];
}

/** Links an app field to the time zone that defines its day and to the NASA pipeline's location id. */
export interface FieldLocation {
  fieldId: string;
  /** IANA time zone, e.g. "Asia/Manila". */
  timeZone: string;
  /** `location_id` in the NASA pipeline, when the field is covered by it. */
  pipelineLocationId?: string;
}

/** One measured departure that triggered a detector. */
export interface AnomalySignal {
  variable: Variable;
  source: SourceId;
  depthCm: number | null;
  /** How the window was summarised. */
  statistic: "total" | "mean" | "change" | "difference";
  observed: number;
  baseline: number;
  /** "rule": a fixed value set by the detector's rule (e.g. "NDVI should not fall"), not taken from data. */
  baselineKind: "own-history" | "climatology" | "other-source" | "rule";
  /** Set when baselineKind is "other-source" (e.g. station vs SMAP). */
  baselineSource?: SourceId;
  unit: Unit;
  zScore: number | null;
  /** The detector's rule as written in code, e.g. "change <= -0.05". */
  rule: string;
}

/** Discovery Engine output: one detection, numbers only. */
export interface AnomalyRecord {
  /** Unique per detection: `${fieldId}:${detector}:${window.end}`. */
  id: string;
  fieldId: string;
  detector: DiscoveryKind;
  detectorVersion: string;
  /** When the detector ran, UTC ISO-8601. */
  detectedAt: string;
  /** Local dates of the first and last FieldDay examined. */
  window: { start: string; end: string };
  signals: AnomalySignal[];
  /** Data coverage for each input the detector used. */
  coverage: { variable: Variable; source: SourceId; daysWithData: number; daysInWindow: number }[];
  location: LatLng;
  /** Spatial scale the evidence describes: one sensor, the whole field, or a satellite/reanalysis grid cell. */
  spatialSupport: "point" | "field" | "grid-cell";
  /** 0..1 */
  confidence: number;
  /** "heuristic" until confidence is calibrated against labelled outcomes. */
  confidenceBasis: "heuristic" | "calibrated";
}
