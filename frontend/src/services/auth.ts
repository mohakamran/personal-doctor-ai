import { api } from "./api";
import type { User } from "@/types";

export const authApi = {
  me: () => api.get<User>("/auth/me"),
  login: (email: string, password: string) => api.post<User>("/auth/login", { email, password }),
  register: (email: string, password: string, display_name: string) =>
    api.post<User>("/auth/register", { email, password, display_name }),
  logout: () => api.post<{ ok: boolean }>("/auth/logout"),
  updateMe: (data: Partial<Pick<User, "display_name" | "unit_system" | "country_code" | "emergency_number">>) =>
    api.patch<User>("/auth/me", data),
  changePassword: (current_password: string, new_password: string) =>
    api.post<{ ok: boolean }>("/auth/change-password", { current_password, new_password }),
  deleteAccount: (password: string) => api.del<{ ok: boolean }>("/auth/account", { password, confirm: "DELETE" }),
};
