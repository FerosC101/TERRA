import { generateAnomalies, generateSeries } from "@/lib/demo/series";
import { detectDiscoveries } from "@/lib/science/detect";
import { pearson } from "@/lib/science/stats";
import { CROPS } from "@/data/crops";
import { fmt } from "@/lib/format";
import type { Discovery, FieldModel, FollowUp, Relationship } from "@/types";
import { request } from "./apiClient";
import { mockField } from "./fieldSensorService";

/** GET /api/fields/{id}/discoveries */
export function getDiscoveries(fieldId: string, followUps: FollowUp[] = []): Promise<Discovery[]> {
  return request(`/api/fields/${fieldId}/discoveries`, () => {
    const field = mockField(fieldId);
    return detectDiscoveries(field, generateSeries(field), followUps);
  });
}

export function mockFieldModel(fieldId: string): FieldModel {
  const field = mockField(fieldId);
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
  const cap = field.soil.awcMmPerM * field.soil.profileDepthM;
  const families = new Set(field.rotationHistory.map((r) => CROPS[r.crop].family));

  return {
    fieldId,
    asOf: latest.date,
    observations: obs,
    anomalies: generateAnomalies(field),
    relationships,
    summaries: {
      water: `Surface moisture is ${fmt(latest.surfaceVwc, 1)}% and moisture at 40 cm is ${fmt(latest.deepVwc, 1)}%. The model estimates ${fmt(latest.storageMm, 0)} mm of plant-available water in the root zone, of a possible ${fmt(cap, 0)} mm.`,
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
