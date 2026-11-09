import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { AuthLayout } from "@/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { registerSchema } from "@/schemas/forms";

export default function Register() {
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await signUp(v.email, v.password, v.display_name);
      navigate("/", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    }
  });

  return (
    <AuthLayout title="Create your account" subtitle="Your data is stored locally on this Mac.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Your name" error={errors.display_name?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors.display_name} autoComplete="name" autoFocus {...register("display_name")} />}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors.email} type="email" autoComplete="email" {...register("email")} />}
        </Field>
        <Field label="Password" error={errors.password?.message} hint="At least 10 characters with letters and numbers.">
          {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors.password} type="password" autoComplete="new-password" {...register("password")} />}
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors.confirm} type="password" autoComplete="new-password" {...register("confirm")} />}
        </Field>
        <label className="flex items-start gap-2.5 text-sm text-ink-2">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--teal)]" {...register("accept")} />
          <span>I understand Personal Doctor AI is an AI assistant, not a doctor, and does not diagnose, prescribe, or replace professional care.</span>
        </label>
        {errors.accept && <p className="text-xs text-danger">{errors.accept.message}</p>}
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account? <Link to="/login" className="font-medium text-teal hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
