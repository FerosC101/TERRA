/**
 * TERRA domain types. These mirror the JSON contract of the future FastAPI
 * backend — services return these shapes whether data is mocked or fetched.
 */

/** How a value came to exist. Every number in the UI carries one of these. */
export type Provenance = "measurement" | "satellite" | "model" | "simulated";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DataSource {
  id: string;
  name: string;
  product: string;
  variable: string;
  spatialResolution: string;
  temporalResolution: string;
  kind: Provenance;
  /**
   * "demo" = values are generated locally, not retrieved.
   * "snapshot" = a real record retrieved by the TERRA data pipeline is bundled for this field.
   * "live" = served by a connected backend.
   */
  integration: "demo" | "snapshot" | "live";
  /** What the status means for the selected field, in plain words */
  statusNote?: string;
  caveat: string;
}

export interface MonthlyClimate {
  /** Mean monthly rainfall, mm (Jan..Dec) */
  rainMm: number[];
  /** Mean reference evapotranspiration, mm/day */
  et0MmDay: number[];
  /** Mean daily maximum air temperature, °C */
  tmaxC: number[];
  source: string;
  /** "retrieved" = taken from a NASA product; "illustrative" = written for the demo */
  basis: "retrieved" | "illustrative";
}

export type CropId =
  | "corn"
  | "sorghum"
  | "mungbean"
  | "peanut"
  | "soybean"
  | "sweetpotato"
  | "squash"
  | "sunnhemp"
  | "fallow";

export interface Crop {
  id: CropId;
  name: string;
  family: string;
  familyCommon: string;
  /** FAO-56 single crop coefficients */
  kc: { ini: number; mid: number; end: number };
  /** Stage lengths in days: initial, development, mid-season, late */
  stages: [number, number, number, number];
  /** FAO-56 depletion fraction p: share of soil water usable before stress */
  depletionP: number;
  /** Indicative daily-max temperature above which mid-season heat stress is likely */
  heatThresholdC: number | null;
  legume: boolean;
  nutrientRole: "nitrogen-fixer" | "heavy-feeder" | "moderate-feeder" | "none";
  /** True for a living crop that covers the soil */
  cover: boolean;
  note: string;
  basis: string;
}

export interface FieldStation {
  id: string;
  name: string;
  position: LatLng;
  /** "simulated" = no physical station is connected in this build */
  status: "simulated" | "online" | "offline";
  sensors: string[];
}

export interface ObservationPoint {
  id: string;
  kind: "moisture" | "anomaly";
  label: string;
  position: LatLng;
  /** Offset applied to station surface moisture to derive this point's reading */
  moistureOffset?: number;
  discoveryKind?: DiscoveryKind;
}

export interface RotationRecord {
  season: string;
  crop: CropId;
  note?: string;
}

export interface Field {
  id: string;
  name: string;
  farm: string;
  location: string;
  /** "primary" = the demonstration field shared with the data pipeline and hardware */
  role: "primary" | "secondary";
  /** IANA time zone of the field. Observation dates are local calendar days. */
  timezone: string;
  /** location_id of this field in the TERRA NASA data pipeline, when it has one */
  pipelineLocationId?: string;
  center: LatLng;
  boundary: LatLng[];
  areaHa: number;
  currentCrop: CropId;
  plantedOn: string;
  /** The crop grown before the current one, if it falls inside the observation record */
  previousCrop?: { crop: CropId; plantedOn: string };
  /** `source` "soilgrids": ISRIC SoilGrids model estimate; absent: entered from a field record / typical for the texture. */
  soil: { texture: string; awcMmPerM: number; profileDepthM: number; note: string; source?: "soilgrids" };
  station: FieldStation;
  points: ObservationPoint[];
  rotationHistory: RotationRecord[];
  climate: MonthlyClimate;
  /** Demo-only: shapes the generated record so each field tells a different story */
  demoPattern: "dry-spell" | "wet-spell" | "steady";
  seed: number;
}

export interface DailyObservation {
  date: string;
  /** Station rain gauge, mm */
  rainMm: number;
  /** GPM IMERG-style gridded estimate, mm */
  rainImergMm: number;
  et0Mm: number;
  etcMm: number;
  tmaxC: number;
  soilTempC: number;
  /** Volumetric water content at 10 cm, % */
  surfaceVwc: number;
  /** Volumetric water content at 40 cm, % */
  deepVwc: number;
  /** SMAP-style surface soil moisture, %, on overpass days only */
  smapVwc: number | null;
  /** MODIS-style 16-day NDVI composite, on composite dates only */
  ndvi: number | null;
  /** ECOSTRESS-style land surface temperature, °C, on acquisition days only */
  lstC: number | null;
  /** Bulk electrical conductivity, dS/m */
  ecDsM: number;
  /** Modelled root-zone water storage, mm */
  storageMm: number;
}

/** One day of a field's REAL record, for evidence charts (lib/adapters/realSeries.ts). null = no value that day. */
export interface RealSeriesRow {
  date: string;
  /** NASA POWER rain (model, ~50 km), mm */
  rainPowerMm: number | null;
  /** GPM IMERG Final rain (satellite, ~10 km), mm */
  rainImergMm: number | null;
  /** SMAP L4 surface 0–5 cm and root zone 0–100 cm (model, 9 km), % */
  smapL4SurfacePct: number | null;
  smapL4RootPct: number | null;
  /** SMAP L3 surface retrieval (satellite, 9 km), %, overpass days only */
  smapL3Pct: number | null;
  /** MODIS NDVI composite (satellite, 250 m), on composite days only */
  ndvi: number | null;
}

/** A physically impossible value, an extreme but valid event, or a structural problem in a record. */
export interface QualityIssue {
  date: string;
  variable: string;
  value: number | null;
  kind: "invalid" | "extreme" | "duplicate" | "gap";
  note: string;
}

/** Result of auditing an observation record before it reaches any page. */
export interface QualityReport {
  rows: number;
  start: string | null;
  end: string | null;
  duplicatesRemoved: number;
  /** Rows dropped because a station value was physically impossible */
  rowsRejected: number;
  /** Calendar days with no row between start and end */
  missingDays: number;
  issues: QualityIssue[];
}

/** One day of the record retrieved by the TERRA NASA data pipeline. Missing values stay null. */
export interface NasaDailyRecord {
  date: string;
  quality: "VALID" | "VALID_WITH_WARNINGS" | "INCOMPLETE" | "INVALID";
  airTempC: number | null;
  airTempMaxC: number | null;
  airTempMinC: number | null;
  /** NASA POWER corrected precipitation, mm/day */
  rainPowerMm: number | null;
  /** GPM IMERG Final daily precipitation, mm/day */
  rainImergMm: number | null;
  /** FAO-56 Penman-Monteith reference evapotranspiration from POWER inputs, mm/day */
  et0Mm: number | null;
  /** SMAP surface soil moisture, % volumetric. Null on days with no overpass. */
  smapVwc: number | null;
  smapFlag: string | null;
}

export interface NasaSnapshot {
  fieldId: string;
  locationId: string;
  start: string;
  end: string;
  note: string;
  records: NasaDailyRecord[];
}

export interface MonthlyAnomaly {
  month: string;
  rainAnomalyPct: number;
  tempAnomalyC: number;
}

export type DiscoveryKind = "moisture-divergence" | "rain-departure" | "ndvi-change" | "sensor-offset";
export type DiscoveryStatus = "new" | "investigating" | "resolved";
export type StageKey = "observed" | "anomaly" | "investigation" | "new-data" | "model-updated";

export interface Evidence {
  label: string;
  value: string;
  source: string;
  provenance: Provenance;
  date: string;
}

export interface InvestigationStage {
  key: StageKey;
  label: string;
  state: "done" | "active" | "pending";
  date?: string;
  detail: string;
}

export interface Discovery {
  id: string;
  fieldId: string;
  kind: DiscoveryKind;
  title: string;
  category: "Water" | "Vegetation" | "Climate" | "Data quality";
  summary: string;
  detectedOn: string;
  status: DiscoveryStatus;
  /** 0..1 — how strongly the available evidence supports that the pattern is real */
  confidence: number;
  confidenceNote: string;
  observations: Evidence[];
  interpretation: string;
  alternatives: string[];
  confirmed: string[];
  /** The check ranked first by lib/science/nextObservation.ts, and the answers a person can report. */
  nextObservation: { action: string; rationale: string; checkId?: string; answers?: string[] };
  comparison: { label: string; current: number; baseline: number; unit: string; zScore: number | null };
  stages: InvestigationStage[];
  location: LatLng;
  risk?: string;
}

/** What a person logged after a discovery: soil-moisture readings (%), or the answer to a field check. */
export interface FollowUp {
  discoveryId: string;
  date: string;
  checkId?: string;
  surfaceVwc?: number;
  deepVwc?: number;
  answer?: string;
}

export interface Relationship {
  from: DimensionKey;
  to: DimensionKey;
  label: string;
  r: number;
  n: number;
  note: string;
}

export type DimensionKey = "water" | "soil" | "vegetation" | "climate" | "rotation";

export interface FieldModel {
  fieldId: string;
  asOf: string;
  observations: DailyObservation[];
  anomalies: MonthlyAnomaly[];
  relationships: Relationship[];
  summaries: Record<DimensionKey, string>;
}

export interface RotationPlan {
  id: string;
  name: string;
  crops: CropId[];
  /** Stable palette slot so a plan keeps its colour when others are removed */
  colorSlot: number;
  compare: boolean;
}

export interface RotationSettings {
  seasonsPerYear: 2 | 3;
  /** 0 = January */
  startMonth: number;
}

export interface Priorities {
  water: number;
  diversity: number;
  cover: number;
  climate: number;
  nutrients: number;
}

export interface Scenario {
  id: string;
  name: string;
  /** Fractional change in rainfall, e.g. -0.25 */
  rainChange: number;
  /** Change in air temperature, °C */
  tempChangeC: number;
  description: string;
}

export interface StepPoint {
  step: number;
  label: string;
  storageMm: number;
  rainMm: number;
  etcMm: number;
  etaMm: number;
}

export interface SeasonResult {
  index: number;
  cropId: CropId;
  windowLabel: string;
  durationDays: number;
  windowDays: number;
  overrun: boolean;
  demandMm: number;
  rainMm: number;
  metMm: number;
  deficitMm: number;
  runoffMm: number;
  drainageMm: number;
  heatShare: number;
  coveredDays: number;
}

export interface RotationIndicators {
  demandMm: number;
  rainMm: number;
  metMm: number;
  deficitMm: number;
  excessMm: number;
  /** Share of crop water demand met by rain plus stored soil water */
  waterMetShare: number;
  /** Distinct crop families / cropped seasons */
  diversityShare: number;
  distinctFamilies: number;
  sameFamilyRepeats: number;
  /** Share of the rotation period with a living crop canopy */
  coverShare: number;
  legumeSeasons: number;
  heavyFeederRepeats: number;
  nutrientIndex: number;
  /** Mean share of mid-season above the crop's heat threshold */
  heatShare: number;
  /** Share of demand unmet */
  waterStressShare: number;
  climateExposure: number;
}

export interface RotationEvaluation {
  planId: string;
  scenarioId: string;
  seasons: SeasonResult[];
  indicators: RotationIndicators;
  timeline: StepPoint[];
  /** Transparent weighted summary of normalised indicators — not a validated score */
  priorityMatch: number;
  notes: string[];
}

export interface EvaluateRequest {
  fieldId: string;
  plans: RotationPlan[];
  settings: RotationSettings;
  priorities: Priorities;
  scenario: Scenario;
}

export interface FieldReport {
  id: string;
  generatedOn: string;
  field: Field;
  latest: DailyObservation;
  observations: DailyObservation[];
  discoveries: Discovery[];
  anomalies: MonthlyAnomaly[];
  sources: DataSource[];
  quality: QualityReport;
}
