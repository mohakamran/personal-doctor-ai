import { api, rawRequest, streamRequest } from "./api";
import type {
  AISettings, Allergy, Analytics, Appointment, Condition, Conversation, ConversationDetail, Dashboard, Extraction,
  MedicalDocument, Measurement, Medication, Message, Profile, Symptom,
} from "@/types";

type Body = Record<string, unknown>;

export const profileApi = {
  get: () => api.get<Profile>("/profile"),
  update: (d: Body) => api.put<Profile>("/profile", d),
  conditions: () => api.get<Condition[]>("/profile/conditions"),
  addCondition: (d: Body) => api.post<Condition>("/profile/conditions", d),
  updateCondition: (id: string, d: Body) => api.put<Condition>(`/profile/conditions/${id}`, d),
  deleteCondition: (id: string) => api.del(`/profile/conditions/${id}`),
  allergies: () => api.get<Allergy[]>("/profile/allergies"),
  addAllergy: (d: Body) => api.post<Allergy>("/profile/allergies", d),
  updateAllergy: (id: string, d: Body) => api.put<Allergy>(`/profile/allergies/${id}`, d),
  deleteAllergy: (id: string) => api.del(`/profile/allergies/${id}`),
};

export const measurementsApi = {
  list: (params: { type?: string; start?: string; end?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return api.get<Measurement[]>(`/measurements${q.toString() ? `?${q}` : ""}`);
  },
  create: (d: Body) => api.post<Measurement>("/measurements", d),
  update: (id: string, d: Body) => api.put<Measurement>(`/measurements/${id}`, d),
  remove: (id: string) => api.del(`/measurements/${id}`),
  analytics: (start?: string, end?: string) => {
    const q = new URLSearchParams();
    if (start) q.set("start", start);
    if (end) q.set("end", end);
    return api.get<Analytics>(`/analytics${q.toString() ? `?${q}` : ""}`);
  },
  dashboard: () => api.get<Dashboard>("/dashboard"),
};

export const symptomsApi = {
  list: () => api.get<Symptom[]>("/symptoms"),
  create: (d: Body) => api.post<Symptom>("/symptoms", d),
  update: (id: string, d: Body) => api.put<Symptom>(`/symptoms/${id}`, d),
  remove: (id: string) => api.del(`/symptoms/${id}`),
};

export const medicationsApi = {
  list: () => api.get<Medication[]>("/medications"),
  create: (d: Body) => api.post<Medication>("/medications", d),
  update: (id: string, d: Body) => api.put<Medication>(`/medications/${id}`, d),
  taken: (id: string) => api.post<Medication>(`/medications/${id}/taken`),
  remove: (id: string) => api.del(`/medications/${id}`),
};

export const appointmentsApi = {
  list: () => api.get<Appointment[]>("/appointments"),
  create: (d: Body) => api.post<Appointment>("/appointments", d),
  update: (id: string, d: Body) => api.put<Appointment>(`/appointments/${id}`, d),
  cancel: (id: string) => api.post<Appointment>(`/appointments/${id}/cancel`),
  remove: (id: string) => api.del(`/appointments/${id}`),
};

export const chatApi = {
  list: () => api.get<Conversation[]>("/chat/conversations"),
  get: (id: string) => api.get<ConversationDetail>(`/chat/conversations/${id}`),
  create: (d: { title?: string; use_health_context?: boolean } = {}) => api.post<Conversation>("/chat/conversations", d),
  update: (id: string, d: Body) => api.patch<Conversation>(`/chat/conversations/${id}`, d),
  remove: (id: string) => api.del(`/chat/conversations/${id}`),
  send: (id: string, content: string) =>
    api.post<{ user_message: Message; assistant_message: Message; conversation: Conversation }>(
      `/chat/conversations/${id}/messages`, { content }),
  stream: (id: string, content: string, handlers: Parameters<typeof streamRequest>[2], signal?: AbortSignal) =>
    streamRequest(`/chat/conversations/${id}/messages/stream`, { content }, handlers, signal),
  summarize: (id: string) => api.post<Conversation>(`/chat/conversations/${id}/summarize`),
};

export const recordsApi = {
  list: () => api.get<MedicalDocument[]>("/records"),
  upload: async (form: FormData) => (await rawRequest("POST", "/records", form)).json() as Promise<MedicalDocument>,
  update: (id: string, d: Body) => api.patch<MedicalDocument>(`/records/${id}`, d),
  remove: (id: string) => api.del(`/records/${id}`),
  extraction: (id: string) => api.get<Extraction>(`/records/${id}/extraction`),
  explain: (id: string) => api.post<Extraction>(`/records/${id}/explain`, { consent: true }),
  fileBlob: async (id: string) => (await rawRequest("GET", `/records/${id}/file`)).blob(),
};

export const settingsApi = {
  ai: () => api.get<AISettings>("/settings/ai"),
  test: (d: { api_key?: string; model: string }) =>
    api.post<{ ok: boolean; message: string; model: string | null }>("/settings/ai/test", d),
  models: (d: { api_key?: string; model: string }) => api.post<string[]>("/settings/ai/models", d),
  save: (d: { api_key?: string; model: string }) => api.put<AISettings>("/settings/ai", d),
  removeKey: () => api.del<AISettings>("/settings/ai/key"),
  privacy: (d: Partial<Pick<AISettings, "ai_consent" | "use_health_context" | "include_conversation_summaries" | "allow_document_ai">>) =>
    api.put<AISettings>("/settings/privacy", d),
};
