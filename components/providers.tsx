"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Camera } from "@/types";
import { addLog } from "@/lib/logs";
import thMessages from "@/public/locales/th/common.json";
import enMessages from "@/public/locales/en/common.json";

// ─── App Context ──────────────────────────────────────────────────────────────

interface AppContextType {
  cameras: Camera[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const AppContext = createContext<AppContextType>({
  cameras: [],
  loading: true,
  error: null,
  refresh: () => {},
});

// ─── Language Context ─────────────────────────────────────────────────────────

const translations: Record<string, Record<string, string>> = {
  th: thMessages as Record<string, string>,
  en: enMessages as Record<string, string>,
};
interface LanguageContextType {
  t: (key: string) => string;
  language: string;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType>({
  t: (key) => key,
  language: "th",
  toggleLanguage: () => {},
});

// ─── Theme Context ────────────────────────────────────────────────────────────

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
});

// ─── Providers ────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState("th");
  const [theme, setTheme] = useState<Theme>("light");

  // Apply dark class to <html> on theme change
  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((prev) => (prev === "dark" ? "light" : "dark")),
    []
  );

  const toggleLanguage = useCallback(
    () => setLanguage((prev) => (prev === "th" ? "en" : "th")),
    []
  );

  const t = useCallback(
    (key: string) =>
      translations[language]?.[key] ?? translations.en[key] ?? key,
    [language]
  );

  const fetchCameras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/zm");
      const data = await res.json();
      if (data.success) {
        setCameras(data.cameras ?? []);
        addLog(`${translations[language]?.camerasLoaded ?? "Cameras loaded"} (${data.cameras?.length ?? 0})`, "info");
      } else {
        setError(data.error ?? "Failed to load cameras");
        addLog(data.error ?? translations[language]?.loadFailed ?? "Load failed", "error");
      }
    } catch {
      const msg = translations[language]?.loadFailed ?? "Cannot connect to server";
      setError(msg);
      addLog(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <AppContext.Provider value={{ cameras, loading, error, refresh: fetchCameras }}>
        <LanguageContext.Provider value={{ t, language, toggleLanguage }}>
          {children}
        </LanguageContext.Provider>
      </AppContext.Provider>
    </ThemeContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAppContext() {
  return useContext(AppContext);
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useTheme() {
  return useContext(ThemeContext);
}
