"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { readBrowserStorage, writeBrowserStorage } from "../_lib/browser-storage.mts";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const themeEvent = "mcmods-theme-change";
let temporaryTheme: Theme | undefined;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, getInitialTheme, () => "light" as const);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next = getInitialTheme() === "dark" ? "light" : "dark";
    temporaryTheme = next;
    writeBrowserStorage("mcmods-theme", next);
    window.dispatchEvent(new Event(themeEvent));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return value;
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }
  if (temporaryTheme) return temporaryTheme;
  const saved = readBrowserStorage("mcmods-theme");
  if (saved === "light" || saved === "dark") {
    return saved;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeTheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const storage = (event: StorageEvent) => {
    if (event.key === "mcmods-theme" || event.key === null) {
      temporaryTheme = undefined;
      onChange();
    }
  };
  window.addEventListener(themeEvent, onChange);
  window.addEventListener("storage", storage);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(themeEvent, onChange);
    window.removeEventListener("storage", storage);
    media.removeEventListener("change", onChange);
  };
}
