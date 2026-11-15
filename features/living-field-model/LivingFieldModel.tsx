"use client";

import clsx from "clsx";
import { CloudSun, Droplets, Layers3, Leaf, Repeat } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, Disclosure, ErrorState, Loading, PageHeader, Section, Segmented } from "@/components/ui";
import { longDate, shortDate } from "@/lib/dates";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getFieldModel } from "@/services/discoveryService";
import { getFieldState } from "@/services/fieldModelService";
import type { FieldState } from "@/lib/science/fieldModel/state";
import { getNasaSnapshot } from "@/services/nasaDataService";
import type { DimensionKey, FieldModel, NasaSnapshot } from "@/types";
import { DIMENSION_LABEL, Relationships } from "./parts";
import { ClimateSection, RotationSection, SoilSection, VegetationSection, WaterSection } from "./sections";
import { headline, modelStateAt } from "./state";

const DIMENSIONS: { key: DimensionKey; icon: typeof Droplets }[] = [
  { key: "water", icon: Droplets },
  { key: "soil", icon: Layers3 },
  { key: "vegetation", icon: Leaf },
  { key: "climate", icon: CloudSun },
  { key: "rotation", icon: Repeat },
];

function Body({ model, states, snapshot }: { model: FieldModel; states: FieldState[]; snapshot: NasaSnapshot | null }) {
  const { field, plans } = useApp();
  const obs = model.observations;
  const [dim, setDim] = useState<DimensionKey>("water");
  const [idx, setIdx] = useState(obs.length - 1);
  const [span, setSpan] = useState<60 | 120 | 240>(120);

  const state = useMemo(() => modelStateAt(field, model, states, idx, span), [field, model, states, idx, span]);
  const heads = headline(state);
  const props = { field, model, state };

  return (
    <div className="space-y-10">
      {/* Overview: the five dimensions side by side */}
      <div>
        <div role="tablist" aria-label="Field model dimensions" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {DIMENSIONS.map(({ key, icon: Icon }) => {
            const on = key === dim;
            return (
              <button key={key} type="button" role="tab" aria-selected={on} aria-controls="dimension-panel" onClick={() => setDim(key)}
                className={clsx("rounded-xl border p-4 text-left transition-colors", on ? "border-green bg-green-soft" : "border-line bg-surface shadow-card hover:border-line-strong")}>
                <span className={clsx("flex items-center gap-2 text-sm font-medium", on ? "text-green-strong" : "text-ink")}><Icon size={16} className={on ? "text-green" : "text-muted"} aria-hidden />{DIMENSION_LABEL[key]}</span>
                <span className="tabular mt-3 block text-xl font-semibold text-ink">{heads[key].value}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{heads[key].caption}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-sunken px-4 py-3">
          <label htmlFor="model-time" className="text-[13px] font-medium text-ink">Model as of <span className="tabular">{longDate(state.at.date)}</span></label>
          <input id="model-time" type="range" min={30} max={obs.length - 1} value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="min-w-[180px] flex-1" aria-valuetext={longDate(state.at.date)} />
          <span className="tabular text-xs text-muted">{shortDate(obs[30].date)} to {shortDate(obs[obs.length - 1].date)}</span>
          {!state.isLatest && <button type="button" onClick={() => setIdx(obs.length - 1)} className="text-[13px] font-medium text-green hover:text-green-strong">Back to latest</button>}
        </div>
      </div>

      <Card className="p-5 sm:p-7">
        <div id="dimension-panel" role="tabpanel" aria-label={DIMENSION_LABEL[dim]}>
          <div className="mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="max-w-3xl">
              <h2 className="text-xl font-semibold tracking-tight text-ink">{DIMENSION_LABEL[dim]}</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
                {state.isLatest ? model.summaries[dim] : `Showing the record as it stood on ${longDate(state.at.date)}. Charts mark that date with a dotted line.`}
              </p>
            </div>
            {dim !== "rotation" && dim !== "vegetation" && <Segmented label="Chart period" value={span} onChange={setSpan} options={[{ value: 60, label: "60 days" }, { value: 120, label: "120 days" }, { value: 240, label: "All" }]} />}
          </div>
          {dim === "water" && <WaterSection {...props} />}
          {dim === "soil" && <SoilSection {...props} />}
          {dim === "vegetation" && <VegetationSection {...props} />}
          {dim === "climate" && <ClimateSection {...props} snapshot={snapshot} />}
          {dim === "rotation" && <RotationSection {...props} plans={plans} />}
        </div>
      </Card>

      <Section title={`How ${DIMENSION_LABEL[dim].toLowerCase()} relates to the rest of the field`} description="Links found between the dimensions in this field's own record.">
        <Relationships dim={dim} relationships={model.relationships} />
      </Section>

      <div className="max-w-3xl">
        <Disclosure title="How the model is built, and what it is not">
          <p>The Living Field Model is TERRA&apos;s running summary of this field. Each of the five dimensions combines the observations that describe it, at the scale and date each one was made. When a discovery is investigated and resolved, the relevant dimension is updated.</p>
          <p className="mt-2">It is a structured record with simple, stated calculations. It is not a calibrated simulation of the field, and it does not infer organic matter, nutrient levels or soil health from sensor data.</p>
        </Disclosure>
      </div>
    </div>
  );
}

export function LivingFieldModel() {
  const { field, followUps } = useApp();
  const modelQ = useService(`model:${field.id}`, () => getFieldModel(field.id));
  const statesQ = useService(`state:${field.id}:${followUps.length}`, () => getFieldState(field.id, followUps));
  const snapQ = useService(`nasa:${field.id}`, () => getNasaSnapshot(field.id));
  const ready = modelQ.data && modelQ.data.fieldId === field.id && statesQ.data && snapQ.data !== undefined;
  return (
    <div>
      <PageHeader title="Living Field Model" lead="What TERRA currently understands about this field, in five parts: water, soil, vegetation, climate and crop rotation. Each part separates what was measured from what was estimated." />
      {modelQ.error || statesQ.error ? <ErrorState message={modelQ.error ?? statesQ.error ?? ""} /> : ready
        ? <Body key={field.id} model={modelQ.data!} states={statesQ.data!} snapshot={snapQ.data && snapQ.data.fieldId === field.id ? snapQ.data : null} />
        : <Loading />}
    </div>
  );
}
