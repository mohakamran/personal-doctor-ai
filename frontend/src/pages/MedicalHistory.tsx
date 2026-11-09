import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { AlertCircle, ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { profileApi } from "@/services/endpoints";
import { useAppMutation } from "@/hooks/useCrud";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { fmtDate, orNull } from "@/utils/format";
import type { Allergy, Condition } from "@/types";

type CondForm = { name: string; diagnosed_on: string; status: string; notes: string };
type AllergyForm = { allergen: string; reaction: string; severity: string; notes: string };

function ConditionDialog({ open, onClose, item }: { open: boolean; onClose: () => void; item: Condition | null }) {
  const { register, handleSubmit, formState: { errors } } = useForm<CondForm>({
    values: { name: item?.name ?? "", diagnosed_on: item?.diagnosed_on ?? "", status: item?.status ?? "active", notes: item?.notes ?? "" },
  });
  const save = useAppMutation((v: CondForm) => {
    const body = { name: v.name.trim(), diagnosed_on: orNull(v.diagnosed_on), status: v.status, notes: orNull(v.notes) };
    return item ? profileApi.updateCondition(item.id, body) : profileApi.addCondition(body);
  }, { invalidate: [["conditions"], ["profile"]], success: "Condition saved.", onSuccess: onClose });
  return (
    <Dialog open={open} onClose={onClose} title={item ? "Edit condition" : "Add medical condition"}
      description="Record conditions a clinician has told you about."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="cond-form" loading={save.isPending}>Save</Button></>}>
      <form id="cond-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))}>
        <Field label="Condition" required error={errors.name?.message} className="sm:col-span-2">
          {(id) => <Input id={id} autoFocus {...register("name", { required: "Condition name is required.", validate: (v) => !!v.trim() || "Condition name is required." })} />}</Field>
        <Field label="Diagnosed on">{(id) => <Input id={id} type="date" max={new Date().toISOString().slice(0, 10)} {...register("diagnosed_on")} />}</Field>
        <Field label="Status">{(id) => <Select id={id} {...register("status")}><option value="active">Active</option><option value="managed">Managed</option><option value="resolved">Resolved</option></Select>}</Field>
        <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} {...register("notes")} />}</Field>
      </form>
    </Dialog>
  );
}

function AllergyDialog({ open, onClose, item }: { open: boolean; onClose: () => void; item: Allergy | null }) {
  const { register, handleSubmit, formState: { errors } } = useForm<AllergyForm>({
    values: { allergen: item?.allergen ?? "", reaction: item?.reaction ?? "", severity: item?.severity ?? "", notes: item?.notes ?? "" },
  });
  const save = useAppMutation((v: AllergyForm) => {
    const body = { allergen: v.allergen.trim(), reaction: orNull(v.reaction), severity: orNull(v.severity), notes: orNull(v.notes) };
    return item ? profileApi.updateAllergy(item.id, body) : profileApi.addAllergy(body);
  }, { invalidate: [["allergies"], ["profile"]], success: "Allergy saved.", onSuccess: onClose });
  return (
    <Dialog open={open} onClose={onClose} title={item ? "Edit allergy" : "Add allergy"}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="allergy-form" loading={save.isPending}>Save</Button></>}>
      <form id="allergy-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))}>
        <Field label="Allergen" required error={errors.allergen?.message} className="sm:col-span-2">
          {(id) => <Input id={id} autoFocus placeholder="e.g. Penicillin, peanuts" {...register("allergen", { validate: (v) => !!v.trim() || "Allergen is required." })} />}</Field>
        <Field label="Reaction">{(id) => <Input id={id} placeholder="e.g. hives" {...register("reaction")} />}</Field>
        <Field label="Severity (as you understand it)">{(id) => <Select id={id} {...register("severity")}><option value="">Not specified</option><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option><option value="unknown">Unknown</option></Select>}</Field>
        <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} {...register("notes")} />}</Field>
      </form>
    </Dialog>
  );
}

export default function MedicalHistory() {
  const conds = useQuery({ queryKey: ["conditions"], queryFn: profileApi.conditions });
  const alls = useQuery({ queryKey: ["allergies"], queryFn: profileApi.allergies });
  const [condDlg, setCondDlg] = useState<{ open: boolean; item: Condition | null }>({ open: false, item: null });
  const [allDlg, setAllDlg] = useState<{ open: boolean; item: Allergy | null }>({ open: false, item: null });
  const [del, setDel] = useState<{ kind: "condition" | "allergy"; id: string; name: string } | null>(null);
  const remove = useAppMutation((d: NonNullable<typeof del>) => d.kind === "condition" ? profileApi.deleteCondition(d.id) : profileApi.deleteAllergy(d.id),
    { invalidate: [["conditions"], ["allergies"], ["profile"]], success: "Deleted.", onSuccess: () => setDel(null) });

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <PageHeader title="Medical History" description="Existing conditions and allergies, as reported by you." />
      <Card>
        <CardHeader title="Medical conditions" icon={<ClipboardList className="size-4" />}
          action={<Button size="sm" onClick={() => setCondDlg({ open: true, item: null })}><Plus className="size-3.5" /> Add</Button>} />
        <CardBody className="pt-3">
          {conds.isLoading ? <LoadingBlock /> : conds.error ? <ErrorState error={conds.error} onRetry={conds.refetch} />
            : !conds.data?.length ? <EmptyState title="No conditions recorded" description="Add conditions you've been diagnosed with to give the AI useful context." /> : (
              <ul className="divide-y divide-line">
                {conds.data.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">{c.name}
                        <Badge tone={c.status === "resolved" ? "ok" : c.status === "managed" ? "teal" : "warn"}>{c.status}</Badge></p>
                      <p className="text-xs text-muted">{c.diagnosed_on ? `Diagnosed ${fmtDate(c.diagnosed_on)}` : "Diagnosis date not recorded"}{c.notes ? ` · ${c.notes}` : ""}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setCondDlg({ open: true, item: c })}><Pencil className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => setDel({ kind: "condition", id: c.id, name: c.name })}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Allergies" icon={<AlertCircle className="size-4" />}
          action={<Button size="sm" onClick={() => setAllDlg({ open: true, item: null })}><Plus className="size-3.5" /> Add</Button>} />
        <CardBody className="pt-3">
          {alls.isLoading ? <LoadingBlock /> : alls.error ? <ErrorState error={alls.error} onRetry={alls.refetch} />
            : !alls.data?.length ? <EmptyState title="No allergies recorded" description="Include medication, food and environmental allergies." /> : (
              <ul className="divide-y divide-line">
                {alls.data.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">{a.allergen}
                        {a.severity && <Badge tone={a.severity === "severe" ? "danger" : "neutral"}>{a.severity}</Badge>}</p>
                      <p className="text-xs text-muted">{a.reaction ? `Reaction: ${a.reaction}` : "Reaction not recorded"}{a.notes ? ` · ${a.notes}` : ""}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Edit ${a.allergen}`} onClick={() => setAllDlg({ open: true, item: a })}><Pencil className="size-3.5" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Delete ${a.allergen}`} onClick={() => setDel({ kind: "allergy", id: a.id, name: a.allergen })}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </CardBody>
      </Card>
      {condDlg.open && <ConditionDialog open onClose={() => setCondDlg({ open: false, item: null })} item={condDlg.item} />}
      {allDlg.open && <AllergyDialog open onClose={() => setAllDlg({ open: false, item: null })} item={allDlg.item} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del)} loading={remove.isPending}
        title={`Delete ${del?.kind}?`} message={<>“{del?.name}” will be permanently removed.</>} />
    </div>
  );
}
