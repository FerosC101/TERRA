import { generateAnomalies, generateSeries } from "@/lib/demo/series";
import { seriesToFieldDays } from "@/lib/adapters/demoSeries";
import { withSimulatedStation } from "@/lib/adapters/simulatedStation";
import { DEMO_TODAY, longDate } from "@/lib/dates";
import { toDiscovery, type CardInputs } from "@/lib/science/discovery/cards";
import { runDiscovery, seriesOf, type DiscoveryContext } from "@/lib/science/discovery/engine";
import { pearson } from "@/lib/science/stats";
import { CROPS } from "@/data/crops";
import { REAL_FIELD_MODEL, REAL_FIELD_SETTINGS } from "@/data/lipaModelConfig";
import { realRecord } from "@/data/nasa/realRecords";
import { SIMULATED_DISCOVERY_INPUTS } from "@/data/simulatedInputs";
import { fmt } from "@/lib/format";
import type { DailyObservation, Discovery, Field, FieldModel, FollowUp, Relationship } from "@/types";
import type { FieldDay } from "@/types/discovery-contract";
import { request } from "./apiClient";
import { livingFieldModel } from "./fieldModelService";
import { mockField } from "./fieldSensorService";
import { fieldAnomalies, fieldObservations } from "./observationSource";

/**
 * The Discovery Engine's context for a field. A field with a real record (data/nasa/realRecords.ts) runs on it with its
 * calibrated settings (data/lipaModelConfig.ts) and is "run" on the record's last day; a demo field on DEMO_TODAY.
 */
export function discoveryContext(field: Field, days: FieldDay[], real: boolean): DiscoveryContext {
  return {
    fieldId: field.id,
    location: real ? field.center : field.station.position,
    monthlyRainMm: field.climate.rainMm,
    crop: CROPS[field.currentCrop],
    plantedOn: field.plantedOn,
    runAt: `${real ? days[days.length - 1].date : DEMO_TODAY}T00:00:00Z`,
    ...(real ? REAL_FIELD_SETTINGS[field.id] : {}),
  };
}

/** What the Discovery Engine runs on for a field, and which of its inputs are simulated or assumed. */
export interface DiscoveryInput {
  days: FieldDay[];
  ctx: DiscoveryContext;
  real: boolean;
  inputs: CardInputs;
}

/**
 * The Discovery Engine's input for a field. A real record gains the SIMULATED / ASSUMED inputs of
 * data/simulatedInputs.ts (D-020): the planned station's simulated probe readings, and an assumed crop calendar where
 * the field has none. These are for the engine only; the Living Field Model reads realRecord() without them.
 */
export function discoveryInput(field: Field, obs: DailyObservation[]): DiscoveryInput {
  const real = realRecord(field.id);
  if (!real) {
    const days = seriesToFieldDays(obs, field);
    return { days, ctx: discoveryContext(field, days, false), real: false, inputs: {} };
  }
  const sim = SIMULATED_DISCOVERY_INPUTS[field.id];
  const days = sim?.station ? withSimulatedStation(real, fieldObservations(field)) : real;
  const ctx = discoveryContext(field, days, true);
  const assumed = sim?.assumedSeasons && !ctx.seasons ? sim.assumedSeasons : undefined;
  if (assumed) ctx.seasons = assumed.seasons;
  return {
    days, ctx, real: true,
    inputs: { simulatedStation: !!sim?.station, seasons: ctx.seasons, assumedSeasonsBasis: assumed?.basis },
  };
}

/**
 * Runs the Discovery Engine on a field's record and words its alarms as cards, newest first.
 * A real record lists every onset. A demo record lists only the latest alarm of each detector: its moisture rule fires
 * every ~15 days (F-002), which would flood the page.
 */
export function discoveriesFor(field: Field, obs: DailyObservation[], followUps: FollowUp[] = []): Discovery[] {
  const { days, ctx, real, inputs } = discoveryInput(field, obs);
  const records = runDiscovery(days, ctx);
  const shown = real ? records : [...new Map(records.map((r) => [r.detector, r])).values()];
  return [...shown]
    .sort((a, b) => b.window.end.localeCompare(a.window.end))
    .map((r) => toDiscovery(r, days, field, followUps, inputs));
}

/** GET /api/fields/{id}/discoveries */
export function getDiscoveries(fieldId: string, followUps: FollowUp[] = []): Promise<Discovery[]> {
  return request(`/api/fields/${fieldId}/discoveries`, () => {
    const field = mockField(fieldId);
    return discoveriesFor(field, fieldObservations(field), followUps);
  });
}

/**
 * Field model view for a field with a real record. Relationships use REAL series only (the planned station's readings
 * are simulated, so pairs built on them would show the simulation's own equations); summaries name their sources.
 */
function realFieldModel(field: Field, days: FieldDay[]): FieldModel {
  const obs = fieldObservations(field);
  const latest = obs[obs.length - 1];
  const l4s = seriesOf(days, "soil_moisture", "smap_l4", 5);
  const l4r = seriesOf(days, "soil_moisture", "smap_l4", 100);
  const ndviSource = REAL_FIELD_SETTINGS[field.id]?.ndviSource ?? "modis";
  const ndviName = ndviSource === "hls" ? "HLS 30 m" : "MODIS 250 m";

  const rain3: number[] = [];
  const dL4: number[] = [];
  for (let i = 3; i < obs.length; i++) {
    if (l4s[i] === null || l4s[i - 3] === null) continue;
    rain3.push(obs[i].rainMm + obs[i - 1].rainMm + obs[i - 2].rainMm);
    dL4.push(((l4s[i] as number) - (l4s[i - 3] as number)) * 100);
  }
  const ndviRows = obs.map((o, i) => ({ o, i })).filter((r) => r.o.ndvi !== null && r.i >= 16);
  const rootBefore = ndviRows.map((r) => {
    const w = l4r.slice(r.i - 16, r.i).filter((v): v is number => v !== null);
    return w.length ? (w.reduce((a, v) => a + v, 0) / w.length) * 100 : NaN;
  });
  const keep = rootBefore.map((v) => Number.isFinite(v));
  const ndviVals = ndviRows.map((r) => r.o.ndvi as number).filter((_, k) => keep[k]);
  const rootVals = rootBefore.filter((_, k) => keep[k]);
  const kcRows = obs.filter((o) => o.ndvi !== null && o.et0Mm > 0);

  const candidates: Relationship[] = [
    { from: "climate", to: "water", label: "Rainfall → topsoil moisture (SMAP L4)", r: pearson(rain3, dL4), n: rain3.length,
      note: "3-day rainfall (IMERG, POWER on missing days) against the 3-day change in SMAP L4 topsoil moisture (model, ~9 km)." },
    { from: "water", to: "vegetation", label: "Root-zone moisture → vegetation index", r: pearson(rootVals, ndviVals), n: ndviVals.length,
      note: `Mean SMAP L4 root-zone moisture over the 16 days before each ${ndviName} NDVI value. Few points — treat as weak evidence.` },
    { from: "rotation", to: "vegetation", label: "Crop calendar → vegetation index", r: pearson(kcRows.map((o) => o.etcMm / o.et0Mm), kcRows.map((o) => o.ndvi as number)), n: kcRows.length,
      note: "Crop coefficient from the crop calendar against NDVI: the canopy should follow the crop calendar." },
  ];
  // The crop-calendar pair needs a REAL calendar (Plot A's farmer seasons); a placeholder planting date says nothing.
  // A pair with too few points or no variation on one side is left out too.
  const hasSeasons = !!REAL_FIELD_MODEL[field.id]?.seasons;
  const relationships = candidates.filter((c) => (c.from !== "rotation" || hasSeasons) && c.n >= 3 && Number.isFinite(c.r) && c.r !== 0);

  const lastNdvi = [...obs].reverse().find((o) => o.ndvi !== null);
  const rain30 = obs.slice(-30).reduce((a, o) => a + o.rainMm, 0);
  const now = livingFieldModel(field, obs).at(-1)!.water;
  const families = new Set(field.rotationHistory.map((r) => CROPS[r.crop].family));
  const cropNow = field.fallow
    ? `Fallow since ${longDate(field.fallow.since)}; next planting ${field.fallow.next} (planned).`
    : `${CROPS[field.currentCrop].name} is the current crop.`;
  const lastL4s = l4s[l4s.length - 1];
  const lastL4r = l4r[l4r.length - 1];

  return {
    fieldId: field.id,
    asOf: latest.date,
    observations: obs,
    anomalies: fieldAnomalies(field),
    relationships,
    summaries: {
      water: `On ${longDate(latest.date)}, the field model estimates ${fmt(now.tawMm - now.depletionMm, 0)} mm of plant-available water in the root zone, of a possible ${fmt(now.tawMm, 0)} mm, from real NASA weather.` +
        (lastL4s !== null && lastL4r !== null ? ` SMAP L4 (model, ~9 km): topsoil ${fmt(lastL4s * 100, 1)}%, root zone ${fmt(lastL4r * 100, 1)}%.` : "") +
        " No soil sensor is installed: the 10 cm and 40 cm readings shown are simulated from the planned station's design.",
      soil: `${field.soil.texture} (SoilGrids estimate, not a laboratory test). No soil sensor is installed: soil temperature and EC shown are simulated from the planned station's design.`,
      vegetation: (lastNdvi ? `The latest ${ndviName} NDVI is ${fmt(lastNdvi.ndvi, 2)}, on ${longDate(lastNdvi.date)}. ` : `No ${ndviName} NDVI value is available yet. `) + cropNow,
      climate: `${fmt(rain30, 0)} mm of rain fell in the 30 days to ${longDate(latest.date)} (IMERG, NASA POWER on missing days). That day's maximum air temperature was ${fmt(latest.tmaxC, 1)} °C (NASA POWER).`,
      rotation: `${field.rotationHistory.length} seasons on record across ${families.size} crop ${families.size === 1 ? "family" : "families"}. ${cropNow}`,
    },
  };
}

export function mockFieldModel(fieldId: string): FieldModel {
  const field = mockField(fieldId);
  const real = realRecord(field.id);
  if (real) return realFieldModel(field, real);
  const obs = generateSeries(field);
  const latest = obs[obs.length - 1];

  // Relationships found in this record. Correlation in a short record is a prompt
  // for investigation, never proof of cause.
  const rain3: number[] = [];
  const dSurf: number[] = [];
  for (let i = 3; i < obs.length; i++) {
    rain3.push(obs[i].rainMm + obs[i - 1].rainMm + obs[i - 2].rainMm);
    dSurf.push(obs[i].surfaceVwc - obs[i - 3].surfaceVwc);
  }
  const ndviRows = obs.map((o, i) => ({ o, i })).filter((r) => r.o.ndvi !== null && r.i >= 16);
  const ndviVals = ndviRows.map((r) => r.o.ndvi as number);
  const moistBefore = ndviRows.map((r) => obs.slice(r.i - 16, r.i).reduce((a, o) => a + o.deepVwc, 0) / 16);

  const relationships: Relationship[] = [
    { from: "climate", to: "water", label: "Rainfall → surface moisture", r: pearson(rain3, dSurf), n: rain3.length,
      note: "3-day rainfall against the 3-day change in 10 cm moisture." },
    { from: "climate", to: "soil", label: "Air temperature → soil temperature", r: pearson(obs.map((o) => o.tmaxC), obs.map((o) => o.soilTempC)), n: obs.length,
      note: "Daily maximum air temperature against soil temperature at 10 cm." },
    { from: "water", to: "soil", label: "Soil moisture → bulk EC", r: pearson(obs.map((o) => o.surfaceVwc), obs.map((o) => o.ecDsM)), n: obs.length,
      note: "Bulk EC rises when soil is wetter. This is why EC alone cannot be read as salinity or fertility." },
    { from: "water", to: "vegetation", label: "Deeper moisture → vegetation index", r: pearson(moistBefore, ndviVals), n: ndviVals.length,
      note: "Mean 40 cm moisture over the 16 days before each NDVI composite. Few points — treat as weak evidence." },
    { from: "rotation", to: "vegetation", label: "Crop calendar → vegetation index", r: pearson(obs.filter((o) => o.ndvi !== null).map((o) => o.etcMm / Math.max(o.et0Mm, 0.1)), obs.filter((o) => o.ndvi !== null).map((o) => o.ndvi as number)), n: ndviVals.length + 1,
      note: "Crop coefficient for the planted crop against NDVI: the canopy follows the crop calendar." },
  ];

  const lastNdvi = [...obs].reverse().find((o) => o.ndvi !== null);
  const rain30 = obs.slice(-30).reduce((a, o) => a + o.rainMm, 0);
  const now = livingFieldModel(field, obs).at(-1)!.water;
  const families = new Set(field.rotationHistory.map((r) => CROPS[r.crop].family));

  return {
    fieldId,
    asOf: latest.date,
    observations: obs,
    anomalies: generateAnomalies(field),
    relationships,
    summaries: {
      water: `Surface moisture is ${fmt(latest.surfaceVwc, 1)}% and moisture at 40 cm is ${fmt(latest.deepVwc, 1)}%. The field model estimates ${fmt(now.tawMm - now.depletionMm, 0)} mm of plant-available water in the root zone, of a possible ${fmt(now.tawMm, 0)} mm.`,
      soil: `${field.soil.texture}. Soil temperature at 10 cm is ${fmt(latest.soilTempC, 1)} °C and bulk EC is ${fmt(latest.ecDsM, 2)} dS/m. These describe current physical conditions at one point, not soil fertility.`,
      vegetation: lastNdvi ? `The latest 16-day NDVI composite is ${fmt(lastNdvi.ndvi, 2)}, for the period ending ${lastNdvi.date}. ${CROPS[field.currentCrop].name} is the current crop.` : "No vegetation composite is available yet.",
      climate: `${fmt(rain30, 0)} mm of rain fell in the last 30 days. Today's maximum air temperature was ${fmt(latest.tmaxC, 1)} °C.`,
      rotation: `${field.rotationHistory.length} seasons on record across ${families.size} crop ${families.size === 1 ? "family" : "families"}. Current crop: ${CROPS[field.currentCrop].name}.`,
    },
  };
}

/** GET /api/fields/{id}/model */
export function getFieldModel(fieldId: string): Promise<FieldModel> {
  return request(`/api/fields/${fieldId}/model`, () => mockFieldModel(fieldId));
}
