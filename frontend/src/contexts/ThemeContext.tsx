import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemePref = "light" | "dark" | "system";
const ThemeContext = createContext<{ theme: ThemePref; setTheme: (t: ThemePref) => void } | null>(null);

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem("pdai-theme");
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(readPref);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && !!mq?.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    mq?.addEventListener?.("change", apply);
    return () => mq?.removeEventListener?.("change", apply);
  }, [theme]);
  const setTheme = (t: ThemePref) => {
    setThemeState(t);
    try {
      localStorage.setItem("pdai-theme", t); // appearance preference only — never health data or secrets
    } catch { /* storage unavailable */ }
  };
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
