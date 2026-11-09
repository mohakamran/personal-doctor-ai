import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BellRing, Check, Pencil, Pill, Plus, Trash2 } from "lucide-react";
import { medicationsApi } from "@/services/endpoints";
import { useAppMutation } from "@/hooks/useCrud";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Badge, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { medicationSchema, type MedicationForm } from "@/schemas/forms";
import { fmtDate, orNull, relativeTime } from "@/utils/format";
import type { Medication } from "@/types";

function MedicationDialog({ item, onClose }: { item: Medication | null; onClose: () => void }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<MedicationForm>({
    resolver: zodResolver(medicationSchema),
    defaultValues: {
      name: item?.name ?? "", dosage: item?.dosage ?? "", frequency: item?.frequency ?? "", instructions: item?.instructions ?? "",
      start_date: item?.start_date ?? "", end_date: item?.end_date ?? "", prescriber: item?.prescriber ?? "", notes: item?.notes ?? "",
      reminder_enabled: item?.reminder_enabled ?? false, reminder_times: item?.reminder_times.join(", ") ?? "",
    },
  });
  const save = useAppMutation((v: MedicationForm) => {
    const body = {
      name: v.name.trim(), dosage: orNull(v.dosage), frequency: orNull(v.frequency), instructions: orNull(v.instructions),
      start_date: orNull(v.start_date), end_date: orNull(v.end_date), prescriber: orNull(v.prescriber), notes: orNull(v.notes),
      reminder_enabled: v.reminder_enabled,
      reminder_times: (v.reminder_times ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    };
    return item ? medicationsApi.update(item.id, body) : medicationsApi.create(body);
  }, { invalidate: [["medications"]], success: "Medication saved.", onSuccess: onClose });
  const reminders = watch("reminder_enabled");

  return (
    <Dialog open onClose={onClose} size="lg" title={item ? "Edit medication" : "Add medication"}
      description="Enter details exactly as prescribed or as shown on the label."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="med-form" loading={save.isPending}>Save</Button></>}>
      <form id="med-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Field label="Medication name" required error={errors.name?.message}>{(id) => <Input id={id} autoFocus {...register("name")} />}</Field>
        <Field label="Prescribed dosage">{(id) => <Input id={id} placeholder="e.g. 10 mg" {...register("dosage")} />}</Field>
        <Field label="Frequency">{(id) => <Input id={id} placeholder="e.g. once daily" {...register("frequency")} />}</Field>
        <Field label="Prescribing clinician (optional)">{(id) => <Input id={id} {...register("prescriber")} />}</Field>
        <Field label="Start date">{(id) => <Input id={id} type="date" {...register("start_date")} />}</Field>
        <Field label="End date" error={errors.end_date?.message}>{(id) => <Input id={id} type="date" {...register("end_date")} />}</Field>
        <Field label="Instructions" className="sm:col-span-2">{(id) => <Textarea id={id} placeholder="e.g. take with food" {...register("instructions")} />}</Field>
        <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} {...register("notes")} />}</Field>
        <label className="flex items-center gap-2 text-sm text-ink-2 sm:col-span-2">
          <input type="checkbox" className="size-4 accent-[var(--teal)]" {...register("reminder_enabled")} /> Track reminders in this app (local only)
        </label>
        {reminders && <Field label="Reminder times" hint="24-hour HH:MM, comma-separated (e.g. 08:00, 20:00)" error={errors.reminder_times?.message} className="sm:col-span-2">
          {(id, d) => <Input id={id} aria-describedby={d} {...register("reminder_times")} />}</Field>}
      </form>
    </Dialog>
  );
}

export default function Medications() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["medications"], queryFn: medicationsApi.list });
  const [dlg, setDlg] = useState<{ item: Medication | null } | null>(null);
  const [del, setDel] = useState<Medication | null>(null);
  const remove = useAppMutation((id: string) => medicationsApi.remove(id), { invalidate: [["medications"]], success: "Medication deleted.", onSuccess: () => setDel(null) });
  const taken = useAppMutation((id: string) => medicationsApi.taken(id), { invalidate: [["medications"]], success: "Marked as taken." });

  const active = data?.filter((m) => m.is_active) ?? [];
  const past = data?.filter((m) => !m.is_active) ?? [];
  const schedule = active.filter((m) => m.reminder_enabled).flatMap((m) => m.reminder_times.map((t) => ({ t, m }))).sort((a, b) => a.t.localeCompare(b.t));

  const row = (m: Medication) => (
    <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium text-ink">{m.name}{m.dosage && <Badge tone="navy">{m.dosage}</Badge>}{m.reminder_enabled && <Badge tone="teal"><BellRing className="size-3" /> reminders</Badge>}</p>
        <p className="mt-0.5 text-xs text-muted">{[m.frequency, m.prescriber && `prescribed by ${m.prescriber}`, m.start_date && `from ${fmtDate(m.start_date)}`, m.end_date && `until ${fmtDate(m.end_date)}`].filter(Boolean).join(" · ") || "No schedule recorded"}</p>
        {m.instructions && <p className="mt-1 text-sm text-ink-2">{m.instructions}</p>}
        {m.last_taken_at && <p className="mt-1 text-xs text-muted">Last marked taken {relativeTime(m.last_taken_at)}</p>}
      </div>
      <div className="flex gap-1">
        {m.is_active && <Button size="sm" variant="outline" onClick={() => taken.mutate(m.id)}><Check className="size-3.5" /> Taken</Button>}
        <Button size="icon" variant="ghost" aria-label={`Edit ${m.name}`} onClick={() => setDlg({ item: m })}><Pencil className="size-3.5" /></Button>
        <Button size="icon" variant="ghost" aria-label={`Delete ${m.name}`} onClick={() => setDel(m)}><Trash2 className="size-3.5" /></Button>
      </div>
    </li>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <PageHeader title="Medications" description="Your medication records, as prescribed to you."
        actions={<Button onClick={() => setDlg({ item: null })}><Plus className="size-4" /> Add medication</Button>} />
      <Alert tone="info">Personal Doctor AI never recommends new medications or dose changes. Always follow your prescriber's instructions and ask your pharmacist about interactions.</Alert>
      {isLoading ? <LoadingBlock /> : error ? <ErrorState error={error} onRetry={refetch} /> : !data?.length ? (
        <Card><EmptyState icon={<Pill className="size-5" />} title="No medications recorded" description="Keep an accurate list to share with clinicians and to give the AI useful context."
          action={<Button onClick={() => setDlg({ item: null })}><Plus className="size-4" /> Add medication</Button>} /></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card><CardHeader title={`Current (${active.length})`} icon={<Pill className="size-4" />} />
              <CardBody className="pt-2">{active.length ? <ul className="divide-y divide-line">{active.map(row)}</ul> : <p className="py-4 text-sm text-muted">No current medications.</p>}</CardBody></Card>
            {past.length > 0 && <Card><CardHeader title={`Past or not yet started (${past.length})`} />
              <CardBody className="pt-2"><ul className="divide-y divide-line opacity-80">{past.map(row)}</ul></CardBody></Card>}
          </div>
          <Card className="h-fit"><CardHeader title="Today's reminders" icon={<BellRing className="size-4" />} description="Shown while the app is open." />
            <CardBody className="pt-3">{schedule.length ? (
              <ul className="space-y-2">{schedule.map(({ t, m }) => (
                <li key={m.id + t} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm"><span className="font-mono text-ink">{t}</span><span className="truncate pl-3 text-ink-2">{m.name}</span></li>
              ))}</ul>) : <p className="text-sm text-muted">Turn on reminders for a medication to build a daily schedule.</p>}
            </CardBody></Card>
        </div>
      )}
      {dlg && <MedicationDialog item={dlg.item} onClose={() => setDlg(null)} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending}
        title="Delete medication?" message={<>“{del?.name}” will be permanently removed. To keep a history, set an end date instead.</>} />
    </div>
  );
}
