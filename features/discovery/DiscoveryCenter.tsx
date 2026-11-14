"use client";

import clsx from "clsx";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Disclosure, Eyebrow, Loading, PageHeader, Panel, Segmented } from "@/components/ui";
import { shortDate } from "@/lib/dates";
import { fmt, signed } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getDiscoveries } from "@/services/discoveryService";
import type { Discovery } from "@/types";
import { Confidence, StatusBadge } from "./shared";

type Filter = "all" | "open" | "resolved";

function MiniStages({ d }: { d: Discovery }) {
  return (
    <ol className="flex items-center gap-1" aria-label="Investigation progress">
      {d.stages.map((s) => (
        <li key={s.key} title={`${s.label}: ${s.state}`}
          className={clsx("h-1.5 flex-1 rounded-full", s.state === "done" ? "bg-terra" : s.state === "active" ? "terra-pulse bg-terra/60" : "bg-white/10")} />
      ))}
    </ol>
  );
}

function DiscoveryRow({ d }: { d: Discovery }) {
  const current = d.stages.find((s) => s.state === "active") ?? d.stages[d.stages.length - 1];
  const delta = d.comparison.current - d.comparison.baseline;
  return (
    <Panel as="article" className="transition-colors hover:border-terra/40">
      <Link href={`/discoveries/${d.id}`} className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <StatusBadge status={d.status} />
            <span>{d.category}</span>
            <span aria-hidden>·</span>
            <span>Detected {shortDate(d.detectedOn)}</span>
          </div>
          <h2 className="mt-2.5 font-display text-[15px] font-semibold uppercase tracking-wider text-silver">{d.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{d.summary}</p>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-xs">
            <div>
              <div className="text-muted">{d.comparison.label}</div>
              <div className="tabular mt-0.5 text-silver">
                <span className="text-[15px] font-semibold">{fmt(d.comparison.current, d.comparison.unit === "NDVI" ? 2 : 1)}</span> {d.comparison.unit}
                <span className="ml-2 text-muted">baseline {fmt(d.comparison.baseline, d.comparison.unit === "NDVI" ? 2 : 1)} ({signed(delta, d.comparison.unit === "NDVI" ? 2 : 1)})</span>
              </div>
            </div>
            <div>
              <div className="text-muted">Supporting observations</div>
              <div className="mt-0.5 text-[15px] font-semibold text-silver">{d.observations.length}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:border-l lg:border-line lg:pl-5">
          <Confidence value={d.confidence} />
          <div>
            <div className="mb-1.5 flex justify-between text-xs"><span className="text-muted">Stage</span><span className="font-medium text-silver">{d.status === "resolved" ? "Field model updated" : current.label}</span></div>
            <MiniStages d={d} />
          </div>
          <span className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-terra-soft">Open investigation <ArrowRight size={14} aria-hidden /></span>
        </div>
      </Link>
    </Panel>
  );
}

export function DiscoveryCenter() {
  const { field, followUps } = useApp();
  const { data } = useService(`disc:${field.id}:${followUps.length}`, () => getDiscoveries(field.id, followUps));
  const [filter, setFilter] = useState<Filter>("all");
  if (!data) return <Loading />;

  const open = data.filter((d) => d.status !== "resolved");
  const shown = data.filter((d) => filter === "all" || (filter === "open" ? d.status !== "resolved" : d.status === "resolved"));

  return (
    <div>
      <PageHeader eyebrow="Discover · Investigate" title="Discovery Center"
        lead="TERRA compares every new observation with this field's own history. When something departs from the usual pattern, it is raised here as a question to investigate — not as a conclusion."
        actions={<Segmented label="Filter discoveries" value={filter} onChange={setFilter}
          options={[{ value: "all", label: `All ${data.length}` }, { value: "open", label: `Open ${open.length}` }, { value: "resolved", label: `Resolved ${data.length - open.length}` }]} />} />

      <Panel className="mb-5">
        <div className="grid gap-px overflow-hidden rounded-lg bg-line sm:grid-cols-3">
          {[
            { k: "Observation", c: "text-terra-soft", t: "What an instrument or satellite recorded. Tagged with its source and date." },
            { k: "Possible explanation", c: "text-amber", t: "TERRA's reading of the pattern, alongside the other things that could cause it. Unconfirmed." },
            { k: "Confirmed finding", c: "text-silver", t: "Stated only after follow-up data has tested the explanation." },
          ].map((x) => (
            <div key={x.k} className="bg-surface p-4">
              <div className={clsx("flex items-center gap-1.5 text-[13px] font-semibold", x.c)}>{x.k === "Confirmed finding" && <Check size={14} aria-hidden />}{x.k}</div>
              <p className="mt-1 text-xs leading-relaxed text-muted">{x.t}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="space-y-4">
        {shown.length === 0 && (
          <Panel><p className="p-8 text-center text-sm text-muted">{data.length === 0 ? "No detector rule is met for this field. Its recent observations sit within their usual range." : "No discoveries match this filter."}</p></Panel>
        )}
        {shown.map((d) => <DiscoveryRow key={d.id} d={d} />)}
      </div>

      <div className="mt-6">
        <Eyebrow className="mb-3">How detection works</Eyebrow>
        <div className="grid gap-3 lg:grid-cols-2">
          <Disclosure title="The four detector rules in this build">
            <ul className="list-disc space-y-1.5 pl-4">
              <li><span className="text-silver">Moisture divergence:</span> surface moisture falls 5 points or more in 14 days while the 40 cm reading moves 3 points or less.</li>
              <li><span className="text-silver">Rainfall departure:</span> 14-day rain is below 45% or above 170% of the monthly baseline for the period.</li>
              <li><span className="text-silver">Vegetation dip:</span> NDVI falls 0.03 or more between composites while the crop is in development or mid-season.</li>
              <li><span className="text-silver">Source offset:</span> station and satellite moisture differ by 1.5 points or more on average across 20+ paired days.</li>
            </ul>
            <p className="mt-2">Thresholds are simple, fixed values chosen for the demo. A deployed system would tune them to each field&apos;s record.</p>
          </Disclosure>
          <Disclosure title="What confidence means here">
            <p>Confidence expresses how strongly the available evidence supports that a pattern is real: how far it departs from the field&apos;s own baseline, and whether independent sources agree. It is a heuristic, not a statistical probability, and it says nothing about which explanation is correct.</p>
          </Disclosure>
        </div>
      </div>
    </div>
  );
}
