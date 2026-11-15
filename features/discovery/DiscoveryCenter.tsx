"use client";

import { ArrowRight, CircleCheck, HelpCircle, Microscope } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card, Disclosure, EmptyState, ErrorState, Loading, PageHeader, Section, Segmented } from "@/components/ui";
import { longDate } from "@/lib/dates";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getDiscoveries } from "@/services/discoveryService";
import type { Discovery } from "@/types";
import { CategoryIcon, Evidence, StatusBadge } from "./shared";

type Filter = "all" | "open" | "resolved";

const COLUMNS = "md:grid md:grid-cols-[minmax(0,1fr)_100px_110px_115px_165px_60px] md:items-center md:gap-4";

function DiscoveryRow({ d }: { d: Discovery }) {
  return (
    <li>
      <Link href={`/discoveries/${d.id}`} className={`group block px-5 py-4 hover:bg-sunken/60 sm:px-6 ${COLUMNS}`}>
        <span className="flex min-w-0 items-center gap-3.5">
          <CategoryIcon category={d.category} resolved={d.status === "resolved"} />
          <span className="min-w-0">
            <span className="block text-[15px] font-medium text-ink group-hover:text-green-strong">{d.title}</span>
            <span className="mt-0.5 block truncate text-[13px] text-muted" title={d.summary}>{d.summary}</span>
          </span>
        </span>
        <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-soft md:contents">
          <span>{d.category}</span>
          <span className="tabular">{longDate(d.detectedOn)}</span>
          <span><StatusBadge status={d.status} /></span>
          <span><Evidence value={d.confidence} compact /></span>
          <span className="inline-flex items-center gap-1 font-medium text-green md:justify-end">Open <ArrowRight size={14} aria-hidden /></span>
        </span>
      </Link>
    </li>
  );
}

export function DiscoveryCenter() {
  const { field, followUps } = useApp();
  const { data, error } = useService(`disc:${field.id}:${followUps.length}`, () => getDiscoveries(field.id, followUps));
  const [filter, setFilter] = useState<Filter>("all");
  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;

  const open = data.filter((d) => d.status !== "resolved");
  const shown = data.filter((d) => filter === "all" || (filter === "open" ? d.status !== "resolved" : d.status === "resolved"));

  return (
    <div>
      <PageHeader title="Discovery Center"
        lead="Patterns that depart from this field's own history. Each one is a question to investigate, not a conclusion."
        actions={<Segmented label="Filter discoveries" value={filter} onChange={setFilter}
          options={[{ value: "all", label: `All (${data.length})` }, { value: "open", label: `Open (${open.length})` }, { value: "resolved", label: `Resolved (${data.length - open.length})` }]} />} />

      {shown.length === 0 ? (
        <EmptyState title={data.length === 0 ? `No discoveries for ${field.name}` : "No discoveries match this filter"}>
          {data.length === 0 ? "Recent observations sit within their usual range, so no detector rule is met." : "Choose a different filter to see the others."}
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <div className={`hidden border-b border-line px-6 py-3 text-[13px] font-medium text-muted ${COLUMNS}`}>
            <span className="pl-[50px]">Discovery</span><span>Category</span><span>Detected</span><span>Status</span><span>Confidence</span><span className="text-right">Action</span>
          </div>
          <ul className="divide-y divide-line">{shown.map((d) => <DiscoveryRow key={d.id} d={d} />)}</ul>
        </Card>
      )}

      <Section title="How to read a discovery" className="mt-12">
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Microscope, tone: "bg-green-soft text-green-strong", k: "Observed", t: "What a sensor or satellite recorded, with source and date." },
            { icon: HelpCircle, tone: "bg-amber-soft text-amber", k: "May mean", t: "Possible explanations. Unconfirmed until tested." },
            { icon: CircleCheck, tone: "bg-sunken text-ink-soft", k: "Confirmed", t: "Stated only after follow-up data tests an explanation." },
          ].map(({ icon: Icon, tone, k, t }) => (
            <li key={k} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={19} aria-hidden /></span>
              <span><span className="block text-sm font-medium text-ink">{k}</span><span className="block text-[13px] leading-snug text-muted">{t}</span></span>
            </li>
          ))}
        </ol>
        <div className="mt-8 max-w-3xl">
          <Disclosure title="What the confidence level means">
            <p>Confidence describes how strongly the evidence supports that a pattern is real: how far it departs from the field&apos;s own baseline, and whether independent sources agree. It is a rule-of-thumb grade with three levels (tentative, moderately supported, well supported). It is not a statistical probability, and it says nothing about which explanation is correct.</p>
          </Disclosure>
          <Disclosure title="The four detection rules">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><span className="font-medium text-ink">Moisture divergence:</span> surface moisture falls 5 points or more in 14 days while the 40 cm reading moves 3 points or less.</li>
              <li><span className="font-medium text-ink">Rainfall departure:</span> 14-day rain is below 45% or above 170% of the monthly baseline for the period.</li>
              <li><span className="font-medium text-ink">Vegetation dip:</span> NDVI falls 0.03 or more between composites while the crop is in development or mid-season.</li>
              <li><span className="font-medium text-ink">Source offset:</span> station and satellite moisture differ by 1.5 points or more on average across 20 or more paired days.</li>
            </ul>
            <p className="mt-3">Thresholds are simple, fixed values chosen for the demonstration. A deployed system would tune them to each field&apos;s record.</p>
          </Disclosure>
        </div>
      </Section>
    </div>
  );
}
