import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, FileDown } from "lucide-react";
import { measurementsApi } from "@/services/endpoints";
import { downloadFile } from "@/services/api";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { COLORS, TrendChart } from "@/components/dashboard/charts";
import { fmtDate } from "@/utils/format";
import { cn } from "@/utils/cn";
import type { SeriesPoint } from "@/types";

const RANGES = [{ k: "30", label: "30 days" }, { k: "90", label: "90 days" }, { k: "365", label: "1 year" }, { k: "all", label: "All time" }, { k: "custom", label: "Custom" }];

const CHARTS: { key: string; title: string; unit: string; bar?: boolean; note?: string }[] = [
  { key: "weight", title: "Weight", unit: "kg", note: "Entries in lb are converted to kg for this chart; originals are kept." },
  { key: "bmi_calculated", title: "BMI (calculated)", unit: "kg/m²", note: "Calculated from weight and your latest height. A screening figure only — not a diagnosis." },
  { key: "heart_rate", title: "Heart rate", unit: "bpm" },
  { key: "sleep", title: "Sleep", unit: "hours", bar: true },
  { key: "blood_glucose", title: "Blood glucose", unit: "mg/dL", note: "mmol/L entries converted (×18) for this chart." },
  { key: "water", title: "Water intake", unit: "ml", bar: true },
];

function toCsv(series: Record<string, SeriesPoint[]>) {
  const rows = [["type", "recorded_at_utc", "original_value", "original_unit", "diastolic", "normalized_value", "normalized_unit"]];
  for (const [k, pts] of Object.entries(series)) {
    if (k === "bmi_calculated") continue;
    for (const p of pts) rows.push([k, p.t, String(p.original_value ?? p.value), p.original_unit ?? p.unit, p.diastolic != null ? String(p.diastolic) : "", String(p.value), p.unit]);
  }
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}

export default function Analytics() {
  const [range, setRange] = useState("90");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { start, end } = useMemo(() => {
    if (range === "custom") return { start: from ? new Date(from + "T00:00:00").toISOString() : undefined, end: to ? new Date(to + "T23:59:59").toISOString() : undefined };
    if (range === "all") return { start: undefined, end: undefined };
    return { start: new Date(Date.now() - Number(range) * 86400_000).toISOString(), end: undefined };
  }, [range, from, to]);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["analytics", start, end], queryFn: () => measurementsApi.analytics(start, end) });

  const exportCsv = () => {
    if (!data) return;
    const blob = new Blob([toCsv(data.series)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `measurements-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const bp = (data?.series.blood_pressure ?? []).map((p) => ({ t: p.t, systolic: p.systolic, diastolic: p.diastolic }));
  const hasAny = data && Object.entries(data.series).some(([, v]) => v.length);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <PageHeader title="Health Analytics" description="Trends from the measurements you've recorded. Charts show your data only — no conclusions are drawn."
        actions={<>
          <Button variant="outline" onClick={exportCsv} disabled={!hasAny}><FileDown className="size-4" /> Export CSV</Button>
          <Button onClick={() => downloadFile("/reports/health-summary?days=" + (range === "all" || range === "custom" ? 3650 : range), "health-summary.md")}><Download className="size-4" /> Health summary</Button>
        </>} />
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button key={r.k} onClick={() => setRange(r.k)} aria-pressed={range === r.k}
            className={cn("rounded-full border px-3 py-1 text-sm", range === r.k ? "border-navy bg-navy text-white dark:text-[#0b1320]" : "border-line bg-surface text-ink-2 hover:bg-surface-2")}>{r.label}</button>
        ))}
        {range === "custom" && (<div className="flex items-center gap-2">
          <Input type="date" aria-label="From date" className="h-8 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-muted">–</span>
          <Input type="date" aria-label="To date" className="h-8 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>)}
      </div>
      {isLoading ? <LoadingBlock /> : error || !data ? <ErrorState error={error} onRetry={refetch} /> : !hasAny ? (
        <Card><EmptyState icon={<BarChart3 className="size-5" />} title="No measurements in this period" description="Record measurements to see trends here, or choose a longer date range." /></Card>
      ) : (<>
        <Card>
          <CardHeader title="Blood pressure" description="Systolic and diastolic, mmHg" />
          <CardBody>{bp.length ? <TrendChart data={bp} unit="mmHg" height={260} series={[{ key: "systolic", label: "Systolic", color: COLORS.navy }, { key: "diastolic", label: "Diastolic", color: COLORS.teal }]} />
            : <p className="py-6 text-center text-sm text-muted">No blood pressure readings in this period.</p>}</CardBody>
        </Card>
        <div className="grid gap-5 lg:grid-cols-2">
          {CHARTS.map((c) => {
            const pts = data.series[c.key] ?? [];
            const s = data.stats[c.key];
            return (
              <Card key={c.key}>
                <CardHeader title={c.title} description={s ? `${s.count} readings · min ${s.min} · max ${s.max} · avg ${s.avg} ${c.unit}` : c.unit} />
                <CardBody>
                  {pts.length ? <TrendChart data={pts.map((p) => ({ t: p.t, value: p.value }))} unit={c.unit} bar={c.bar} series={[{ key: "value", label: c.title, color: COLORS.teal }]} />
                    : <p className="py-6 text-center text-sm text-muted">{c.key === "bmi_calculated" && !data.height_cm_used_for_bmi ? "Add your height in your Health Profile to calculate BMI." : "No data in this period."}</p>}
                  {c.note && pts.length > 0 && <p className="mt-2 text-xs text-muted">{c.note}</p>}
                </CardBody>
              </Card>
            );
          })}
        </div>
        <Card>
          <CardHeader title="Measurement history summary" />
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-4 font-medium">Type</th><th className="py-2 pr-4 font-medium">Readings</th><th className="py-2 pr-4 font-medium">Min</th><th className="py-2 pr-4 font-medium">Max</th><th className="py-2 pr-4 font-medium">Average</th><th className="py-2 font-medium">Latest</th></tr></thead>
              <tbody className="divide-y divide-line">{Object.entries(data.stats).map(([k, s]) => (
                <tr key={k}><td className="py-2 pr-4 text-ink">{k.replace(/_/g, " ")}</td><td className="py-2 pr-4">{s.count}</td><td className="py-2 pr-4">{s.min}</td><td className="py-2 pr-4">{s.max}</td><td className="py-2 pr-4">{s.avg}</td>
                  <td className="py-2 text-ink-2">{s.latest.systolic ? `${s.latest.systolic}/${s.latest.diastolic}` : s.latest.value} {s.latest.unit} · {fmtDate(s.latest.t)}</td></tr>
              ))}</tbody>
            </table>
          </CardBody>
        </Card>
      </>)}
    </div>
  );
}
