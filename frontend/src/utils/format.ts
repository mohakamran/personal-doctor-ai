import type { MeasurementType } from "@/types";

export const fmtDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) =>
  iso ? new Intl.DateTimeFormat(undefined, opts).format(new Date(iso.length === 10 ? iso + "T00:00:00" : iso)) : "—";

export const fmtDateTime = (iso: string | null | undefined) =>
  fmtDate(iso, { dateStyle: "medium", timeStyle: "short" });

export const fmtTime = (iso: string) => new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(iso));

export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(-Math.round(diff / 86400), "day");
  return fmtDate(iso);
}

/** Convert a local datetime-local input value to an ISO string (UTC). */
export const localInputToIso = (v: string) => new Date(v).toISOString();

/** Current local time formatted for <input type="datetime-local">. */
export function nowLocalInput(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const isoToLocalInput = (iso: string) => nowLocalInput(new Date(iso));

export const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export const MEASUREMENT_META: Record<MeasurementType, { label: string; units: string[]; imperial?: string }> = {
  weight: { label: "Weight", units: ["kg", "lb"], imperial: "lb" },
  height: { label: "Height", units: ["cm", "in"], imperial: "in" },
  bmi: { label: "BMI", units: ["kg/m2"] },
  blood_pressure: { label: "Blood pressure", units: ["mmHg"] },
  heart_rate: { label: "Heart rate", units: ["bpm"] },
  blood_glucose: { label: "Blood glucose", units: ["mg/dL", "mmol/L"] },
  sleep: { label: "Sleep", units: ["hours"] },
  water: { label: "Water intake", units: ["ml", "L", "fl oz"], imperial: "fl oz" },
};

export function defaultUnit(type: MeasurementType, system: "metric" | "imperial") {
  const m = MEASUREMENT_META[type];
  return system === "imperial" && m.imperial ? m.imperial : m.units[0];
}

export function fmtMeasurement(m: { type: string; value: number; value2: number | null; unit: string }) {
  const v = m.type === "blood_pressure" && m.value2 != null ? `${m.value}/${m.value2}` : `${+m.value.toFixed(2)}`;
  return `${v} ${m.unit === "kg/m2" ? "kg/m²" : m.unit}`;
}

export const kgToLb = (kg: number) => kg / 0.45359237;
export const lbToKg = (lb: number) => lb * 0.45359237;
export const cmToIn = (cm: number) => cm / 2.54;
export const inToCm = (inch: number) => inch * 2.54;

/** Empty form strings become null for the API. */
export const orNull = (v?: string | null) => (v && v.trim() ? v.trim() : null);
