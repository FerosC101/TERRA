"use client";

import clsx from "clsx";
import { ArrowRight, CloudSun, Droplets, Layers3, Leaf, Repeat } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { Disclosure, Eyebrow, Loading, PageHeader, Panel, ProvenanceTag, Segmented } from "@/components/ui";
import { CROPS, kcOnDay, stageOnDay } from "@/data/crops";
import { SERIES } from "@/lib/chartTheme";
import { daysBetween, longDate, shortDate } from "@/lib/dates";
import { fmt, signed } from "@/lib/format";
import { sum } from "@/lib/science/stats";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getFieldModel } from "@/services/discoveryService";
import type { DimensionKey, FieldModel, Provenance, Relationship } from "@/types";

const DIMENSIONS: { key: DimensionKey; label: string; icon: typeof Droplets; angle: number }[] = [
  { key: "water", label: "Water Memory", icon: Droplets, angle: -90 },
  { key: "soil", label: "Soil Memory", icon: Layers3, angle: -18 },
  { key: "vegetation", label: "Vegetation Memory", icon: Leaf, angle: 54 },
  { key: "rotation", label: "Rotation Memory", icon: Repeat, angle: 126 },
  { key: "climate", label: "Climate Memory", icon: CloudSun, angle: 198 },
];

const CX = 220;
const CY = 190;
const R = 128;
const pos = (angle: number) => ({ x: CX + R * Math.cos((angle * Math.PI) / 180), y: CY + R * Math.sin((angle * Math.PI) / 180) });

function strength(r: number) {
  const a = Math.abs(r);
  return a >= 0.6 ? "strong" : a >= 0.3 ? "moderate" : "weak";
}

/** The model as a connected structure: five memories, linked by relationships found in the record. */
function ModelCore({ active, onPick, relationships, values, asOf }: { active: DimensionKey; onPick: (k: DimensionKey) => void; relationships: Relationship[]; values: Record<DimensionKey, string>; asOf: string }) {
  return (
    <svg viewBox="0 0 440 380" className="mx-auto h-auto w-full max-w-[520px]" role="group" aria-label="Field model: five connected memories">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(57,211,83,0.14)" />
      <circle cx={CX} cy={CY} r={R - 46} fill="none" stroke="rgba(57,211,83,0.08)" strokeDasharray="2 6" />
      {relationships.map((rel) => {
        const a = pos(DIMENSIONS.find((d) => d.key === rel.from)!.angle);
        const b = pos(DIMENSIONS.find((d) => d.key === rel.to)!.angle);
        const on = rel.from === active || rel.to === active;
        return (
          <line key={rel.label} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={on ? "#39D353" : "rgba(139,148,144,0.35)"} strokeWidth={1 + Math.abs(rel.r) * 4} strokeLinecap="round"
            strokeDasharray={rel.r < 0 ? "5 6" : undefined} opacity={on ? 0.9 : 0.6}>
            <title>{`${rel.label}: r = ${rel.r.toFixed(2)} (${strength(rel.r)})`}</title>
          </line>
        );
      })}
      <text x={CX} y={CY - 6} textAnchor="middle" className="fill-muted font-display" fontSize="9" letterSpacing="2">MODEL STATE</text>
      <text x={CX} y={CY + 12} textAnchor="middle" className="fill-silver" fontSize="13" fontWeight="600">{shortDate(asOf)}</text>
      {DIMENSIONS.map((d) => {
        const p = pos(d.angle);
        const on = d.key === active;
        const Icon = d.icon;
        return (
          <g key={d.key} role="button" tabIndex={0} aria-pressed={on} aria-label={`${d.label}: ${values[d.key]}`} className="cursor-pointer outline-none"
            onClick={() => onPick(d.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(d.key); } }}>
            <circle cx={p.x} cy={p.y} r={on ? 37 : 33} fill="#0B1F14" stroke={on ? "#39D353" : "rgba(217,217,217,0.25)"} strokeWidth={on ? 2 : 1} />
            {on && <circle cx={p.x} cy={p.y} r={43} fill="none" stroke="rgba(57,211,83,0.3)" />}
            <Icon x={p.x - 8} y={p.y - 19} width={16} height={16} color={on ? "#39D353" : "#8B9490"} aria-hidden />
            <text x={p.x} y={p.y + 11} textAnchor="middle" fontSize="11.5" fontWeight="600" className="fill-silver tabular">{values[d.key]}</text>
            <text x={p.x} y={p.y + (d.angle > 0 && d.angle < 180 ? 58 : -47)} textAnchor="middle" fontSize="9" letterSpacing="1.5" className={clsx("font-display", on ? "fill-terra" : "fill-muted")}>
              {d.label.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SourceLine({ kind, text }: { kind: Provenance; text: string }) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5 text-xs text-muted"><ProvenanceTag kind={kind} /><span>{text}</span></li>
  );
}

function ChartBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 px-1 text-[13px] font-medium text-silver">{title}</div>
      {children}
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="tabular mt-1 text-lg font-semibold text-silver">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Body({ model }: { model: FieldModel }) {
  const { field, plans } = useApp();
  const obs = model.observations;
  const [dim, setDim] = useState<DimensionKey>("water");
  const [idx, setIdx] = useState(obs.length - 1);
  const [span, setSpan] = useState<60 | 120 | 240>(120);

  const at = obs[Math.min(idx, obs.length - 1)];
  const crop = CROPS[field.currentCrop];
  const dap = daysBetween(field.plantedOn, at.date);
  const upTo = useMemo(() => obs.slice(0, idx + 1), [obs, idx]);
  const ndviAt = [...upTo].reverse().find((o) => o.ndvi !== null);
  const last30 = upTo.slice(-30);
  const rain30 = sum(last30.map((o) => o.rainMm));
  const etc30 = sum(last30.map((o) => o.etcMm));
  const dStorage = last30.length ? at.storageMm - last30[0].storageMm : 0;
  const capacity = field.soil.awcMmPerM * field.soil.profileDepthM;
  const windowStart = Math.max(0, idx - span + 1);
  const view = obs.slice(windowStart, Math.min(obs.length, Math.max(idx + 1, windowStart + span)));
  const families = new Set(field.rotationHistory.map((r) => CROPS[r.crop].family));
  const isLatest = idx === obs.length - 1;

  const nodeValues: Record<DimensionKey, string> = {
    water: `${fmt(at.storageMm, 0)} mm`,
    soil: `${fmt(at.soilTempC, 1)} °C`,
    vegetation: ndviAt ? fmt(ndviAt.ndvi, 2) : "—",
    climate: `${fmt(rain30, 0)} mm`,
    rotation: `${families.size} fam.`,
  };

  const chart = { xKey: "date", xFormat: shortDate, markerX: at.date, markerLabel: isLatest ? undefined : shortDate(at.date) } as const;
  const related = model.relationships.filter((r) => r.from === dim || r.to === dim);
  const meta = DIMENSIONS.find((d) => d.key === dim)!;

  return (
    <div className="space-y-5">
      <Panel className="overflow-hidden">
        <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="border-b border-line p-4 xl:border-b-0 xl:border-r">
            <ModelCore active={dim} onPick={setDim} relationships={model.relationships} values={nodeValues} asOf={at.date} />
            <p className="px-2 text-center text-[11px] leading-relaxed text-muted">
              Line weight shows how strongly two memories move together in this record. Dashed lines are inverse relationships. Select a memory to open it.
            </p>
          </div>
          <div className="flex flex-col p-6">
            <Eyebrow className="!text-terra">{meta.label}</Eyebrow>
            <p className="mt-3 text-[15px] leading-relaxed text-silver/90">
              {isLatest ? model.summaries[dim] : `Model state as it stood on ${longDate(at.date)}. Move the timeline to the right to return to the present.`}
            </p>
            <div className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">Linked to</div>
              <ul className="mt-2 space-y-2.5">
                {related.map((r) => (
                  <li key={r.label} className="text-[13px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-silver">{r.label}</span>
                      <span className="tabular shrink-0 text-xs text-muted">r = {signed(r.r, 2)} · {strength(r.r)} · n = {r.n}</span>
                    </div>
                    <div className="text-xs leading-relaxed text-muted">{r.note}</div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">Correlations within one field&apos;s record suggest where to look. They do not establish cause.</p>
            </div>
          </div>
        </div>

        {/* Historical timeline */}
        <div className="border-t border-line bg-forest-deep/40 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label htmlFor="model-time" className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Historical timeline</label>
            <div className="flex items-center gap-3">
              <span className="tabular text-[13px] font-medium text-silver">{longDate(at.date)}</span>
              {!isLatest && <button type="button" onClick={() => setIdx(obs.length - 1)} className="text-xs font-medium text-terra-soft hover:text-terra">Jump to latest</button>}
            </div>
          </div>
          <input id="model-time" type="range" min={30} max={obs.length - 1} value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="mt-3 w-full"
            aria-valuetext={longDate(at.date)} />
          <div className="tabular mt-1 flex justify-between text-[11px] text-muted"><span>{shortDate(obs[30].date)}</span><span>{shortDate(obs[obs.length - 1].date)}</span></div>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Memory" value={dim} onChange={setDim} options={DIMENSIONS.map((d) => ({ value: d.key, label: d.label.replace(" Memory", "") }))} />
        {dim !== "rotation" && <Segmented label="Chart window" value={span} onChange={setSpan} options={[{ value: 60, label: "60 d" }, { value: 120, label: "120 d" }, { value: 240, label: "All" }]} />}
      </div>

      <Panel>
        <div className="p-5 sm:p-6">
          {dim === "water" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                <Fact label="Surface moisture" value={`${fmt(at.surfaceVwc, 1)}%`} sub="10 cm, station" />
                <Fact label="Deeper moisture" value={`${fmt(at.deepVwc, 1)}%`} sub="40 cm, station" />
                <Fact label="Water availability" value={`${fmt(at.storageMm, 0)} mm`} sub={`${fmt((at.storageMm / capacity) * 100)}% of ${fmt(capacity, 0)} mm capacity`} />
                <Fact label="30-day water balance" value={`${signed(dStorage, 0)} mm`} sub={`Rain ${fmt(rain30, 0)} − crop use ${fmt(etc30, 0)} mm, before losses`} />
              </div>
              <ChartBlock title="Soil moisture trends">
                <SeriesChart {...chart} data={view} unit="% vol." ariaLabel="Soil moisture at two depths" series={[
                  { key: "surfaceVwc", label: "Surface, 10 cm", color: SERIES.green }, { key: "deepVwc", label: "Deeper, 40 cm", color: SERIES.blue }]} />
              </ChartBlock>
              <div className="grid gap-6 lg:grid-cols-2">
                <ChartBlock title="Estimated root-zone water storage">
                  <SeriesChart {...chart} data={view} unit="mm" height={200} digits={0} ariaLabel="Modelled root-zone water storage" domain={[0, capacity]}
                    series={[{ key: "storageMm", label: "Storage", color: SERIES.violet, type: "area" }]} />
                </ChartBlock>
                <ChartBlock title="Rainfall history">
                  <SeriesChart {...chart} data={view} unit="mm/day" height={200} ariaLabel="Daily rainfall" series={[{ key: "rainMm", label: "Station gauge", color: SERIES.blue, type: "bar" }]} />
                </ChartBlock>
              </div>
              <ul className="divide-y divide-line border-t border-line pt-2">
                <SourceLine kind="measurement" text={`Soil moisture and rainfall: ${field.station.name}, observed ${longDate(at.date)}.`} />
                <SourceLine kind="model" text="Storage: soil-water balance S(t) = S(t−1) + P − ETc − R − D, with ETc = Kc × ET0. An estimate, not a measurement." />
              </ul>
            </div>
          )}

          {dim === "soil" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                <Fact label="Texture" value={field.soil.texture} sub="Field record" />
                <Fact label="Available water capacity" value={`${field.soil.awcMmPerM} mm/m`} sub="Typical for the texture class" />
                <Fact label="Soil temperature" value={`${fmt(at.soilTempC, 1)} °C`} sub="10 cm, station" />
                <Fact label="Bulk EC" value={`${fmt(at.ecDsM, 2)} dS/m`} sub="Electrical conductivity" />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <ChartBlock title="Soil temperature, 10 cm">
                  <SeriesChart {...chart} data={view} unit="°C" height={220} ariaLabel="Soil temperature" series={[{ key: "soilTempC", label: "Soil temperature", color: SERIES.green }]} />
                </ChartBlock>
                <ChartBlock title="Bulk electrical conductivity">
                  <SeriesChart {...chart} data={view} unit="dS/m" digits={2} height={220} ariaLabel="Bulk electrical conductivity" series={[{ key: "ecDsM", label: "Bulk EC", color: SERIES.amber }]} />
                </ChartBlock>
              </div>
              <div className="rounded-md border border-amber/25 bg-amber/5 p-4">
                <div className="text-[13px] font-semibold text-silver">What these sensors cannot tell you</div>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-silver/85">
                  <li>They do not measure soil organic matter, nutrient content (N, P, K) or long-term soil health. Those need laboratory soil tests.</li>
                  <li>Bulk EC rises and falls with soil moisture and temperature. A change in EC is not, by itself, a change in salinity or fertility.</li>
                  <li>All readings come from one point. Soil varies across a field.</li>
                </ul>
              </div>
              <ul className="divide-y divide-line border-t border-line pt-2">
                <SourceLine kind="measurement" text={`Temperature and EC: ${field.station.name}, observed ${longDate(at.date)}.`} />
                <SourceLine kind="model" text={field.soil.note} />
              </ul>
            </div>
          )}

          {dim === "vegetation" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                <Fact label="Vegetation index" value={ndviAt ? fmt(ndviAt.ndvi, 2) : "—"} sub={ndviAt ? `Composite ending ${shortDate(ndviAt.date)}` : "No composite yet"} />
                <Fact label="Crop" value={crop.name} sub={dap >= 0 ? `Day ${dap} after planting` : "Not yet planted"} />
                <Fact label="Growth stage" value={stageOnDay(crop, dap)} sub="From the crop calendar" />
                <Fact label="Crop coefficient" value={fmt(kcOnDay(crop, dap), 2)} sub="Kc, share of ET0 the crop uses" />
              </div>
              <ChartBlock title="Historical vegetation trend">
                <SeriesChart {...chart} data={obs.slice(0, Math.max(idx + 1, 120))} unit="NDVI" digits={2} domain={[0, 1]} ariaLabel="NDVI composites"
                  series={[{ key: "ndvi", label: "MODIS NDVI, 16-day", color: SERIES.green, sparse: true }]} />
              </ChartBlock>
              <p className="text-[13px] leading-relaxed text-muted">
                NDVI ranges from about 0.2 for bare soil to above 0.8 for a dense, healthy canopy. It tracks how green and full the canopy is. It does not measure yield, and it saturates once the canopy closes.
              </p>
              <ul className="divide-y divide-line border-t border-line pt-2">
                <SourceLine kind="satellite" text={`NDVI: MODIS MOD13Q1, 250 m, 16-day composite${ndviAt ? ` ending ${longDate(ndviAt.date)}` : ""}.`} />
                <SourceLine kind="model" text={`Growth stage and Kc: planting date ${longDate(field.plantedOn)} with FAO-56 style stage lengths.`} />
              </ul>
            </div>
          )}

          {dim === "climate" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                <Fact label="Rain, last 30 days" value={`${fmt(rain30, 0)} mm`} sub={`to ${shortDate(at.date)}`} />
                <Fact label="Air temperature" value={`${fmt(at.tmaxC, 1)} °C`} sub="Daily maximum" />
                <Fact label="Reference ET" value={`${fmt(at.et0Mm, 1)} mm/day`} sub="ET0, evaporative demand" />
                <Fact label="Latest month vs baseline" value={`${signed(model.anomalies[model.anomalies.length - 1].rainAnomalyPct, 0)}%`} sub="Rainfall departure" />
              </div>
              <ChartBlock title="Temperature trend">
                <SeriesChart {...chart} data={view} unit="°C" height={220} ariaLabel="Air and land surface temperature" series={[
                  { key: "tmaxC", label: "Air, daily max", color: SERIES.amber }, { key: "lstC", label: "Land surface (ECOSTRESS)", color: SERIES.violet, sparse: true, dashed: true }]} />
              </ChartBlock>
              <div className="grid gap-6 lg:grid-cols-2">
                <ChartBlock title="Precipitation anomaly, 36 months">
                  <SeriesChart data={model.anomalies} xKey="month" unit="% vs baseline" digits={0} height={220} ariaLabel="Monthly rainfall departure from baseline" refY={{ value: 0, label: "Baseline" }}
                    series={[{ key: "rainAnomalyPct", label: "Rainfall departure", color: SERIES.blue, type: "bar" }]} />
                </ChartBlock>
                <ChartBlock title="Heat anomaly, 36 months">
                  <SeriesChart data={model.anomalies} xKey="month" unit="°C vs baseline" digits={2} height={220} ariaLabel="Monthly temperature departure from baseline" refY={{ value: 0, label: "Baseline" }}
                    series={[{ key: "tempAnomalyC", label: "Temperature departure", color: SERIES.amber, type: "bar" }]} />
                </ChartBlock>
              </div>
              <ul className="divide-y divide-line border-t border-line pt-2">
                <SourceLine kind="measurement" text={`Daily rainfall: ${field.station.name}.`} />
                <SourceLine kind="model" text="Monthly departures: NASA POWER-style baseline at ~50 km. Regional, not field-specific." />
                <SourceLine kind="satellite" text="Land surface temperature: ECOSTRESS, ~70 m, irregular overpass times." />
              </ul>
            </div>
          )}

          {dim === "rotation" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                <Fact label="Seasons on record" value={String(field.rotationHistory.length)} />
                <Fact label="Crop families" value={String(families.size)} sub={[...families].join(", ")} />
                <Fact label="Legume seasons" value={String(field.rotationHistory.filter((r) => CROPS[r.crop].legume).length)} />
                <Fact label="Rotation experiments" value={String(plans.length)} sub="Plans in the Rotation Lab" />
              </div>
              <div>
                <div className="mb-3 text-[13px] font-medium text-silver">Planting history</div>
                <ol className="flex flex-wrap items-stretch gap-2">
                  {field.rotationHistory.map((r, i) => {
                    const c = CROPS[r.crop];
                    const repeat = i > 0 && CROPS[field.rotationHistory[i - 1].crop].family === c.family;
                    return (
                      <li key={r.season} className="flex items-center gap-2">
                        {i > 0 && <ArrowRight size={14} className={repeat ? "text-amber" : "text-muted"} aria-hidden />}
                        <div className={clsx("rounded-md border px-3 py-2", i === field.rotationHistory.length - 1 ? "border-terra/50 bg-terra/10" : "border-line")}>
                          <div className="text-[11px] text-muted">{r.season}</div>
                          <div className="text-[13px] font-medium text-silver">{c.name}</div>
                          <div className="text-[11px] text-muted">{c.familyCommon} family</div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-3 text-xs leading-relaxed text-muted">An amber arrow marks the same crop family grown back to back, which gives pests and diseases of that family a continuous host.</p>
              </div>
              <div>
                <div className="mb-2 text-[13px] font-medium text-silver">Rotation experiments</div>
                <ul className="space-y-1.5">
                  {plans.map((p) => (
                    <li key={p.id} className="text-[13px] text-silver/90"><span className="font-medium text-silver">{p.name}:</span> {p.crops.map((c) => CROPS[c].name).join(" → ")}</li>
                  ))}
                </ul>
                <Link href="/rotation-lab" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-terra-soft hover:text-terra">Compare them in the Rotation Lab <ArrowRight size={14} aria-hidden /></Link>
              </div>
              <ul className="divide-y divide-line border-t border-line pt-2">
                <SourceLine kind="measurement" text="Crop history: farmer-entered field record. Not sensed." />
              </ul>
            </div>
          )}
        </div>
      </Panel>

      <Disclosure title="How the model is built, and what it is not">
        <p>The Living Field Model is TERRA&apos;s running summary of this field. Each memory combines the observations that describe it, at the scale and date each one was made. When a discovery is investigated and resolved, the relevant memory is updated.</p>
        <p className="mt-2">It is a structured record with simple, stated calculations. It is not a calibrated simulation of the field, and it does not infer soil organic matter, nutrient levels or soil health from sensor data.</p>
      </Disclosure>
    </div>
  );
}

export function LivingFieldModel() {
  const { field } = useApp();
  const { data } = useService(`model:${field.id}`, () => getFieldModel(field.id));
  return (
    <div>
      <PageHeader eyebrow="Understand" title="Living Field Model" lead="TERRA's evolving understanding of this field: five connected memories, each built from dated observations and each honest about its limits." />
      {data && data.fieldId === field.id ? <Body key={field.id} model={data} /> : <Loading />}
    </div>
  );
}
