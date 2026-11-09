import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatMessage } from "@/components/chat/ChatMessage";
import Login from "@/pages/Login";
import { fmtMeasurement, defaultUnit, orNull } from "@/utils/format";
import { jsonResponse, renderWithProviders } from "./utils";

describe("ChatMessage", () => {
  it("renders assistant markdown and context note", () => {
    render(<ChatMessage m={{ role: "assistant", content: "**Bold** advice\n\n- item one", created_at: new Date().toISOString(), safety_flag: null, context_used: ["allergies"] }} />);
    expect(screen.getByText("Bold").tagName).toBe("STRONG");
    expect(screen.getByText("item one")).toBeInTheDocument();
    expect(screen.getByText(/used your allergies/)).toBeInTheDocument();
  });
  it("marks safety guidance distinctly", () => {
    render(<ChatMessage m={{ role: "assistant", content: "Call 911 now", created_at: new Date().toISOString(), safety_flag: "cardiac", context_used: [] }} />);
    expect(screen.getByText(/safety guidance/)).toBeInTheDocument();
  });
  it("renders user text as plain text (no HTML injection)", () => {
    render(<ChatMessage m={{ role: "user", content: "<img src=x onerror=alert(1)>", created_at: new Date().toISOString(), safety_flag: null, context_used: [] }} />);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("Login page", () => {
  it("validates input before calling the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: { code: "not_authenticated", message: "x" } }, 401));
    renderWithProviders(<Login />, { route: "/login" });
    await userEvent.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/login"))).toHaveLength(0);
    fetchMock.mockRestore();
  });

  it("shows the backend error for wrong credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).includes("/auth/login")
        ? jsonResponse({ error: { code: "invalid_credentials", message: "Incorrect email or password." } }, 401)
        : jsonResponse({ error: { code: "not_authenticated", message: "x" } }, 401));
    renderWithProviders(<Login />, { route: "/login" });
    await userEvent.type(await screen.findByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrongpass1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByText("Incorrect email or password.")).toBeInTheDocument());
    fetchMock.mockRestore();
  });
});

describe("format utils", () => {
  it("formats blood pressure and units", () => {
    expect(fmtMeasurement({ type: "blood_pressure", value: 120, value2: 80, unit: "mmHg" })).toBe("120/80 mmHg");
    expect(fmtMeasurement({ type: "bmi", value: 24.2, value2: null, unit: "kg/m2" })).toBe("24.2 kg/m²");
    expect(defaultUnit("weight", "imperial")).toBe("lb");
    expect(defaultUnit("weight", "metric")).toBe("kg");
    expect(orNull("  ")).toBeNull();
  });
});
