import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Activity, MessageSquareHeart, Pencil, Plus, Trash2 } from "lucide-react";
import { symptomsApi } from "@/services/endpoints";
import { useAppMutation } from "@/hooks/useCrud";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { symptomSchema, type SymptomForm } from "@/schemas/forms";
import { fmtDateTime, isoToLocalInput, localInputToIso, nowLocalInput, orNull } from "@/utils/format";
import type { Symptom } from "@/types";

function SymptomDialog({ item, onClose }: { item: Symptom | null; onClose: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<SymptomForm>({
    resolver: zodResolver(symptomSchema),
    defaultValues: {
      name: item?.name ?? "", description: item?.description ?? "",
      started_at: item ? isoToLocalInput(item.started_at) : nowLocalInput(), duration: item?.duration ?? "",
      severity: item?.severity ?? "", associated: item?.associated_symptoms.join(", ") ?? "", notes: item?.notes ?? "",
      status: item?.status ?? "ongoing",
    },
  });
  const save = useAppMutation((v: SymptomForm) => {
    const body = {
      name: v.name.trim(), description: orNull(v.description), started_at: localInputToIso(v.started_at),
      duration: orNull(v.duration), severity: v.severity === "" || v.severity == null ? null : Number(v.severity),
      associated_symptoms: (v.associated ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      notes: orNull(v.notes), status: v.status,
      resolved_at: v.status === "resolved" ? (item?.resolved_at ?? new Date().toISOString()) : null,
    };
    return item ? symptomsApi.update(item.id, body) : symptomsApi.create(body);
  }, { invalidate: [["symptoms"]], success: "Symptom saved.", onSuccess: onClose });

  return (
    <Dialog open onClose={onClose} title={item ? "Edit symptom" : "Log a symptom"} size="lg"
      description="Severity is your own rating — it helps you notice changes over time."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="symptom-form" loading={save.isPending}>Save</Button></>}>
      <form id="symptom-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Field label="Symptom" required error={errors.name?.message}>{(id) => <Input id={id} autoFocus placeholder="e.g. Headache" {...register("name")} />}</Field>
        <Field label="Started" required error={errors.started_at?.message}>{(id) => <Input id={id} type="datetime-local" max={nowLocalInput()} {...register("started_at")} />}</Field>
        <Field label="Duration">{(id) => <Input id={id} placeholder="e.g. 2 days, comes and goes" {...register("duration")} />}</Field>
        <Field label="Severity (1 = mild, 10 = worst)" error={errors.severity?.message}>{(id) => (
          <Select id={id} {...register("severity")}><option value="">Not rated</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</Select>)}</Field>
        <Field label="Description" className="sm:col-span-2">{(id) => <Textarea id={id} placeholder="What does it feel like? Where? What makes it better or worse?" {...register("description")} />}</Field>
        <Field label="Associated symptoms" hint="Separate with commas" className="sm:col-span-2">{(id, d) => <Input id={id} aria-describedby={d} placeholder="e.g. nausea, light sensitivity" {...register("associated")} />}</Field>
        <Field label="Status">{(id) => <Select id={id} {...register("status")}><option value="ongoing">Ongoing</option><option value="improving">Improving</option><option value="resolved">Resolved</option></Select>}</Field>
        <Field label="Notes">{(id) => <Input id={id} {...register("notes")} />}</Field>
      </form>
    </Dialog>
  );
}

export default function Symptoms() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["symptoms"], queryFn: symptomsApi.list });
  const [dlg, setDlg] = useState<{ item: Symptom | null } | null>(null);
  const [del, setDel] = useState<Symptom | null>(null);
  const remove = useAppMutation((id: string) => symptomsApi.remove(id), { invalidate: [["symptoms"]], success: "Symptom deleted.", onSuccess: () => setDel(null) });

  const askAI = (s: Symptom) => {
    const q = `I've recorded this symptom: ${s.name}${s.duration ? ` (duration: ${s.duration})` : ""}${s.severity ? `, self-rated ${s.severity}/10` : ""}${s.description ? `. ${s.description}` : ""}. What are possible general causes, and what kind of professional evaluation would be appropriate?`;
    navigate("/ai-doctor", { state: { prefill: q } });
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader title="Symptom Journal" description="Record how you feel over time. Your history is shown newest first."
        actions={<Button onClick={() => setDlg({ item: null })}><Plus className="size-4" /> Log symptom</Button>} />
      <Alert tone="warn" className="mb-5">If you have severe or sudden symptoms — such as chest pain, difficulty breathing, or signs of a stroke — contact emergency services immediately instead of logging them.</Alert>
      {isLoading ? <LoadingBlock /> : error ? <ErrorState error={error} onRetry={refetch} /> : !data?.length ? (
        <Card><EmptyState icon={<Activity className="size-5" />} title="Your symptom journal is empty" description="Logging symptoms helps you describe them accurately to a clinician."
          action={<Button onClick={() => setDlg({ item: null })}><Plus className="size-4" /> Log your first symptom</Button>} /></Card>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-line pl-6">
          {data.map((s) => (
            <li key={s.id} className="relative">
              <span className={`absolute -left-[31px] top-5 size-3.5 rounded-full border-2 border-surface ${s.status === "resolved" ? "bg-ok" : s.status === "improving" ? "bg-teal" : "bg-warn"}`} />
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">{s.name}
                      <Badge tone={s.status === "resolved" ? "ok" : s.status === "improving" ? "teal" : "warn"}>{s.status}</Badge>
                      {s.severity && <Badge tone="neutral">self-rated {s.severity}/10</Badge>}</p>
                    <p className="mt-0.5 text-xs text-muted">Started {fmtDateTime(s.started_at)}{s.duration ? ` · ${s.duration}` : ""}{s.resolved_at ? ` · resolved ${fmtDateTime(s.resolved_at)}` : ""}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => askAI(s)}><MessageSquareHeart className="size-3.5" /> Ask AI</Button>
                    <Button size="icon" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => setDlg({ item: s })}><Pencil className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => setDel(s)}><Trash2 className="size-3.5" /></Button>
                  </div>
                </div>
                {s.description && <p className="mt-2 text-sm text-ink-2">{s.description}</p>}
                {s.associated_symptoms.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{s.associated_symptoms.map((a) => <Badge key={a}>{a}</Badge>)}</div>}
                {s.notes && <p className="mt-2 text-xs text-muted">Notes: {s.notes}</p>}
              </Card>
            </li>
          ))}
        </ol>
      )}
      {dlg && <SymptomDialog item={dlg.item} onClose={() => setDlg(null)} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} loading={remove.isPending}
        title="Delete symptom?" message={<>“{del?.name}” will be permanently removed from your journal.</>} />
    </div>
  );
}
