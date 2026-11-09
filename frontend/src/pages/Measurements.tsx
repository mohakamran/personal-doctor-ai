import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Plus, Ruler, Trash2, Pencil } from "lucide-react";
import { measurementsApi } from "@/services/endpoints";
import { useAuth } from "@/contexts/AuthContext";
import { useAppMutation } from "@/hooks/useCrud";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { COLORS, TrendChart } from "@/components/dashboard/charts";
import { MEASUREMENT_META, defaultUnit, fmtDateTime, fmtMeasurement, isoToLocalInput, localInputToIso, nowLocalInput, orNull } from "@/utils/format";
import type { Measurement, MeasurementType } from "@/types";
import { cn } from "@/utils/cn";

const TYPES = Object.keys(MEASUREMENT_META) as MeasurementType[];
type MForm = { type: MeasurementType; value: string; value2: string; unit: string; recorded_at: string; notes: string };

function MeasurementDialog({ item, initialType, onClose }: { item: Measurement | null; initialType: MeasurementType; onClose: () => void }) {
  const { user } = useAuth();
  const system = user?.unit_system ?? "metric";
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<MForm>({
    defaultValues: item
      ? { type: item.type, value: String(item.value), value2: item.value2 != null ? String(item.value2) : "", unit: item.unit, recorded_at: isoToLocalInput(item.recorded_at), notes: item.notes ?? "" }
      : { type: initialType, value: "", value2: "", unit: defaultUnit(initialType, system), recorded_at: nowLocalInput(), notes: "" },
  });
  const type = watch("type");
  const save = useAppMutation((v: MForm) => {
    const body = { type: v.type, value: Number(v.value), value2: v.type === "blood_pressure" ? Number(v.value2) : null, unit: v.unit,
      recorded_at: localInputToIso(v.recorded_at), notes: orNull(v.notes), source: item?.source ?? "manual" };
    return item ? measurementsApi.update(item.id, body) : measurementsApi.create(body);
  }, { invalidate: [["measurements"], ["analytics"], ["profile"]], success: "Measurement saved.", onSuccess: onClose });

  const num = { required: "Required.", validate: (v: string) => (v !== "" && !Number.isNaN(Number(v))) || "Enter a number." };
  return (
    <Dialog open onClose={onClose} title={item ? "Edit measurement" : "Add measurement"}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="m-form" loading={save.isPending}>Save</Button></>}>
      <form id="m-form" className="grid gap-4 sm:grid-cols-2" noValidate
        onSubmit={handleSubmit((v) => { setServerError(null); save.mutate(v, { onError: (e) => setServerError(e.message) }); })}>
        <Field label="Type">{(id) => (
          <Select id={id} disabled={!!item} {...register("type", { onChange: (e) => setValue("unit", defaultUnit(e.target.value, system)) })}>
            {TYPES.map((t) => <option key={t} value={t}>{MEASUREMENT_META[t].label}</option>)}
          </Select>)}</Field>
        <Field label="Unit">{(id) => <Select id={id} {...register("unit")}>{MEASUREMENT_META[type].units.map((u) => <option key={u} value={u}>{u === "kg/m2" ? "kg/m²" : u}</option>)}</Select>}</Field>
        {type === "blood_pressure" ? (<>
          <Field label="Systolic (top number)" required error={errors.value?.message}>{(id) => <Input id={id} type="number" inputMode="numeric" autoFocus {...register("value", num)} />}</Field>
          <Field label="Diastolic (bottom number)" required error={errors.value2?.message}>{(id) => <Input id={id} type="number" inputMode="numeric" {...register("value2", num)} />}</Field>
        </>) : (
          <Field label="Value" required error={errors.value?.message}>{(id) => <Input id={id} type="number" step="any" inputMode="decimal" autoFocus {...register("value", num)} />}</Field>
        )}
        <Field label="Recorded at" required>{(id) => <Input id={id} type="datetime-local" max={nowLocalInput()} {...register("recorded_at", { required: true })} />}</Field>
        <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} placeholder="e.g. after exercise, morning reading" {...register("notes")} />}</Field>
        {serverError && <p className="text-sm text-danger sm:col-span-2" role="alert">{serverError}</p>}
      </form>
    </Dialog>
  );
}

export default function Measurements() {
  const [filter, setFilter] = useState<MeasurementType | "all">("all");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["measurements", filter], queryFn: () => measurementsApi.list(filter === "all" ? {} : { type: filter }),
  });
  const [dlg, setDlg] = useState<{ item: Measurement | null } | null>(null);
  const [del, setDel] = useState<Measurement | null>(null);
  const remove = useAppMutation((id: string) => measurementsApi.remove(id), { invalidate: [["measurements"], ["analytics"]], success: "Measurement deleted.", onSuccess: () => setDel(null) });

  const chartData = filter !== "all" && data?.length
    ? [...data].reverse().map((m) => ({ t: m.recorded_at, value: m.value, diastolic: m.value2 })) : [];
  const units = new Set(data?.map((m) => m.unit));

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader title="Measurements" description="Values are stored exactly as entered, with their original units."
        actions={<Button onClick={() => setDlg({ item: null })}><Plus className="size-4" /> Add measurement</Button>} />
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by type">
        {(["all", ...TYPES] as const).map((t) => (
          <button key={t} role="tab" aria-selected={filter === t} onClick={() => setFilter(t)}
            className={cn("rounded-full border px-3 py-1 text-sm", filter === t ? "border-navy bg-navy text-white dark:text-[#0b1320]" : "border-line bg-surface text-ink-2 hover:bg-surface-2")}>
            {t === "all" ? "All" : MEASUREMENT_META[t].label}
          </button>
        ))}
      </div>
      {chartData.length > 1 && units.size === 1 && (
        <Card className="mb-4 p-4">
          <TrendChart data={chartData} unit={[...units][0]} series={filter === "blood_pressure"
            ? [{ key: "value", label: "Systolic", color: COLORS.navy }, { key: "diastolic", label: "Diastolic", color: COLORS.teal }]
            : [{ key: "value", label: MEASUREMENT_META[filter as MeasurementType].label, color: COLORS.teal }]} />
        </Card>
      )}
      {chartData.length > 1 && units.size > 1 && <p className="mb-4 text-xs text-muted">Mixed units recorded — see Health Analytics for a converted chart.</p>}
      <Card>
        {isLoading ? <LoadingBlock /> : error ? <div className="p-4"><ErrorState error={error} onRetry={refetch} /></div> : !data?.length ? (
          <EmptyState icon={<Ruler className="size-5" />} title="No measurements yet" description="Track weight, blood pressure, heart rate, glucose, sleep and more."
            action={<Button onClick={() => setDlg({ item: null })}><Plus className="size-4" /> Add measurement</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Recorded</th><th className="hidden px-4 py-3 font-medium sm:table-cell">Source</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Notes</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {data.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-2/50">
                    <td className="px-4 py-3 text-ink-2">{MEASUREMENT_META[m.type].label}</td>
                    <td className="px-4 py-3 font-medium text-ink">{fmtMeasurement(m)}</td>
                    <td className="px-4 py-3 text-ink-2">{fmtDateTime(m.recorded_at)}</td>
                    <td className="hidden px-4 py-3 sm:table-cell"><Badge>{m.source}</Badge></td>
                    <td className="hidden max-w-48 truncate px-4 py-3 text-muted md:table-cell">{m.notes ?? ""}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" aria-label="Edit measurement" onClick={() => setDlg({ item: m })}><Pencil className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" aria-label="Delete measurement" onClick={() => setDel(m)}><Trash2 className="size-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {dlg && <MeasurementDialog item={dlg.item} initialType={filter === "all" ? "weight" : filter} onClose={() => setDlg(null)} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending}
        title="Delete measurement?" message={del ? <>{MEASUREMENT_META[del.type].label}: {fmtMeasurement(del)} on {fmtDateTime(del.recorded_at)}</> : null} />
    </div>
  );
}
