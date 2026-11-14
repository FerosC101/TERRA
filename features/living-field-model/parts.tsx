import clsx from "clsx";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { Badge, SourceTag, TABLE, TD, TH } from "@/components/ui";
import { SERIES } from "@/lib/chartTheme";
import { longDate, shortDate } from "@/lib/dates";
import { fmt, signed } from "@/lib/format";
import type { DimensionKey, NasaSnapshot, Provenance, Relationship } from "@/types";
import { strength } from "./state";

export const DIMENSION_LABEL: Record<DimensionKey, string> = { water: "Water", soil: "Soil", vegetation: "Vegetation", climate: "Climate", rotation: "Crop rotation" };

export function ChartBlock({ title, source, children }: { title: string; source: Provenance; children: React.ReactNode }) {
  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium text-ink">{title}</span>
        <SourceTag kind={source} />
      </figcaption>
      {children}
    </figure>
  );
}

/** How this dimension moves with the others in this field's record. Words first, the statistic second. */
export function Relationships({ dim, relationships }: { dim: DimensionKey; relationships: Relationship[] }) {
  const related = relationships.filter((r) => r.from === dim || r.to === dim);
  if (related.length === 0) return <p className="text-sm text-muted">No relationship with the other dimensions has been measured in this record.</p>;
  return (
    <div>
      <ul className="divide-y divide-line border-y border-line">
        {related.map((r) => {
          const s = strength(r.r);
          const other = r.from === dim ? r.to : r.from;
          return (
            <li key={r.label} className="grid gap-x-6 gap-y-1 py-3.5 sm:grid-cols-[minmax(0,1fr)_300px]">
              <div>
                <p className="text-sm font-medium text-ink">{r.label} <span className="font-normal text-muted">· with {DIMENSION_LABEL[other].toLowerCase()}</span></p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{r.note}</p>
              </div>
              <div className="flex items-center gap-2.5 sm:justify-end">
                <span className="flex gap-0.5" aria-hidden>{[1, 2, 3].map((i) => <span key={i} className={clsx("h-1.5 w-4 rounded-full", i <= s.level ? "bg-violet" : "bg-line-strong")} />)}</span>
                <span className="tabular text-[13px] text-ink-soft">{s.label} {r.r < 0 ? "inverse " : ""}link <span className="text-faint">(r = {signed(r.r, 2)}, n = {r.n})</span></span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">Relationships are correlations within this field&apos;s own record. They suggest where to look and do not establish cause.</p>
    </div>
  );
}

export function ProvenanceList({ items }: { items: { kind: Provenance; text: string }[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.text} className="grid gap-x-4 gap-y-0.5 text-[13px] leading-relaxed sm:grid-cols-[150px_minmax(0,1fr)]">
          <SourceTag kind={it.kind} /><span className="text-ink-soft">{it.text}</span>
        </li>
      ))}
    </ul>
  );
}

const QUALITY: Record<NasaSnapshot["records"][number]["quality"], { label: string; tone: "good" | "warning" | "neutral" | "critical" }> = {
  VALID: { label: "Valid", tone: "good" },
  VALID_WITH_WARNINGS: { label: "Valid, with warnings", tone: "warning" },
  INCOMPLETE: { label: "Incomplete", tone: "neutral" },
  INVALID: { label: "Invalid", tone: "critical" },
};

/** The real record retrieved by the data pipeline. Shown on its own: it is never blended into the demo series. */
export function NasaRecord({ snapshot }: { snapshot: NasaSnapshot }) {
  const overpasses = snapshot.records.filter((r) => r.smapVwc !== null).length;
  return (
    <div className="rounded-xl border border-line bg-sunken/50 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <h3 className="text-[15px] font-semibold text-ink">Retrieved NASA record</h3>
        <Badge tone="good">Real data</Badge>
      </div>
      <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">{longDate(snapshot.start)} to {longDate(snapshot.end)}. {snapshot.note}</p>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <ChartBlock title="Daily rainfall from two NASA products" source="satellite">
          <SeriesChart data={snapshot.records} xKey="date" xFormat={shortDate} unit="mm per day" height={200} ariaLabel="Daily rainfall from NASA POWER and GPM IMERG" series={[
            { key: "rainPowerMm", label: "NASA POWER, ~50 km", color: SERIES.violet, type: "bar" },
            { key: "rainImergMm", label: "GPM IMERG, ~10 km", color: SERIES.blue, type: "bar" },
          ]} />
        </ChartBlock>
        <ChartBlock title="SMAP surface soil moisture" source="satellite">
          <SeriesChart data={snapshot.records} xKey="date" xFormat={shortDate} unit="% volumetric water content" height={200} domain={[30, 60]} ariaLabel="SMAP surface soil moisture on overpass days"
            series={[{ key: "smapVwc", label: "SMAP, ~9 km", color: SERIES.blue, pointsOnly: true }]} />
        </ChartBlock>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">SMAP passed over the area on {overpasses} of {snapshot.records.length} days. Days without an overpass are left empty: nothing is filled in or joined. The two rainfall products differ because they are independent estimates at different scales.</p>
      <details className="group mt-4">
        <summary className="cursor-pointer text-sm font-medium text-green hover:text-green-strong">Show the daily records</summary>
        <div className="mt-3 overflow-x-auto">
          <table className={`${TABLE} tabular min-w-[720px] text-[13px]`}>
            <thead><tr>{["Date", "Air temp. mean", "Rain, POWER", "Rain, IMERG", "Reference ET", "SMAP moisture", "Quality"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {snapshot.records.map((r) => (
                <tr key={r.date}>
                  <td className={`${TD} whitespace-nowrap text-ink`}>{shortDate(r.date)}</td>
                  <td className={TD}>{r.airTempC === null ? "Unavailable" : `${fmt(r.airTempC, 1)} °C`}</td>
                  <td className={TD}>{r.rainPowerMm === null ? "Unavailable" : `${fmt(r.rainPowerMm, 1)} mm`}</td>
                  <td className={TD}>{r.rainImergMm === null ? "Unavailable" : `${fmt(r.rainImergMm, 1)} mm`}</td>
                  <td className={TD}>{r.et0Mm === null ? "Unavailable" : `${fmt(r.et0Mm, 1)} mm`}</td>
                  <td className={TD}>{r.smapVwc === null ? <span className="text-faint">No overpass</span> : `${fmt(r.smapVwc, 1)} %`}</td>
                  <td className={TD}><Badge tone={QUALITY[r.quality].tone}>{QUALITY[r.quality].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">Quality labels come from the pipeline. &ldquo;Incomplete&rdquo; marks days with no SMAP overpass. SMAP values carry the product&apos;s own advisory flag for vegetation and terrain, so read them as indicative.</p>
      </details>
    </div>
  );
}
