import type { ReactNode } from "react";
import { AlertTriangle, Info, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/utils/cn";

const badgeTones = {
  neutral: "bg-surface-2 text-ink-2",
  teal: "bg-teal-soft text-teal",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  navy: "bg-navy/10 text-navy",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: keyof typeof badgeTones; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone], className)}>{children}</span>;
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-teal", className)} aria-label={label} role="status" />;
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</div>}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "danger"; title?: string; children?: ReactNode; className?: string }) {
  const Icon = tone === "danger" ? ShieldAlert : tone === "warn" ? AlertTriangle : Info;
  const tones = { info: "border-teal/30 bg-teal-soft", warn: "border-warn/30 bg-warn-soft", danger: "border-danger/30 bg-danger-soft" };
  const iconTone = { info: "text-teal", warn: "text-warn", danger: "text-danger" };
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3.5 text-sm", tones[tone], className)} role={tone === "danger" ? "alert" : undefined}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconTone[tone])} />
      <div className="text-ink-2">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <Alert tone="danger" title="Couldn't load this data">
      <p>{msg}</p>
      {onRetry && <button className="mt-1 font-medium text-danger underline" onClick={onRetry}>Try again</button>}
    </Alert>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function MedicalDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted", className)}>
      Personal Doctor AI is an AI health assistant, not a licensed physician. It does not diagnose, prescribe, or
      replace professional medical care. In an emergency, call your local emergency number.
    </p>
  );
}
