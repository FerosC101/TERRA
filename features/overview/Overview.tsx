"use client";

import clsx from "clsx";
import { ArrowRight, CalendarDays, MapPin, Ruler, Sprout } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Badge, Card, ErrorState, LINK, Loading, Section } from "@/components/ui";
import { longDate, shortDate } from "@/lib/dates";
import { buildActivity, summariseField, type ActivityItem } from "@/lib/fieldSummary";
import { fmt } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getDiscoveries } from "@/services/discoveryService";
import { getObservations } from "@/services/fieldSensorService";
import type { Discovery, Field } from "@/types";
import { Evidence, severity, StatusBadge } from "../discovery/shared";
import { KeyMeasurements } from "./KeyMeasurements";
import { TrendPanel } from "./TrendPanel";

function FieldHeader({ field, crop, updated }: { field: Field; crop: string; updated: string }) {
  const facts = [
    { icon: MapPin, text: field.location },
    { icon: Ruler, text: `${fmt(field.areaHa, 1)} hectares` },
    { icon: Sprout, text: crop },
    { icon: CalendarDays, text: `Updated ${longDate(updated)}` },
  ];
  return (
    <header className="mb-8">
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">{field.name}</h1>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
        {facts.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-1.5"><Icon size={15} className="text-muted" aria-hidden />{text}</li>
        ))}
      </ul>
    </header>
  );
}

/** The single most important thing TERRA has noticed, in plain language, with what to do next. */
function PrimaryInsight({ lead, openCount }: { lead: Discovery | undefined; openCount: number }) {
  if (!lead) {
    return (
      <Card className="p-6 sm:p-7">
        <p className="text-[13px] font-medium text-green-strong">Nothing unusual right now</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">The latest observations sit within this field&apos;s usual range.</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">TERRA keeps comparing each new reading with the field&apos;s own history and will raise anything that departs from it.</p>
        <Link href="/discoveries" className={clsx(LINK, "mt-4")}>Open Discovery Center <ArrowRight size={15} aria-hidden /></Link>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="p-6 sm:p-7">
          <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
            <Badge tone={severity(lead).tone}>{severity(lead).label}</Badge>
            <span>{lead.category} · detected {longDate(lead.detectedOn)}</span>
          </div>
          <h2 className="mt-3 max-w-2xl text-[22px] font-semibold leading-snug tracking-tight text-ink">{lead.summary}</h2>
          {lead.risk && <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-ink-soft"><span className="font-medium text-ink">Why it matters: </span>{lead.risk}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href={`/discoveries/${lead.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-green px-4 py-2 text-sm font-medium text-white hover:bg-green-strong">
              Investigate <ArrowRight size={15} aria-hidden />
            </Link>
            {openCount > 1 && <Link href="/discoveries" className={LINK}>{openCount - 1} other open {openCount - 1 === 1 ? "discovery" : "discoveries"}</Link>}
          </div>
        </div>
        <div className="border-t border-line bg-sunken/60 p-6 lg:border-l lg:border-t-0">
          <p className="text-[13px] font-medium text-muted">What to check next</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">{lead.nextObservation.action}</p>
          <div className="mt-5">
            <p className="mb-1.5 text-[13px] font-medium text-muted">Strength of the evidence</p>
            <Evidence value={lead.confidence} compact />
          </div>
        </div>
      </div>
    </Card>
  );
}

function RecentDiscoveries({ discoveries }: { discoveries: Discovery[] }) {
  return (
    <Section title="Recent discoveries" actions={<Link href="/discoveries" className={LINK}>View all <ArrowRight size={15} aria-hidden /></Link>}>
      {discoveries.length === 0 ? <p className="text-sm text-muted">None for this field yet.</p> : (
        <ul className="divide-y divide-line border-y border-line">
          {discoveries.slice(0, 4).map((d) => (
            <li key={d.id}>
              <Link href={`/discoveries/${d.id}`} className="group flex items-center gap-4 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink group-hover:text-green-strong">{d.title}</span>
                  <span className="mt-0.5 block text-[13px] text-muted">{d.category} · {shortDate(d.detectedOn)} · {severity(d).label}</span>
                </span>
                <StatusBadge status={d.status} />
                <ArrowRight size={15} className="shrink-0 text-faint group-hover:text-green" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function FieldActivity({ items }: { items: ActivityItem[] }) {
  return (
    <Section title="Field activity">
      <ol>
        {items.map((item, i) => (
          <li key={`${item.date}-${item.title}`} className="relative flex gap-3.5 pb-5 last:pb-0">
            {i < items.length - 1 && <span className="absolute left-[4px] top-3.5 h-full w-px bg-line" aria-hidden />}
            <span className={clsx("relative mt-[7px] h-[9px] w-[9px] shrink-0 rounded-full", item.kind === "discovery" ? "bg-green" : "border-2 border-line-strong bg-surface")} aria-hidden />
            <div className="min-w-0">
              <div className="text-sm text-ink">
                <span className="tabular mr-2 text-muted">{shortDate(item.date)}</span>
                {item.href ? <Link href={item.href} className="font-medium hover:text-green-strong">{item.title}</Link> : <span className="font-medium">{item.title}</span>}
              </div>
              <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{item.detail}</div>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function Overview() {
  const { field, followUps } = useApp();
  const obsQ = useService(`obs:${field.id}`, () => getObservations(field.id));
  const discQ = useService(`disc:${field.id}:${followUps.length}`, () => getDiscoveries(field.id, followUps));

  const obs = obsQ.data;
  const discoveries = useMemo(() => discQ.data ?? [], [discQ.data]);
  const summary = useMemo(() => (obs && obs.length > 15 ? summariseField(field, obs) : null), [field, obs]);
  const activity = useMemo(() => (obs && obs.length ? buildActivity(field, obs, discoveries) : []), [field, obs, discoveries]);

  if (obsQ.error || discQ.error) return <ErrorState message={obsQ.error ?? discQ.error ?? ""} />;
  if (!obs || !summary) return <Loading />;

  const open = discoveries.filter((d) => d.status !== "resolved");
  const stage = summary.stage === "pre" || summary.stage === "post" ? "" : ` · ${summary.stage} stage`;

  return (
    <div>
      <FieldHeader field={field} crop={`${summary.crop.name}, day ${summary.dap} of about ${summary.duration}${stage}`} updated={summary.latest.date} />
      <div className="space-y-10">
        <PrimaryInsight lead={open[0]} openCount={open.length} />
        <Section title="Key measurements" description={`Latest readings for ${field.name}, with the change over the last 14 days.`}>
          <KeyMeasurements summary={summary} />
        </Section>
        <TrendPanel observations={obs} />
        <div className="grid gap-10 lg:grid-cols-2">
          <RecentDiscoveries discoveries={discoveries} />
          <FieldActivity items={activity} />
        </div>
      </div>
    </div>
  );
}
