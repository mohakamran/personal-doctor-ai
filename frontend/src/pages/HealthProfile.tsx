import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Phone, Save, UserCircle2, Users } from "lucide-react";
import { profileApi } from "@/services/endpoints";
import { useAuth } from "@/contexts/AuthContext";
import { useAppMutation } from "@/hooks/useCrud";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/misc";
import { profileSchema, type ProfileForm } from "@/schemas/forms";
import { cmToIn, fmtDateTime, inToCm, kgToLb, lbToKg, orNull } from "@/utils/format";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function HealthProfile() {
  const { user } = useAuth();
  const imperial = user?.unit_system === "imperial";
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["profile"], queryFn: profileApi.get });
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });

  useEffect(() => {
    if (!data) return;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    reset({
      full_name: data.full_name ?? "", date_of_birth: data.date_of_birth ?? "", sex: data.sex ?? "",
      height: data.height_cm ? r1(imperial ? cmToIn(data.height_cm) : data.height_cm) : "",
      weight: data.weight_kg ? r1(imperial ? kgToLb(data.weight_kg) : data.weight_kg) : "",
      blood_type: data.blood_type ?? "", family_history: data.family_history ?? "",
      emergency_contact_name: data.emergency_contact_name ?? "", emergency_contact_phone: data.emergency_contact_phone ?? "",
      emergency_contact_relation: data.emergency_contact_relation ?? "",
    });
  }, [data, imperial, reset]);

  const save = useAppMutation((v: ProfileForm) => {
    const h = v.height === "" || v.height == null ? null : Number(v.height);
    const w = v.weight === "" || v.weight == null ? null : Number(v.weight);
    return profileApi.update({
      full_name: orNull(v.full_name), date_of_birth: orNull(v.date_of_birth), sex: orNull(v.sex),
      height_cm: h == null ? null : Math.round((imperial ? inToCm(h) : h) * 10) / 10,
      weight_kg: w == null ? null : Math.round((imperial ? lbToKg(w) : w) * 10) / 10,
      blood_type: orNull(v.blood_type), family_history: orNull(v.family_history),
      emergency_contact_name: orNull(v.emergency_contact_name), emergency_contact_phone: orNull(v.emergency_contact_phone),
      emergency_contact_relation: orNull(v.emergency_contact_relation),
    });
  }, { invalidate: [["profile"]], success: "Health profile saved." });

  if (isLoading) return <div className="p-6"><LoadingBlock /></div>;
  if (error || !data) return <div className="p-6"><ErrorState error={error} onRetry={refetch} /></div>;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <PageHeader title="Health Profile" description="Basic information that helps personalise explanations. Everything is optional."
        actions={<Badge tone="teal">{data.completion}% complete</Badge>} />
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-5" noValidate>
        <Card>
          <CardHeader title="Personal details" icon={<UserCircle2 className="size-4" />} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={errors.full_name?.message}>{(id) => <Input id={id} autoComplete="name" {...register("full_name")} />}</Field>
            <Field label="Date of birth" error={errors.date_of_birth?.message}>{(id) => <Input id={id} type="date" {...register("date_of_birth")} />}</Field>
            <Field label="Sex (optional)">{(id) => (
              <Select id={id} {...register("sex")}>
                <option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Intersex</option><option>Other</option>
              </Select>)}</Field>
            <Field label="Blood type (optional)">{(id) => (
              <Select id={id} {...register("blood_type")}><option value="">Unknown</option>{BLOOD_TYPES.map((b) => <option key={b}>{b}</option>)}</Select>)}</Field>
            <Field label={`Height (${imperial ? "in" : "cm"})`} error={errors.height?.message}>{(id) => <Input id={id} type="number" step="0.1" inputMode="decimal" {...register("height")} />}</Field>
            <Field label={`Current weight (${imperial ? "lb" : "kg"})`} error={errors.weight?.message}
              hint={data.bmi ? `Calculated BMI: ${data.bmi} kg/m² — a screening number, not a diagnosis.` : "BMI is shown when both height and weight are entered."}>
              {(id, d) => <Input id={id} aria-describedby={d} type="number" step="0.1" inputMode="decimal" {...register("weight")} />}</Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Family medical history (optional)" icon={<Users className="size-4" />}
            description="Conditions in close relatives, e.g. “Father: type 2 diabetes”." />
          <CardBody><Textarea aria-label="Family medical history" rows={4} {...register("family_history")} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Emergency contact (optional)" icon={<Phone className="size-4" />} />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Field label="Name">{(id) => <Input id={id} {...register("emergency_contact_name")} />}</Field>
            <Field label="Relationship">{(id) => <Input id={id} {...register("emergency_contact_relation")} />}</Field>
            <Field label="Phone" error={errors.emergency_contact_phone?.message}>{(id) => <Input id={id} type="tel" {...register("emergency_contact_phone")} />}</Field>
          </CardBody>
        </Card>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{data.updated_at ? `Last updated ${fmtDateTime(data.updated_at)}` : ""} · Allergies and conditions are under Medical History.</p>
          <Button type="submit" loading={save.isPending} disabled={!isDirty}><Save className="size-4" /> Save profile</Button>
        </div>
      </form>
    </div>
  );
}
