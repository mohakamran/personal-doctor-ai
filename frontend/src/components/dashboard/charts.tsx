import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from "recharts";
import { fmtDate } from "@/utils/format";

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12, color: "var(--ink)" },
  labelStyle: { color: "var(--muted)" },
};

export interface ChartSeries { key: string; label: string; color: string }

export function TrendChart({ data, series, unit, height = 220, refLine, bar }: {
  data: Record<string, unknown>[]; series: ChartSeries[]; unit?: string; height?: number;
  refLine?: { y: number; label: string }; bar?: boolean;
}) {
  const tick = (v: string) => fmtDate(v, { month: "short", day: "numeric" });
  const C = bar ? BarChart : LineChart;
  return (
    <div style={{ height }} role="img" aria-label={`Chart of ${series.map((s) => s.label).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <C data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="t" tickFormatter={tick} {...axis} minTickGap={24} />
          <YAxis {...axis} domain={["auto", "auto"]} width={48} />
          <Tooltip {...tooltipStyle} labelFormatter={(v) => fmtDate(String(v), { dateStyle: "medium", timeStyle: "short" })}
            formatter={(v: number, name: string) => [`${v}${unit ? ` ${unit}` : ""}`, name]} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {refLine && <ReferenceLine y={refLine.y} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: refLine.label, fontSize: 10, fill: "var(--muted)", position: "insideTopRight" }} />}
          {series.map((s) => bar
            ? <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
            : <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2}
                dot={{ r: 2.5, strokeWidth: 0, fill: s.color }} activeDot={{ r: 4 }} connectNulls />)}
        </C>
      </ResponsiveContainer>
    </div>
  );
}

export const COLORS = { teal: "var(--teal)", navy: "var(--navy)", warn: "var(--warn)", danger: "var(--danger)" };
