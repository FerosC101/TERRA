/**
 * Lossless compact encoding of a FieldDay record, so a real record can ship with the app (the full JSON for
 * Lipa is ~1.5 MB). Values are grouped into series by variable/source/depth; fields that are the same for the whole
 * series (product, provenance, unit, aggregation) are stored once, notes once in a table. decode(encode(x)) gives the
 * same days and values; only the order of values within a day follows the series order (the engine looks values up by
 * variable/source/depth, so order does not matter). compactRecord.test.ts checks this.
 */
import type { AnyObservationValue, FieldDay } from "@/types/discovery-contract";

type Row = [day: number, value: number | null, quality: AnyObservationValue["quality"], start: string, end: string, sampleCount: number | null, note: number];

interface CompactSeries {
  variable: AnyObservationValue["variable"];
  source: AnyObservationValue["source"];
  depthCm: number | null;
  product: string;
  provenance: AnyObservationValue["provenance"];
  unit: string;
  aggregation: AnyObservationValue["aggregation"];
  rows: Row[];
}

export interface CompactRecord {
  fieldId: string;
  dates: string[];
  notes: string[];
  series: CompactSeries[];
}

const key = (v: AnyObservationValue) => [v.variable, v.source, v.depthCm, v.product, v.provenance, v.unit, v.aggregation].join("|");

export function encodeRecord(days: FieldDay[]): CompactRecord {
  const notes: string[] = [""];
  const noteIndex = new Map<string, number>([["", 0]]);
  const series = new Map<string, CompactSeries>();
  days.forEach((d, i) => {
    if (d.fieldId !== days[0].fieldId) throw new Error("encodeRecord: one field per record");
    for (const v of d.values) {
      const k = key(v);
      if (!series.has(k)) {
        series.set(k, { variable: v.variable, source: v.source, depthCm: v.depthCm, product: v.product, provenance: v.provenance, unit: v.unit, aggregation: v.aggregation, rows: [] });
      }
      if (v.sensorId !== undefined) throw new Error("encodeRecord: sensorId is not supported");
      const note = v.qualityNote ?? "";
      if (!noteIndex.has(note)) { noteIndex.set(note, notes.length); notes.push(note); }
      series.get(k)!.rows.push([i, v.value, v.quality, v.period.start, v.period.end, v.sampleCount ?? null, noteIndex.get(note)!]);
    }
  });
  return { fieldId: days[0]?.fieldId ?? "", dates: days.map((d) => d.date), notes, series: [...series.values()] };
}

export function decodeRecord(c: CompactRecord): FieldDay[] {
  const days: FieldDay[] = c.dates.map((date) => ({ fieldId: c.fieldId, date, values: [] }));
  for (const s of c.series) {
    for (const [i, value, quality, start, end, sampleCount, note] of s.rows) {
      days[i].values.push({
        variable: s.variable, source: s.source, product: s.product, provenance: s.provenance, value, unit: s.unit,
        depthCm: s.depthCm, aggregation: s.aggregation, period: { start, end },
        ...(sampleCount !== null ? { sampleCount } : {}), quality,
        ...(c.notes[note] ? { qualityNote: c.notes[note] } : {}),
      } as AnyObservationValue);
    }
  }
  return days;
}
