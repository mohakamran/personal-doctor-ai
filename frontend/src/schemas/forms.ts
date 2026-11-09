import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export const passwordRule = z.string()
  .min(10, "At least 10 characters.")
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Include letters and numbers.");

export const registerSchema = z.object({
  display_name: z.string().trim().min(1, "Your name is required.").max(120),
  email: z.string().trim().email("Enter a valid email address."),
  password: passwordRule,
  confirm: z.string(),
  accept: z.literal(true, { errorMap: () => ({ message: "Please confirm you understand." }) }),
}).refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match." });

const optNum = (min: number, max: number, msg: string) =>
  z.union([z.literal(""), z.coerce.number().min(min, msg).max(max, msg)]).optional();

export const profileSchema = z.object({
  full_name: z.string().max(160).optional(),
  date_of_birth: z.string().optional().refine((v) => !v || new Date(v) < new Date(), "Date of birth must be in the past."),
  sex: z.string().max(30).optional(),
  height: optNum(1, 275, "Enter a realistic height."),
  weight: optNum(1, 1100, "Enter a realistic weight."),
  blood_type: z.string().optional(),
  family_history: z.string().max(4000).optional(),
  emergency_contact_name: z.string().max(160).optional(),
  emergency_contact_phone: z.string().max(40).regex(/^[0-9+()\- .]*$/, "Use digits and + ( ) - only.").optional(),
  emergency_contact_relation: z.string().max(80).optional(),
});
export type ProfileForm = z.infer<typeof profileSchema>;

export const symptomSchema = z.object({
  name: z.string().trim().min(1, "Symptom name is required.").max(200),
  description: z.string().max(4000).optional(),
  started_at: z.string().min(1, "Start date and time are required."),
  duration: z.string().max(120).optional(),
  severity: z.union([z.literal(""), z.coerce.number().int().min(1).max(10)]).optional(),
  associated: z.string().max(1000).optional(),
  notes: z.string().max(4000).optional(),
  status: z.enum(["ongoing", "improving", "resolved"]),
});
export type SymptomForm = z.infer<typeof symptomSchema>;

export const medicationSchema = z.object({
  name: z.string().trim().min(1, "Medication name is required.").max(200),
  dosage: z.string().max(120).optional(),
  frequency: z.string().max(120).optional(),
  instructions: z.string().max(2000).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  prescriber: z.string().max(160).optional(),
  notes: z.string().max(2000).optional(),
  reminder_enabled: z.boolean(),
  reminder_times: z.string().optional().refine(
    (v) => !v || v.split(",").every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t.trim())),
    "Use HH:MM, separated by commas (e.g. 08:00, 20:00)."),
}).refine((d) => !d.start_date || !d.end_date || d.end_date >= d.start_date, { path: ["end_date"], message: "End date is before start date." });
export type MedicationForm = z.infer<typeof medicationSchema>;

export const appointmentSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  provider: z.string().max(160).optional(),
  specialty: z.string().max(120).optional(),
  location: z.string().max(200).optional(),
  scheduled_at: z.string().min(1, "Date and time are required."),
  status: z.enum(["scheduled", "completed", "cancelled"]),
  reason: z.string().max(2000).optional(),
  consultation_notes: z.string().max(8000).optional(),
  questions: z.string().max(10000).optional(),
});
export type AppointmentForm = z.infer<typeof appointmentSchema>;
