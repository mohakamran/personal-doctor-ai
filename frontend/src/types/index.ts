export interface User {
  id: string;
  email: string;
  display_name: string;
  unit_system: "metric" | "imperial";
  country_code: string | null;
  emergency_number: string | null;
  created_at: string;
}

export interface Profile {
  full_name: string | null;
  date_of_birth: string | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  blood_type: string | null;
  family_history: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  completion: number;
  bmi: number | null;
  updated_at: string | null;
}

export interface Condition { id: string; name: string; diagnosed_on: string | null; status: string; notes: string | null; created_at: string }
export interface Allergy { id: string; allergen: string; reaction: string | null; severity: string | null; notes: string | null; created_at: string }

export type MeasurementType =
  | "weight" | "height" | "bmi" | "blood_pressure" | "heart_rate" | "blood_glucose" | "sleep" | "water";

export interface Measurement {
  id: string;
  type: MeasurementType;
  value: number;
  value2: number | null;
  unit: string;
  recorded_at: string;
  source: string;
  notes: string | null;
  created_at: string;
}

export interface Symptom {
  id: string;
  name: string;
  description: string | null;
  started_at: string;
  duration: string | null;
  severity: number | null;
  associated_symptoms: string[];
  notes: string | null;
  status: "ongoing" | "improving" | "resolved";
  resolved_at: string | null;
  created_at: string;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  instructions: string | null;
  start_date: string | null;
  end_date: string | null;
  prescriber: string | null;
  notes: string | null;
  reminder_enabled: boolean;
  reminder_times: string[];
  last_taken_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Appointment {
  id: string;
  title: string;
  provider: string | null;
  specialty: string | null;
  location: string | null;
  scheduled_at: string;
  status: "scheduled" | "completed" | "cancelled";
  reason: string | null;
  consultation_notes: string | null;
  questions: string[];
  created_at: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system_notice";
  content: string;
  safety_flag: string | null;
  model: string | null;
  context_used: string[];
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  summary: string | null;
  document_id: string | null;
  use_health_context: boolean;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview: string | null;
}

export interface ConversationDetail extends Conversation { messages: Message[] }

export interface AISettings {
  provider: string;
  has_api_key: boolean;
  masked_key: string | null;
  model: string | null;
  default_model: string;
  verified: boolean;
  verified_at: string | null;
  ai_consent: boolean;
  use_health_context: boolean;
  include_conversation_summaries: boolean;
  allow_document_ai: boolean;
}

export interface MedicalDocument {
  id: string;
  title: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  category: string;
  description: string | null;
  report_date: string | null;
  created_at: string;
  extraction_status: string | null;
  page_count: number;
  has_explanation: boolean;
}

export interface Extraction {
  document_id: string;
  status: string;
  page_count: number;
  text: string;
  lab_lines: string[];
  error: string | null;
  ai_explanation: string | null;
  ai_model: string | null;
  explained_at: string | null;
  conversation_id: string | null;
}

export interface SeriesPoint {
  t: string;
  value: number;
  unit: string;
  original_value?: number;
  original_unit?: string;
  systolic?: number;
  diastolic?: number;
  calculated?: boolean;
}

export interface Analytics {
  series: Record<string, SeriesPoint[]>;
  stats: Record<string, { count: number; min: number; max: number; avg: number; latest: SeriesPoint }>;
  height_cm_used_for_bmi: number | null;
}

export interface Dashboard {
  display_name: string;
  profile_completion: number;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  latest: Record<string, Measurement[]>;
  blood_pressure_history: Measurement[];
  heart_rate_history: Measurement[];
  sleep_history: Measurement[];
  recent_symptoms: { id: string; name: string; severity: number | null; status: string; started_at: string }[];
  active_medications: { id: string; name: string; dosage: string | null; frequency: string | null; reminder_enabled: boolean; reminder_times: string[] }[];
  recent_conversations: Conversation[];
  upcoming_appointments: { id: string; title: string; provider: string | null; scheduled_at: string; location: string | null }[];
  counts: { conditions: number; allergies: number; documents: number };
}
