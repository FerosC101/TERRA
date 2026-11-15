import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { Fact, LINK, Notice } from "@/components/ui";
import { CropImage, CropSequence } from "@/components/visual/Crop";
import { CROPS } from "@/data/crops";
import { SERIES } from "@/lib/chartTheme";
import { daysBetween, longDate, shortDate } from "@/lib/dates";
import { fmt, signed } from "@/lib/format";
import type { Field, FieldModel, NasaSnapshot, RotationPlan } from "@/types";
import { ChartBlock, NasaRecord, ProvenanceList } from "./parts";
import type { ModelState } from "./state";

interface SectionProps {
  field: Field;
  model: FieldModel;
  state: ModelState;
}

function Block({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div>
      {title && <h3 className="mb-3 text-[13px] font-medium uppercase tracking-wide text-muted">{title}</h3>}
      {children}
    </div>
  );
}

const FACTS = "grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4";

function readingNote(r: { source: string; date: string } | null, today: string): string {
  if (!r) return "No reading has corrected it yet";
  const age = daysBetween(r.date, today);
  return `Last corrected by ${r.source === "smap" ? "SMAP" : r.source === "manual" ? "your follow-up" : "the station"}, ${age === 0 ? "today" : `${age} day${age > 1 ? "s" : ""} ago`}`;
}

function chartProps(state: ModelState) {
  return { xKey: "date", xFormat: shortDate, markerX: state.at.date, markerLabel: state.isLatest ? undefined : shortDate(state.at.date) } as const;
}

export function WaterSection({ field, state }: SectionProps) {
  const { at, view } = state;
  const chart = chartProps(state);
  return (
    <div className="space-y-9">
      <Block title="Current measurements">
        <div className={FACTS}>
          <Fact label="Surface soil moisture" value={`${fmt(at.surfaceVwc, 1)} %`} sub="10 cm · station" />
          <Fact label="Deep soil moisture" value={`${fmt(at.deepVwc, 1)} %`} sub="40 cm · station" />
          <Fact label="Rain, last 30 days" value={`${fmt(state.rain30, 0)} mm`} sub={`${shortDate(state.rain30Start)} to ${shortDate(at.date)} · station gauge`} />
        </div>
      </Block>
      <Block title="Model estimates">
        <div className={FACTS}>
          <Fact label="Water available to the crop" value={`${fmt(state.availableMm, 0)} mm`} sub={`${fmt((state.availableMm / state.capacityMm) * 100)}% of the ${fmt(state.capacityMm, 0)} mm the root zone can hold`} />
          <Fact label="Change in 30 days" value={`${signed(state.storageChange30, 0)} mm`} sub={`Rain ${fmt(state.rain30, 0)} mm, crop use about ${fmt(state.etc30, 0)} mm`} />
          <Fact label="Surface moisture, model" value={`${fmt(state.living.surface.vwc * 100, 1)} ± ${fmt(state.living.surface.sd * 100, 1)} %`} sub={readingNote(state.living.surface.lastReading, at.date)} />
          <Fact label="Crop water stress" value={state.living.water.ks === null ? "Unknown" : state.living.water.stressed ? `Yes (Ks ${fmt(state.living.water.ks, 2)})` : "None"}
            sub={state.living.water.refillMm > 0 ? `About ${fmt(state.living.water.refillMm, 0)} mm would refill the root zone` : `Irrigation point at ${fmt(state.living.water.rawMm, 0)} mm depletion`} />
        </div>
      </Block>
      <Block title="Historical trends">
        <div className="space-y-8">
          <ChartBlock title="Soil moisture at two depths" source="measurement">
            <SeriesChart {...chart} data={view} unit="% volumetric water content" ariaLabel="Soil moisture at two depths" series={[
              { key: "surfaceVwc", label: "Surface, 10 cm", color: SERIES.green }, { key: "deepVwc", label: "Deeper, 40 cm", color: SERIES.amber }]} />
          </ChartBlock>
          <div className="grid gap-8 lg:grid-cols-2">
            <ChartBlock title="Estimated water in the root zone" source="model">
              <SeriesChart {...chart} data={view} unit="mm" height={200} digits={0} ariaLabel="Modelled root-zone water available to the crop" domain={[0, state.capacityMm]}
                series={[{ key: "waterMm", label: "Estimated available water", color: SERIES.violet, type: "area" }]} />
            </ChartBlock>
            <ChartBlock title="Daily rainfall" source="measurement">
              <SeriesChart {...chart} data={view} unit="mm per day" height={200} ariaLabel="Daily rainfall" series={[{ key: "rainMm", label: "Station gauge", color: SERIES.green, type: "bar" }]} />
            </ChartBlock>
          </div>
        </div>
      </Block>
      <Block>
        <ProvenanceList items={[
          { kind: "measurement", text: `Soil moisture and rainfall: ${field.station.name}, one point in the field, observed ${longDate(at.date)}.` },
          { kind: "model", text: "Root-zone water: a daily two-layer FAO-56 soil-water balance with crop water use ETc = Kc × ET0, corrected each day by the soil-moisture readings in proportion to their uncertainty. Soil properties are indicative, not measured at this field. An estimate, not a measurement." },
        ]} />
      </Block>
    </div>
  );
}

export function SoilSection({ field, state }: SectionProps) {
  const { at, view } = state;
  const chart = chartProps(state);
  return (
    <div className="space-y-9">
      <Block title="Current measurements">
        <div className={FACTS}>
          <Fact label="Soil temperature" value={`${fmt(at.soilTempC, 1)} °C`} sub="10 cm · station" />
          <Fact label="Bulk electrical conductivity" value={`${fmt(at.ecDsM, 2)} dS/m`} sub="Station" />
          <Fact label="Texture" value={field.soil.texture} sub={field.soil.source === "soilgrids" ? "SoilGrids model estimate" : "From the field record"} />
          <Fact label="Water-holding capacity" value={`${field.soil.awcMmPerM} mm per m`} sub={field.soil.source === "soilgrids" ? "SoilGrids model estimate, not tested" : "Typical for the texture, not tested"} />
        </div>
      </Block>
      <Block title="Historical trends">
        <div className="grid gap-8 lg:grid-cols-2">
          <ChartBlock title="Soil temperature at 10 cm" source="measurement">
            <SeriesChart {...chart} data={view} unit="°C" height={220} ariaLabel="Soil temperature" series={[{ key: "soilTempC", label: "Soil temperature", color: SERIES.green }]} />
          </ChartBlock>
          <ChartBlock title="Bulk electrical conductivity" source="measurement">
            <SeriesChart {...chart} data={view} unit="dS/m" digits={2} height={220} ariaLabel="Bulk electrical conductivity" series={[{ key: "ecDsM", label: "Bulk EC", color: SERIES.green }]} />
          </ChartBlock>
        </div>
      </Block>
      <Notice tone="caution">
        These sensors don&apos;t measure nutrients or soil health: that needs a lab test. EC moves with moisture, so it isn&apos;t a salinity reading on its own.
      </Notice>
      <Block>
        <ProvenanceList items={[
          { kind: "measurement", text: `Temperature and EC: ${field.station.name}, observed ${longDate(at.date)}.` },
          { kind: "model", text: field.soil.note },
        ]} />
      </Block>
    </div>
  );
}

export function VegetationSection({ field, model, state }: SectionProps) {
  const { ndviAt, crop, dap } = state;
  const stage = state.stage === "pre" ? "Not yet planted" : state.stage === "post" ? "Past harvest" : state.stage;
  return (
    <div className="space-y-9">
      <Block title="Current measurements">
        <div className="flex flex-wrap items-center gap-6">
          <CropImage id={field.currentCrop} size="lg" />
          <div className={`${FACTS} flex-1`}>
          <Fact label="Vegetation index (NDVI)" value={ndviAt ? fmt(ndviAt.ndvi, 2) : "Unavailable"} sub={ndviAt ? `16-day composite to ${shortDate(ndviAt.date)} · satellite` : "No composite received yet"} />
          <Fact label="Crop" value={crop.name} sub={dap >= 0 ? `Day ${dap} after planting` : "Not yet planted"} />
          </div>
        </div>
      </Block>
      <Block title="Model estimates">
        <div className={FACTS}>
          <Fact label="Growth stage" value={stage.charAt(0).toUpperCase() + stage.slice(1)} sub="From the planting date and typical stage lengths" />
          <Fact label="Crop coefficient (Kc)" value={fmt(state.kc, 2)} sub="Share of reference evapotranspiration the crop uses" />
        </div>
      </Block>
      <Block title="Historical trend">
        <ChartBlock title="Vegetation index over the record" source="satellite" info="NDVI runs from about 0.2 for bare soil to above 0.8 for a dense, healthy canopy. It tracks how green and full the canopy is. It does not measure yield, and it stops rising once the canopy closes.">
          <SeriesChart xKey="date" xFormat={shortDate} markerX={state.isLatest ? undefined : state.at.date} data={model.observations.slice(0, Math.max(state.upTo.length, 120))} unit="NDVI (0 to 1, unitless)" digits={2} domain={[0, 1]} ariaLabel="NDVI composites"
            series={[{ key: "ndvi", label: "NDVI, 16-day composite", color: SERIES.blue, sparse: true }]} />
        </ChartBlock>
      </Block>
      <Block>
        <ProvenanceList items={[
          { kind: "satellite", text: `NDVI: MODIS MOD13Q1, 250 m pixels, 16-day composite${ndviAt ? ` to ${longDate(ndviAt.date)}` : ""}. Edge pixels include neighbouring land.` },
          { kind: "model", text: `Growth stage and Kc: planting date ${longDate(field.plantedOn)} with FAO-56 style stage lengths.` },
        ]} />
      </Block>
    </div>
  );
}

export function ClimateSection({ field, model, state, snapshot }: SectionProps & { snapshot: NasaSnapshot | null }) {
  const { at, view } = state;
  const chart = chartProps(state);
  const lastAnomaly = model.anomalies[model.anomalies.length - 1];
  return (
    <div className="space-y-9">
      <Block title="Current measurements">
        <div className={FACTS}>
          <Fact label="Rain, last 30 days" value={`${fmt(state.rain30, 0)} mm`} sub={`${shortDate(state.rain30Start)} to ${shortDate(at.date)} · station gauge`} />
          <Fact label="Air temperature" value={`${fmt(at.tmaxC, 1)} °C`} sub={`Daily maximum · ${shortDate(at.date)}`} />
        </div>
      </Block>
      <Block title="Model estimates">
        <div className={FACTS}>
          <Fact label="Evaporative demand (ET0)" value={`${fmt(at.et0Mm, 1)} mm per day`} sub="Reference evapotranspiration" />
          <Fact label="Latest month's rain vs usual" value={`${signed(lastAnomaly.rainAnomalyPct, 0)} %`} sub={`${lastAnomaly.month} against the monthly baseline`} />
        </div>
      </Block>
      {snapshot && <NasaRecord snapshot={snapshot} />}
      <Block title="Historical trends">
        <div className="space-y-8">
          <ChartBlock title="Daily maximum air temperature" source="measurement">
            <SeriesChart {...chart} data={view} unit="°C" height={220} ariaLabel="Daily maximum air temperature" series={[{ key: "tmaxC", label: "Air, daily maximum", color: SERIES.green }]} />
          </ChartBlock>
          <div className="grid gap-8 lg:grid-cols-2">
            <ChartBlock title="Monthly rainfall against the baseline, 36 months" source="model">
              <SeriesChart data={model.anomalies} xKey="month" unit="% above or below baseline" digits={0} height={220} ariaLabel="Monthly rainfall departure from baseline" refY={{ value: 0, label: "Baseline" }}
                series={[{ key: "rainAnomalyPct", label: "Rainfall departure", color: SERIES.violet, type: "bar" }]} />
            </ChartBlock>
            <ChartBlock title="Monthly temperature against the baseline, 36 months" source="model">
              <SeriesChart data={model.anomalies} xKey="month" unit="°C above or below baseline" digits={2} height={220} ariaLabel="Monthly temperature departure from baseline" refY={{ value: 0, label: "Baseline" }}
                series={[{ key: "tempAnomalyC", label: "Temperature departure", color: SERIES.violet, type: "bar" }]} />
            </ChartBlock>
          </div>
        </div>
      </Block>
      <Block>
        <ProvenanceList items={[
          { kind: "measurement", text: `Daily rainfall and air temperature: ${field.station.name}.` },
          { kind: "model", text: `Monthly baseline: ${field.climate.source}. Regional, not field-specific.` },
          ...(snapshot ? [{ kind: "satellite" as const, text: `Retrieved NASA record for ${longDate(snapshot.start)} to ${longDate(snapshot.end)}, from the TERRA data pipeline (location ${snapshot.locationId}).` }] : []),
        ]} />
      </Block>
    </div>
  );
}

export function RotationSection({ field, state, plans }: SectionProps & { plans: RotationPlan[] }) {
  return (
    <div className="space-y-9">
      <Block title="Crop record">
        <div className={FACTS}>
          <Fact label="Seasons on record" value={String(field.rotationHistory.length)} />
          <Fact label="Crop families" value={String(state.families.length)} sub={state.families.join(", ")} />
          <Fact label="Seasons with a legume" value={String(state.legumeSeasons)} />
        </div>
      </Block>
      <Block title="Planting history">
        <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
          {field.rotationHistory.map((r, i) => {
            const c = CROPS[r.crop];
            const repeat = i > 0 && CROPS[field.rotationHistory[i - 1].crop].family === c.family;
            const current = i === field.rotationHistory.length - 1;
            return (
              <li key={r.season} className={clsx("flex flex-col items-center p-4 text-center", current ? "bg-green-soft" : "bg-surface")}>
                <p className="text-xs text-muted">{r.season}{current ? " · now" : ""}</p>
                <CropImage id={r.crop} size="lg" tile={false} />
                <p className="text-[15px] font-medium text-ink">{c.name}</p>
                <p className="text-[13px] text-muted">{c.familyCommon}</p>
                {repeat && <p className="mt-1 text-xs font-medium text-amber">Same family again</p>}
              </li>
            );
          })}
        </ol>
      </Block>
      <Block title="Rotation plans being compared">
        <ul className="space-y-2 text-sm text-ink-soft">
          {plans.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-3"><span className="w-24 font-medium text-ink">{p.name}</span><CropSequence crops={p.crops} size="xs" /></li>)}
        </ul>
        <Link href="/rotation-lab" className={clsx(LINK, "mt-3")}>Compare them in the Rotation Lab <ArrowRight size={15} aria-hidden /></Link>
      </Block>
      <Block>
        <ProvenanceList items={[{ kind: "measurement", text: "Crop history: entered in the field record by the farmer. Not sensed." }]} />
      </Block>
    </div>
  );
}
