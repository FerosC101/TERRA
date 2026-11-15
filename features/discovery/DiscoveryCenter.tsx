"use client";

import { ArrowRight, ChevronDown, CircleCheck, HelpCircle, Microscope } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card, Disclosure, EmptyState, ErrorState, Loading, Notice, PageHeader, Section, Segmented } from "@/components/ui";
import { longDate } from "@/lib/dates";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getDetectorReport } from "@/services/detectorStatusService";
import { getDiscoveries } from "@/services/discoveryService";
import type { Discovery } from "@/types";
import { CategoryIcon, Evidence, StatusBadge } from "./shared";

type Filter = "all" | "open" | "resolved";

/** Alarms shown in each list of a real field before it is expanded; a real record can hold many (42 at Lipa). */
const PREVIEW = 3;

/** An alarm built on a simulated or assumed input (D-020): one of its evidence rows is tagged simulated. */
const onSimulatedInput = (d: Discovery) => d.observations.some((o) => o.provenance === "simulated");

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

/** One list of alarms; when `preview` is set, only that many show until the list is expanded. */
function DiscoveryTable({ items, preview, noun }: { items: Discovery[]; preview?: number; noun: string }) {
  const [expanded, setExpanded] = useState(false);
  const hidden = preview === undefined ? 0 : Math.max(0, items.length - preview);
  const visible = expanded || hidden === 0 ? items : items.slice(0, preview);
  return (
    <Card className="overflow-hidden">
      <div className={`hidden border-b border-line px-6 py-3 text-[13px] font-medium text-muted ${COLUMNS}`}>
        <span className="pl-[50px]">Discovery</span><span>Category</span><span>Detected</span><span>Status</span><span>Confidence</span><span className="text-right">Action</span>
      </div>
      <ul className="divide-y divide-line">{visible.map((d) => <DiscoveryRow key={d.id} d={d} />)}</ul>
      {hidden > 0 && (
        <div className="flex justify-center border-t border-line py-2">
          <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-green hover:bg-sunken">
            {expanded ? `Show fewer ${noun}` : `Show ${hidden} earlier ${noun}`}
            <ChevronDown size={16} aria-hidden className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
        </div>
      )}
    </Card>
  );
}

export function DiscoveryCenter() {
  const { field, followUps } = useApp();
  const { data, error } = useService(`disc:${field.id}:${followUps.length}`, () => getDiscoveries(field.id, followUps));
  const report = useService(`detectors:${field.id}`, () => getDetectorReport(field.id)).data;
  const [filter, setFilter] = useState<Filter>("all");
  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;

  const open = data.filter((d) => d.status !== "resolved");
  const blocked = report?.detectors.filter((d) => d.blocked) ?? [];
  const simulated = report?.detectors.filter((d) => d.simulatedInput) ?? [];
  const shown = data.filter((d) => filter === "all" || (filter === "open" ? d.status !== "resolved" : d.status === "resolved"));
  // A real field keeps alarms from real data apart from those built on simulated or assumed inputs (D-020).
  const split = !!report?.real;
  const fromReal = split ? shown.filter((d) => !onSimulatedInput(d)) : shown;
  const fromSimulated = split ? shown.filter(onSimulatedInput) : [];

  return (
    <div>
      <PageHeader title="Discovery Center"
        lead="Patterns that depart from this field's own history. Each one is a question to investigate, not a conclusion."
        actions={<Segmented label="Filter discoveries" value={filter} onChange={setFilter}
          options={[{ value: "all", label: `All (${data.length})` }, { value: "open", label: `Open (${open.length})` }, { value: "resolved", label: `Resolved (${data.length - open.length})` }]} />} />

      {report?.real && (
        <div className="mb-5 space-y-2">
          <Notice>
            Found by the Discovery Engine on this field&apos;s real NASA record, {longDate(report.recordStart)} to {longDate(report.recordEnd)}.
          </Notice>
          {blocked.length > 0 && (
            <Notice tone="caution">
              {blocked.length} of {report.detectors.length} rules cannot raise an alarm on this field, so their absence below says nothing about the field:
              {blocked.map((d) => <span key={d.kind} className="mt-1 block"><span className="font-medium text-ink">{d.name}.</span> {d.blocked}</span>)}
            </Notice>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState title={data.length === 0 ? `No discoveries for ${field.name}` : "No discoveries match this filter"}>
          {data.length === 0 ? "Recent observations sit within their usual range, so no detector rule is met." : "Choose a different filter to see the others."}
        </EmptyState>
      ) : !split ? (
        <DiscoveryTable items={shown} noun="alarms" />
      ) : (
        <div className="space-y-10">
          <div>
            <h2 className="mb-3 text-[15px] font-semibold text-ink">From real NASA data <span className="font-normal text-muted">({fromReal.length})</span></h2>
            {fromReal.length > 0 ? <DiscoveryTable key={`real-${filter}`} items={fromReal} preview={PREVIEW} noun="alarms" />
              : <p className="text-[13px] text-muted">None match this filter.</p>}
          </div>
          {simulated.length > 0 && (
            <div>
              <h2 className="mb-2 text-[15px] font-semibold text-ink">From simulated or assumed inputs <span className="font-normal text-muted">({fromSimulated.length})</span></h2>
              <div className="mb-3">
                <Notice tone="caution">
                  No probe is installed and this area has no crop calendar, so these rules run on stand-in inputs. They show the rules working on this field&apos;s real weather; they are not evidence about the field and are kept out of experiments and model reports (D-020).
                  {simulated.map((d) => <span key={d.kind} className="mt-1 block"><span className="font-medium text-ink">{d.name}:</span> {d.simulatedInput}.</span>)}
                </Notice>
              </div>
              {fromSimulated.length > 0 ? <DiscoveryTable key={`sim-${filter}`} items={fromSimulated} preview={PREVIEW} noun="simulated-input alarms" />
                : <p className="text-[13px] text-muted">None match this filter.</p>}
            </div>
          )}
        </div>
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
          <Disclosure title={`The ${report?.detectors.length ?? "four"} detection rules on this field`}>
            <ul className="list-disc space-y-1.5 pl-5">
              {report?.detectors.map((d) => (
                <li key={d.kind}>
                  <span className="font-medium text-ink">{d.name}:</span> {d.rule}{" "}
                  {d.simulatedInput && <span className="font-medium text-amber">Runs on {d.simulatedInput}. </span>}
                  <span className="text-muted">Decided on {d.decidedDays} of {d.totalDays} days; {d.onsets} alarm{d.onsets === 1 ? "" : "s"} in the record.</span>
                </li>
              ))}
            </ul>
            <p className="mt-3">A day counts as decided when the rule had the data to say yes or no. Alarms are counted once per pattern, on the day it starts.</p>
          </Disclosure>
        </div>
      </Section>
    </div>
  );
}
