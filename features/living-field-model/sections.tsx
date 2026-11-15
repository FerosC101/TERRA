import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { Fact, LINK, Notice } from "@/components/ui";
import { CropImage, CropSequence } from "@/components/visual/Crop";
import { CROPS } from "@/data/crops";
import { REAL_FIELD_MODEL, REAL_FIELD_SETTINGS } from "@/data/lipaModelConfig";
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
  const by = r.source === "smap" ? "SMAP" : r.source === "smap_l4" ? "SMAP L4" : r.source === "manual" ? "your follow-up" : "the station";
  return `Last corrected by ${by}, ${age === 0 ? "today" : `${age} day${age > 1 ? "s" : ""} ago`}`;
}

/** "station", or "simulated station" when no device is installed (the readings come from its design, not a sensor). */
function stationWord(state: ModelState, capital = false): string {
  const w = state.prov("surfaceVwc") === "simulated" ? "simulated station" : "station";
  return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

/** Where the rain figures come from: the station gauge, or NASA rain on a real record. */
function rainWord(state: ModelState, long = false): string {
  if (state.prov("rainMm") === "measurement") return long ? "Station gauge" : "station gauge";
  return long ? "NASA rain (IMERG; POWER where IMERG is missing)" : "NASA IMERG / POWER";
}

/** True when the field has real farmer-reported seasons (Plot A). */
const hasSeasons = (field: Field) => !!REAL_FIELD_MODEL[field.id]?.seasons;

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
          <Fact label="Surface soil moisture" value={`${fmt(at.surfaceVwc, 1)} %`} sub={`10 cm · ${stationWord(state)}`} />
          <Fact label="Deep soil moisture" value={`${fmt(at.deepVwc, 1)} %`} sub={`40 cm · ${stationWord(state)}`} />
          <Fact label="Rain, last 30 days" value={`${fmt(state.rain30, 0)} mm`} sub={`${shortDate(state.rain30Start)} to ${shortDate(at.date)} · ${rainWord(state)}`} />
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
          <ChartBlock title="Soil moisture at two depths" source={state.prov("surfaceVwc")}>
            <SeriesChart {...chart} data={view} unit="% volumetric water content" ariaLabel="Soil moisture at two depths" series={[
              { key: "surfaceVwc", label: "Surface, 10 cm", color: SERIES.green }, { key: "deepVwc", label: "Deeper, 40 cm", color: SERIES.amber }]} />
          </ChartBlock>
          <div className="grid gap-8 lg:grid-cols-2">
            <ChartBlock title="Estimated water in the root zone" source="model">
              <SeriesChart {...chart} data={view} unit="mm" height={200} digits={0} ariaLabel="Modelled root-zone water available to the crop" domain={[0, state.capacityMm]}
                series={[{ key: "waterMm", label: "Estimated available water", color: SERIES.violet, type: "area" }]} />
            </ChartBlock>
            <ChartBlock title="Daily rainfall" source={state.prov("rainMm")}>
              <SeriesChart {...chart} data={view} unit="mm per day" height={200} ariaLabel="Daily rainfall" series={[{ key: "rainMm", label: rainWord(state, true), color: SERIES.green, type: "bar" }]} />
            </ChartBlock>
          </div>
        </div>
      </Block>
      <Block>
        <ProvenanceList items={[
          ...(state.prov("surfaceVwc") === "simulated"
            ? [{ kind: "simulated" as const, text: `Soil moisture at 10 cm and 40 cm: simulated readings of ${field.station.name}, from its design and the real weather. No device is installed; these are not measurements and no model uses them.` },
               { kind: state.prov("rainMm"), text: "Rainfall: GPM IMERG (satellite, ~10 km); NASA POWER (model, ~50 km) on days IMERG is missing." }]
            : [{ kind: "measurement" as const, text: `Soil moisture and rainfall: ${field.station.name}, one point in the field, observed ${longDate(at.date)}.` }]),
          { kind: "model", text: `Root-zone water: a daily two-layer FAO-56 soil-water balance with crop water use ETc = Kc × ET0, corrected each day by the soil-moisture readings in proportion to their uncertainty. ${field.soil.source === "soilgrids" ? "Soil properties are a SoilGrids estimate, not measured at this field." : "Soil properties are indicative, not measured at this field."} An estimate, not a measurement.` },
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
          <Fact label="Soil temperature" value={`${fmt(at.soilTempC, 1)} °C`} sub={`10 cm · ${stationWord(state)}`} />
          <Fact label="Bulk electrical conductivity" value={`${fmt(at.ecDsM, 2)} dS/m`} sub={stationWord(state, true)} />
          <Fact label="Texture" value={field.soil.texture} sub={field.soil.source === "soilgrids" ? "SoilGrids model estimate" : "From the field record"} />
          <Fact label="Water-holding capacity" value={`${field.soil.awcMmPerM} mm per m`} sub={field.soil.source === "soilgrids" ? "SoilGrids model estimate, not tested" : "Typical for the texture, not tested"} />
        </div>
      </Block>
      <Block title="Historical trends">
        <div className="grid gap-8 lg:grid-cols-2">
          <ChartBlock title="Soil temperature at 10 cm" source={state.prov("soilTempC")}>
            <SeriesChart {...chart} data={view} unit="°C" height={220} ariaLabel="Soil temperature" series={[{ key: "soilTempC", label: "Soil temperature", color: SERIES.green }]} />
          </ChartBlock>
          <ChartBlock title="Bulk electrical conductivity" source={state.prov("ecDsM")}>
            <SeriesChart {...chart} data={view} unit="dS/m" digits={2} height={220} ariaLabel="Bulk electrical conductivity" series={[{ key: "ecDsM", label: "Bulk EC", color: SERIES.green }]} />
          </ChartBlock>
        </div>
      </Block>
      <Notice tone="caution">
        These sensors don&apos;t measure nutrients or soil health: that needs a lab test. EC moves with moisture, so it isn&apos;t a salinity reading on its own.
      </Notice>
      <Block>
        <ProvenanceList items={[
          state.prov("soilTempC") === "simulated"
            ? { kind: "simulated", text: `Temperature and EC: simulated readings of ${field.station.name}, from its design and the real weather. No device is installed.` }
            : { kind: "measurement", text: `Temperature and EC: ${field.station.name}, observed ${longDate(at.date)}.` },
          { kind: "model", text: field.soil.note },
        ]} />
      </Block>
    </div>
  );
}

export function VegetationSection({ field, model, state }: SectionProps) {
  const { ndviAt, crop, dap } = state;
  const stage = state.stage === "pre" ? "Not yet planted" : state.stage === "post" ? "Past harvest" : state.stage;
  const hls = REAL_FIELD_SETTINGS[field.id]?.ndviSource === "hls";
  const fallowNow = !!field.fallow && state.at.date >= field.fallow.since;
  const seasons = hasSeasons(field);
  return (
    <div className="space-y-9">
      <Block title="Current measurements">
        <div className="flex flex-wrap items-center gap-6">
          <CropImage id={field.currentCrop} size="lg" />
          <div className={`${FACTS} flex-1`}>
          <Fact label="Vegetation index (NDVI)" value={ndviAt ? fmt(ndviAt.ndvi, 2) : "Unavailable"}
            sub={ndviAt ? (hls ? `HLS 30 m pass on ${shortDate(ndviAt.date)} · satellite` : `16-day composite to ${shortDate(ndviAt.date)} · satellite`) : "No composite received yet"} />
          {fallowNow && field.fallow
            ? <Fact label="Crop" value="Fallow" sub={`Since ${shortDate(field.fallow.since)} · next planting ${field.fallow.next} (planned)`} />
            : <Fact label="Crop" value={crop.name} sub={dap >= 0 ? `Day ${dap} after planting` : "Not yet planted"} />}
          </div>
        </div>
      </Block>
      <Block title="Model estimates">
        <div className={FACTS}>
          <Fact label="Growth stage" value={stage.charAt(0).toUpperCase() + stage.slice(1)} sub={seasons ? "From the farmer's reported seasons and typical stage lengths" : "From the planting date and typical stage lengths"} />
          <Fact label="Crop coefficient (Kc)" value={fmt(state.kc, 2)} sub="Share of reference evapotranspiration the crop uses" />
        </div>
      </Block>
      <Block title="Historical trend">
        <ChartBlock title="Vegetation index over the record" source="satellite" info="NDVI runs from about 0.2 for bare soil to above 0.8 for a dense, healthy canopy. It tracks how green and full the canopy is. It does not measure yield, and it stops rising once the canopy closes.">
          <SeriesChart xKey="date" xFormat={shortDate} markerX={state.isLatest ? undefined : state.at.date} data={model.observations.slice(0, Math.max(state.upTo.length, 120))} unit="NDVI (0 to 1, unitless)" digits={2} domain={[0, 1]} ariaLabel="NDVI composites"
            series={[{ key: "ndvi", label: hls ? "NDVI, HLS 30 m clear passes" : "NDVI, 16-day composite", color: SERIES.blue, sparse: true }]} />
        </ChartBlock>
      </Block>
      <Block>
        <ProvenanceList items={[
          hls
            ? { kind: "satellite", text: `NDVI: NASA HLS v2.0 (Landsat and Sentinel-2), 30 m pixels inside the plot, cloud-masked; only clear passes are shown${ndviAt ? `, latest ${longDate(ndviAt.date)}` : ""}. The plot is often cloudy, so passes are few.` }
            : { kind: "satellite", text: `NDVI: MODIS MOD13Q1, 250 m pixels, 16-day composite${ndviAt ? ` to ${longDate(ndviAt.date)}` : ""}. Edge pixels include neighbouring land.` },
          seasons
            ? { kind: "model", text: "Growth stage and Kc: the farmer's reported planting and harvest dates for each season, with FAO-56 stage lengths fitted to each season." }
            : { kind: "model", text: `Growth stage and Kc: planting date ${longDate(field.plantedOn)} with FAO-56 style stage lengths.` },
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
          <Fact label="Rain, last 30 days" value={`${fmt(state.rain30, 0)} mm`} sub={`${shortDate(state.rain30Start)} to ${shortDate(at.date)} · ${rainWord(state)}`} />
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
          <ChartBlock title="Daily maximum air temperature" source={state.prov("tmaxC")}>
            <SeriesChart {...chart} data={view} unit="°C" height={220} ariaLabel="Daily maximum air temperature" series={[{ key: "tmaxC", label: "Air, daily maximum", color: SERIES.green }]} />
          </ChartBlock>
          <div className="grid gap-8 lg:grid-cols-2">
            <ChartBlock title={`Monthly rainfall against the baseline, ${model.anomalies.length} months`} source="model">
              <SeriesChart data={model.anomalies} xKey="month" unit="% above or below baseline" digits={0} height={220} ariaLabel="Monthly rainfall departure from baseline" refY={{ value: 0, label: "Baseline" }}
                series={[{ key: "rainAnomalyPct", label: "Rainfall departure", color: SERIES.violet, type: "bar" }]} />
            </ChartBlock>
            <ChartBlock title={`Monthly temperature against the baseline, ${model.anomalies.length} months`} source="model">
              <SeriesChart data={model.anomalies} xKey="month" unit="°C above or below baseline" digits={2} height={220} ariaLabel="Monthly temperature departure from baseline" refY={{ value: 0, label: "Baseline" }}
                series={[{ key: "tempAnomalyC", label: "Temperature departure", color: SERIES.violet, type: "bar" }]} />
            </ChartBlock>
          </div>
        </div>
      </Block>
      <Block>
        <ProvenanceList items={[
          ...(state.prov("tmaxC") === "measurement"
            ? [{ kind: "measurement" as const, text: `Daily rainfall and air temperature: ${field.station.name}.` },
               { kind: "model" as const, text: `Monthly baseline: ${field.climate.source}. Regional, not field-specific.` }]
            : [{ kind: "satellite" as const, text: "Daily rainfall: GPM IMERG (satellite, ~10 km); NASA POWER on days IMERG is missing. Air temperature: NASA POWER (model, ~50 km)." },
               { kind: "model" as const, text: "Monthly baselines: NASA POWER 2001–2023 rain normal and 2001–2025 temperature climatology. Regional, not field-specific." }]),
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
            const current = !field.fallow && i === field.rotationHistory.length - 1;
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
        <ProvenanceList items={[{ kind: "measurement", text: hasSeasons(field)
          ? `Crop history: reported by the farmer in an interview (approximate dates). Not sensed.${field.fallow ? ` Fallow since ${longDate(field.fallow.since)}; next planting ${field.fallow.next} (planned).` : ""}`
          : "Crop history: entered in the field record by the farmer. Not sensed." }]} />
      </Block>
    </div>
  );
}
