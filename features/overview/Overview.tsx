"use client";

import clsx from "clsx";
import { ArrowRight, CheckCircle2, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Card, ErrorState, LINK, Loading, Section } from "@/components/ui";
import { CropImage } from "@/components/visual/Crop";
import { GrowthBar } from "@/components/visual/GrowthBar";
import { addDays, longDate, shortDate } from "@/lib/dates";
import { buildActivity, summariseField, type ActivityItem, type FieldSummary } from "@/lib/fieldSummary";
import { fmt } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getDiscoveries } from "@/services/discoveryService";
import { getObservations } from "@/services/fieldSensorService";
import type { Discovery, Field } from "@/types";
import { CategoryIcon, Evidence, severity, StatusBadge } from "../discovery/shared";
import { FieldStation } from "./FieldStation";
import { KeyMeasurements } from "./KeyMeasurements";
import { TrendPanel } from "./TrendPanel";

/*
 * Type scale used on this page, top to bottom:
 *   page title 30 · card headline 20 · section title 17 · card title 15 · body 14 · meta 12–13
 * Every card uses the same padding (p-6) and every row the same gap (gap-6), so edges line up.
 */

const STAGE_LABEL: Record<string, string> = {
  pre: "Not yet planted", initial: "Establishment", development: "Development", "mid-season": "Mid-season", late: "Late season", post: "Ready to harvest",
};

function PageHeader({ field, summary }: { field: Field; summary: FieldSummary }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-green-strong">Field overview</p>
        <h1 className="mt-1 text-[30px] font-semibold leading-tight tracking-tight text-ink">{field.name}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {field.location} <span aria-hidden>·</span> <span className="tabular">{fmt(field.areaHa, 1)} ha</span> <span aria-hidden>·</span> {field.soil.texture}
          {" "}<span aria-hidden>·</span> Updated <span className="tabular">{longDate(summary.latest.date)}</span>
        </p>
      </div>
      <Link href="/explorer" className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink shadow-card hover:border-line-strong">
        <MapIcon size={16} className="text-green" aria-hidden /> Open map
      </Link>
    </header>
  );
}

/** The one thing to act on, with what to check next and the other open discoveries underneath. */
function NeedsAttention({ open }: { open: Discovery[] }) {
  const lead = open[0];
  if (!lead) {
    return (
      <Card className="flex h-full flex-col justify-center p-6">
        <span className="flex items-center gap-2 text-[13px] font-medium text-green-strong"><CheckCircle2 size={16} aria-hidden /> Nothing unusual right now</span>
        <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-ink">The latest readings sit within this field&apos;s usual range.</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">TERRA compares each new reading with the field&apos;s own history and will raise anything that departs from it.</p>
        <Link href="/discoveries" className={clsx(LINK, "mt-4")}>Open Discovery Center <ArrowRight size={15} aria-hidden /></Link>
      </Card>
    );
  }
  const rest = open.slice(1, 3);
  const sev = severity(lead);
  return (
    <Card className="flex h-full flex-col p-6">
      <div className="flex items-start gap-4">
        <CategoryIcon category={lead.category} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted">
            <span className={clsx("font-medium", sev.tone === "warning" ? "text-amber" : "text-ink")}>{sev.label}</span>
            <span aria-hidden> · </span>{lead.category}<span aria-hidden> · </span>{shortDate(lead.detectedOn)}
          </p>
          <h2 className="mt-1 text-xl font-semibold leading-snug tracking-tight text-ink">{lead.summary}</h2>
          {lead.risk && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{lead.risk}</p>}
        </div>
      </div>

      <dl className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:pl-[52px]">
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted">Check next</dt>
          <dd className="mt-1 text-sm leading-relaxed text-ink">{lead.nextObservation.action}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">Evidence</dt>
          <dd className="mt-1.5"><Evidence value={lead.confidence} compact /></dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-5 sm:pl-[52px]">
        <Link href={`/discoveries/${lead.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-green px-4 py-2 text-sm font-medium text-white hover:bg-green-strong">
          Investigate <ArrowRight size={15} aria-hidden />
        </Link>
        {rest.length > 0 && (
          <span className="min-w-0 text-[13px] text-muted">
            Also open:{" "}
            {rest.map((d, i) => (
              <span key={d.id}>{i > 0 && ", "}<Link href={`/discoveries/${d.id}`} className="font-medium text-ink-soft underline-offset-2 hover:text-green-strong hover:underline">{d.title}</Link></span>
            ))}
            {open.length > 3 && <> and <Link href="/discoveries" className="font-medium text-ink-soft hover:text-green-strong">{open.length - 3} more</Link></>}
          </span>
        )}
      </div>
    </Card>
  );
}

function CropCard({ field, summary }: { field: Field; summary: FieldSummary }) {
  const harvest = addDays(field.plantedOn, summary.duration);
  const fallow = field.fallow && summary.latest.date >= field.fallow.since ? field.fallow : null;
  if (fallow || summary.dap < 0) {
    // Nothing in the ground on the record's last day: fallow after a harvest, or a planting still ahead.
    return (
      <Card className="flex h-full flex-col justify-between gap-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">Current crop</p>
            <p className="mt-1 text-xl font-semibold leading-tight tracking-tight text-ink">{fallow ? "Fallow" : summary.crop.name}</p>
            <p className="mt-1 text-sm text-ink-soft">{fallow ? `Last crop: ${summary.crop.name}, harvested ${shortDate(fallow.since)}` : "Not yet planted"}</p>
          </div>
          <CropImage id={fallow ? "fallow" : summary.crop.id} size="lg" />
        </div>
        <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px]">
          <div><dt className="text-xs text-muted">{fallow ? "Last harvest" : "As of"}</dt><dd className="tabular mt-0.5 font-medium text-ink">{shortDate(fallow ? fallow.since : summary.latest.date)}</dd></div>
          <div>
            <dt className="text-xs text-muted">Next planting (planned)</dt>
            <dd className="mt-0.5 font-medium text-ink">{fallow ? fallow.next : shortDate(field.plantedOn)}</dd>
          </div>
        </dl>
      </Card>
    );
  }
  return (
    <Card className="flex h-full flex-col justify-between gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">Current crop</p>
          <p className="mt-1 text-xl font-semibold leading-tight tracking-tight text-ink">{summary.crop.name}</p>
          <p className="mt-1 text-sm text-ink-soft">{STAGE_LABEL[summary.stage] ?? summary.stage} · {summary.crop.familyCommon} family</p>
        </div>
        <CropImage id={summary.crop.id} size="lg" />
      </div>
      <div>
        <div className="mb-2 flex items-baseline justify-between text-[13px]">
          <span className="font-medium text-ink">Day <span className="tabular">{summary.dap}</span></span>
          <span className="tabular text-muted">of ~{summary.duration}</span>
        </div>
        <GrowthBar crop={summary.crop} day={summary.dap} />
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px]">
          <div><dt className="text-xs text-muted">Planted</dt><dd className="tabular mt-0.5 font-medium text-ink">{shortDate(field.plantedOn)}</dd></div>
          <div>
            <dt className="text-xs text-muted" title="Planting date plus the crop's typical season length">Expected harvest</dt>
            <dd className="tabular mt-0.5 font-medium text-ink">~{shortDate(harvest)}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

/** Discoveries and field events on one timeline, newest first. */
function Activity({ items, discoveries }: { items: ActivityItem[]; discoveries: Discovery[] }) {
  const byHref = new Map(discoveries.map((d) => [`/discoveries/${d.id}`, d]));
  return (
    <Card className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-[15px] font-semibold text-ink">Recent activity</h2>
        <Link href="/discoveries" className={LINK}>All discoveries <ArrowRight size={15} aria-hidden /></Link>
      </div>
      <ol className="flex-1">
        {items.map((item, i) => {
          const d = item.href ? byHref.get(item.href) : undefined;
          return (
            <li key={`${item.date}-${item.title}`} className="relative grid grid-cols-[52px_14px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
              <span className="tabular pt-px text-right text-xs text-muted">{shortDate(item.date)}</span>
              <span className="relative flex justify-center" aria-hidden>
                {i < items.length - 1 && <span className="absolute top-3 h-[calc(100%+4px)] w-px bg-line" />}
                <span className={clsx("relative mt-[5px] h-2.5 w-2.5 rounded-full", item.kind === "discovery" ? "bg-amber" : "border-2 border-line-strong bg-surface")} />
              </span>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  {item.href
                    ? <Link href={item.href} className="text-sm font-medium leading-snug text-ink hover:text-green-strong">{item.title}</Link>
                    : <span className="text-sm font-medium leading-snug text-ink">{item.title}</span>}
                  {d && <StatusBadge status={d.status} />}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted">{item.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
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

  return (
    <div>
      <PageHeader field={field} summary={summary} />
      <div className="space-y-10">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><NeedsAttention open={open} /></div>
          <CropCard field={field} summary={summary} />
        </div>

        <Section title="Conditions now" description={`Latest readings, ${longDate(summary.latest.date)}. Lines show the last 30 days.`}
          info="Each value states its source. Changes are over the last 14 days unless stated.">
          <KeyMeasurements field={field} summary={summary} observations={obs} />
        </Section>

        <TrendPanel observations={obs} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <FieldStation field={field} latest={summary.latest} />
          <Activity items={activity} discoveries={discoveries} />
        </div>
      </div>
    </div>
  );
}
