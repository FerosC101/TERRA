import { Disclosure, TABLE } from "@/components/ui";
import { CROP_LIST, cropDuration } from "@/data/crops";
import { fmt } from "@/lib/format";
import { ASSUMPTIONS } from "@/lib/science/waterBalance";
import type { Field } from "@/types";

const TERM = "font-medium text-ink";
const CODE = "rounded bg-sunken px-1.5 py-0.5 font-mono text-[13px] text-ink";

export function Assumptions({ field, realSpan }: { field: Field; realSpan?: string | null }) {
  const cap = field.soil.awcMmPerM * field.soil.profileDepthM;
  return (
    <div className="max-w-4xl">
      <Disclosure title="How the water figures are calculated">
        <p><span className={TERM}>Crop water demand:</span> <code className={CODE}>ETc = Kc × ET0</code>. ET0 is the field&apos;s average monthly reference evapotranspiration. Kc changes through the crop&apos;s four growth stages (FAO-56 method).</p>
        <p className="mt-2"><span className={TERM}>Soil-water balance:</span> <code className={CODE}>S(t) = S(t−1) + P − ETa − R − D</code>, in ten-day steps. P is average rainfall for the month, R is runoff, D is drainage once the soil is full, and ETa is ETc reduced when the soil is too dry.</p>
        <p className="mt-2"><span className={TERM}>Climate inputs:</span> {field.climate.source}.{field.climate.basis === "illustrative" ? " These figures were written for the demonstration and were not retrieved from NASA." : " Maximum temperature is the mean daily maximum, and ET0 is FAO-56 Penman-Monteith computed from the monthly means."}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Root-zone capacity: {fmt(cap)} mm ({field.soil.awcMmPerM} mm per m × {field.soil.profileDepthM} m, {field.soil.source === "soilgrids" ? "ISRIC SoilGrids model estimate" : `typical for ${field.soil.texture.toLowerCase()}`}). It starts {fmt(ASSUMPTIONS.initialStorageShare * 100)}% full.</li>
          <li>Runoff: {fmt(ASSUMPTIONS.runoffCoefficient * 100)}% of rain above {ASSUMPTIONS.runoffThresholdMm} mm in a ten-day step. A fixed assumption, not a slope- or soil-specific estimate.</li>
          <li>Water stress: crop use falls linearly once soil water drops below the crop&apos;s depletion fraction p.</li>
          <li>Between crops and during fallow, bare-soil evaporation uses Kc = {ASSUMPTIONS.bareSoilKc}.</li>
          <li>Rain-fed only. Irrigation is not modelled.</li>
          {realSpan && <li>Real years ({realSpan}): the same model is run once per start year with that year&apos;s ten-day rain from NASA POWER (model, ~50 km grid), in place of the monthly average. ET0 and temperature stay monthly averages.</li>}
        </ul>
      </Disclosure>
      <Disclosure title="How diversity, cover, nutrients and heat are assessed">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><span className={TERM}>Crop-family diversity:</span> a count of distinct botanical families and of same-family repeats. It reflects the potential to break pest and disease cycles; it does not measure it.</li>
          <li><span className={TERM}>Soil cover:</span> days with a living crop past early establishment, as a share of the whole period. Residue and mulch are not counted.</li>
          <li><span className={TERM}>Nutrient management:</span> counts of legume seasons and of heavy feeders in succession. TERRA does not estimate soil nitrogen, fertiliser need or organic matter.</li>
          <li><span className={TERM}>Heat exposure:</span> share of mid-season when the average monthly maximum temperature exceeds an indicative crop threshold. Thresholds vary by cultivar.</li>
        </ul>
      </Disclosure>
      <Disclosure title="Crop parameters used">
        <div className="overflow-x-auto">
          <table className={`${TABLE} tabular min-w-[640px] text-[13px]`}>
            <thead><tr className="border-b border-line text-left text-muted">{["Crop", "Family", "Kc initial / mid / end", "Days", "p", "Heat threshold", "Basis"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {CROP_LIST.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4 font-medium text-ink">{c.name}</td>
                  <td className="py-2 pr-4">{c.id === "fallow" ? "None" : c.family}</td>
                  <td className="py-2 pr-4">{c.kc.ini} / {c.kc.mid} / {c.kc.end}</td>
                  <td className="py-2 pr-4">{c.id === "fallow" ? "n/a" : cropDuration(c)}</td>
                  <td className="py-2 pr-4">{c.depletionP}</td>
                  <td className="py-2 pr-4">{c.heatThresholdC === null ? "n/a" : `${c.heatThresholdC} °C`}</td>
                  <td className="py-2">{c.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2">Indicative values. Calibrate them to local cultivars and planting dates before relying on any result.</p>
      </Disclosure>
    </div>
  );
}
