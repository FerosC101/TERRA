import { Disclosure } from "@/components/ui";
import { CROP_LIST, cropDuration } from "@/data/crops";
import { fmt } from "@/lib/format";
import { ASSUMPTIONS } from "@/lib/science/waterBalance";
import type { Field } from "@/types";

export function Assumptions({ field }: { field: Field }) {
  const cap = field.soil.awcMmPerM * field.soil.profileDepthM;
  return (
    <div className="space-y-3">
      <Disclosure title="How the water figures are calculated">
        <p><span className="text-silver">Crop water demand:</span> <code className="text-terra-soft">ETc = Kc × ET0</code>. ET0 is the field&apos;s average monthly reference evapotranspiration; Kc changes through the crop&apos;s four growth stages (FAO-56 method).</p>
        <p className="mt-2"><span className="text-silver">Soil-water balance:</span> <code className="text-terra-soft">S(t) = S(t−1) + P − ETa − R − D</code>, in ten-day steps. P is average rainfall for the month, R is runoff, D is drainage once the soil is full, and ETa is ETc reduced when the soil is too dry.</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Root-zone capacity: {fmt(cap)} mm ({field.soil.awcMmPerM} mm/m × {field.soil.profileDepthM} m, typical for {field.soil.texture.toLowerCase()}). Starts {fmt(ASSUMPTIONS.initialStorageShare * 100)}% full.</li>
          <li>Runoff: {fmt(ASSUMPTIONS.runoffCoefficient * 100)}% of rain above {ASSUMPTIONS.runoffThresholdMm} mm in a ten-day step. A fixed assumption, not a slope- or soil-specific estimate.</li>
          <li>Water stress: crop use falls linearly once soil water drops below the crop&apos;s depletion fraction p.</li>
          <li>Between crops and during fallow, bare-soil evaporation uses Kc = {ASSUMPTIONS.bareSoilKc}.</li>
          <li>Rain-fed only. Irrigation is not modelled.</li>
        </ul>
      </Disclosure>
      <Disclosure title="How diversity, cover, nutrients and heat are assessed">
        <ul className="list-disc space-y-1.5 pl-4">
          <li><span className="text-silver">Crop-family diversity:</span> a count of distinct botanical families and of same-family repeats. It reflects pest and disease break potential; it does not measure it.</li>
          <li><span className="text-silver">Soil cover continuity:</span> days with a living crop past early establishment, as a share of the whole period. Residue and mulch are not counted.</li>
          <li><span className="text-silver">Nutrient-management considerations:</span> counts of legume seasons and of heavy feeders in succession. TERRA does not estimate soil nitrogen, fertiliser need or soil organic matter.</li>
          <li><span className="text-silver">Heat exposure:</span> share of mid-season where average monthly maximum temperature exceeds an indicative crop threshold. Thresholds vary by cultivar.</li>
          <li><span className="text-silver">Match to your priorities:</span> a weighted mean of five indicators scaled 0–1 (demand met, family diversity, cover, one minus climate exposure, nutrient index), using your weights. It summarises your stated preferences. It is not a scientifically validated score and does not predict yield or profit.</li>
        </ul>
      </Disclosure>
      <Disclosure title="Crop parameters used">
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[620px] text-xs">
            <thead><tr className="border-b border-line text-left text-muted">{["Crop", "Family", "Kc ini / mid / end", "Days", "p", "Heat threshold", "Basis"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {CROP_LIST.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4 font-medium text-silver">{c.name}</td>
                  <td className="py-2 pr-4">{c.family}</td>
                  <td className="py-2 pr-4">{c.kc.ini} / {c.kc.mid} / {c.kc.end}</td>
                  <td className="py-2 pr-4">{c.id === "fallow" ? "—" : cropDuration(c)}</td>
                  <td className="py-2 pr-4">{c.depletionP}</td>
                  <td className="py-2 pr-4">{c.heatThresholdC === null ? "—" : `${c.heatThresholdC} °C`}</td>
                  <td className="py-2">{c.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2">Indicative values. Calibrate to local cultivars and planting dates before relying on any result.</p>
      </Disclosure>
    </div>
  );
}
