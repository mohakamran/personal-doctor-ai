import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Calendar, CalendarX2, Download, MapPin, Pencil, Plus, Stethoscope, Trash2 } from "lucide-react";
import { appointmentsApi } from "@/services/endpoints";
import { downloadFile } from "@/services/api";
import { useAppMutation } from "@/hooks/useCrud";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { appointmentSchema, type AppointmentForm } from "@/schemas/forms";
import { fmtDateTime, isoToLocalInput, localInputToIso, orNull } from "@/utils/format";
import type { Appointment } from "@/types";

function AppointmentDialog({ item, onClose }: { item: Appointment | null; onClose: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<AppointmentForm>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: item?.title ?? "", provider: item?.provider ?? "", specialty: item?.specialty ?? "", location: item?.location ?? "",
      scheduled_at: item ? isoToLocalInput(item.scheduled_at) : "", status: item?.status ?? "scheduled", reason: item?.reason ?? "",
      consultation_notes: item?.consultation_notes ?? "", questions: item?.questions.join("\n") ?? "",
    },
  });
  const save = useAppMutation((v: AppointmentForm) => {
    const body = {
      title: v.title.trim(), provider: orNull(v.provider), specialty: orNull(v.specialty), location: orNull(v.location),
      scheduled_at: localInputToIso(v.scheduled_at), status: v.status, reason: orNull(v.reason),
      consultation_notes: orNull(v.consultation_notes), questions: (v.questions ?? "").split("\n").map((q) => q.trim()).filter(Boolean),
    };
    return item ? appointmentsApi.update(item.id, body) : appointmentsApi.create(body);
  }, { invalidate: [["appointments"]], success: "Appointment saved.", onSuccess: onClose });

  return (
    <Dialog open onClose={onClose} size="lg" title={item ? "Edit appointment" : "Add appointment"}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="appt-form" loading={save.isPending}>Save</Button></>}>
      <form id="appt-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Field label="Title" required error={errors.title?.message} className="sm:col-span-2">{(id) => <Input id={id} autoFocus placeholder="e.g. Annual check-up" {...register("title")} />}</Field>
        <Field label="Date & time" required error={errors.scheduled_at?.message}>{(id) => <Input id={id} type="datetime-local" {...register("scheduled_at")} />}</Field>
        <Field label="Status">{(id) => <Select id={id} {...register("status")}><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select>}</Field>
        <Field label="Healthcare provider">{(id) => <Input id={id} placeholder="e.g. Dr. Lee" {...register("provider")} />}</Field>
        <Field label="Specialty">{(id) => <Input id={id} placeholder="e.g. Cardiology" {...register("specialty")} />}</Field>
        <Field label="Location" className="sm:col-span-2">{(id) => <Input id={id} {...register("location")} />}</Field>
        <Field label="Reason for visit" className="sm:col-span-2">{(id) => <Textarea id={id} {...register("reason")} />}</Field>
        <Field label="Questions for the consultation" hint="One question per line" className="sm:col-span-2">{(id, d) => <Textarea id={id} aria-describedby={d} rows={4} {...register("questions")} />}</Field>
        <Field label="Consultation notes" hint="What the clinician told you, next steps" className="sm:col-span-2">{(id, d) => <Textarea id={id} aria-describedby={d} rows={4} {...register("consultation_notes")} />}</Field>
      </form>
    </Dialog>
  );
}

export default function Appointments() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["appointments"], queryFn: appointmentsApi.list });
  const [dlg, setDlg] = useState<{ item: Appointment | null } | null>(null);
  const [del, setDel] = useState<Appointment | null>(null);
  const [cancel, setCancel] = useState<Appointment | null>(null);
  const remove = useAppMutation((id: string) => appointmentsApi.remove(id), { invalidate: [["appointments"]], success: "Appointment deleted.", onSuccess: () => setDel(null) });
  const doCancel = useAppMutation((id: string) => appointmentsApi.cancel(id), { invalidate: [["appointments"]], success: "Appointment cancelled.", onSuccess: () => setCancel(null) });

  const now = Date.now();
  const upcoming = (data ?? []).filter((a) => a.status === "scheduled" && new Date(a.scheduled_at).getTime() >= now).reverse();
  const past = (data ?? []).filter((a) => !upcoming.includes(a));

  const card = (a: Appointment) => (
    <Card key={a.id} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-teal-soft text-center text-teal">
            <div className="leading-none"><p className="text-[10px] font-semibold uppercase">{new Date(a.scheduled_at).toLocaleString(undefined, { month: "short" })}</p><p className="text-lg font-semibold">{new Date(a.scheduled_at).getDate()}</p></div>
          </div>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium text-ink">{a.title}<Badge tone={a.status === "scheduled" ? "teal" : a.status === "completed" ? "ok" : "neutral"}>{a.status}</Badge></p>
            <p className="mt-0.5 text-xs text-muted">{fmtDateTime(a.scheduled_at)}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-2">
              {a.provider && <span className="flex items-center gap-1"><Stethoscope className="size-3" />{a.provider}{a.specialty ? ` · ${a.specialty}` : ""}</span>}
              {a.location && <span className="flex items-center gap-1"><MapPin className="size-3" />{a.location}</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          {a.status === "scheduled" && <Button size="sm" variant="outline" onClick={() => setCancel(a)}><CalendarX2 className="size-3.5" /> Cancel</Button>}
          <Button size="icon" variant="ghost" aria-label={`Edit ${a.title}`} onClick={() => setDlg({ item: a })}><Pencil className="size-3.5" /></Button>
          <Button size="icon" variant="ghost" aria-label={`Delete ${a.title}`} onClick={() => setDel(a)}><Trash2 className="size-3.5" /></Button>
        </div>
      </div>
      {a.reason && <p className="mt-3 text-sm text-ink-2"><span className="font-medium">Reason:</span> {a.reason}</p>}
      {a.questions.length > 0 && (
        <div className="mt-3 rounded-lg bg-surface-2 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Questions to ask</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-2">{a.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
      )}
      {a.consultation_notes && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-2"><span className="font-medium">Notes:</span> {a.consultation_notes}</p>}
    </Card>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <PageHeader title="Appointments" description="Plan visits, prepare questions and keep consultation notes."
        actions={<>
          <Button variant="outline" onClick={() => downloadFile("/reports/health-summary", "health-summary.md")}><Download className="size-4" /> Consultation summary</Button>
          <Button onClick={() => setDlg({ item: null })}><Plus className="size-4" /> Add appointment</Button>
        </>} />
      {isLoading ? <LoadingBlock /> : error ? <ErrorState error={error} onRetry={refetch} /> : !data?.length ? (
        <Card><EmptyState icon={<Calendar className="size-5" />} title="No appointments" description="Add upcoming visits and the questions you want to ask."
          action={<Button onClick={() => setDlg({ item: null })}><Plus className="size-4" /> Add appointment</Button>} /></Card>
      ) : (<>
        <section><h2 className="mb-3 text-sm font-semibold text-ink">Upcoming ({upcoming.length})</h2>
          {upcoming.length ? <div className="space-y-3">{upcoming.map(card)}</div> : <p className="text-sm text-muted">Nothing scheduled.</p>}</section>
        {past.length > 0 && <section><h2 className="mb-3 text-sm font-semibold text-ink">Past & cancelled</h2><div className="space-y-3">{past.map(card)}</div></section>}
      </>)}
      {dlg && <AppointmentDialog item={dlg.item} onClose={() => setDlg(null)} />}
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} onConfirm={() => cancel && doCancel.mutate(cancel.id)} loading={doCancel.isPending}
        title="Cancel appointment?" confirmLabel="Cancel appointment" message={<>“{cancel?.title}” will be marked as cancelled. This only updates your records here.</>} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending}
        title="Delete appointment?" message={<>“{del?.title}” and its notes will be permanently deleted.</>} />
    </div>
  );
}
