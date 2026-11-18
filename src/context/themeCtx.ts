import { createContext, useContext } from "react";

export type ThemeMode = "light" | "dark" | "system";
/** Haqiqatda qo'llanilgan mavzu (system → tizimdan aniqlanadi) */
export type Resolved = "light" | "dark";

export interface ThemeState {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (m: ThemeMode) => void;
  cycle: () => void;
}

export const ThemeContext = createContext<ThemeState | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export const THEME_STORAGE_KEY = "psyxomakon.theme";
/** Eski nom (RUHIYAT) ostida saqlangan tanlov — ko'chirish uchun */
export const LEGACY_THEME_STORAGE_KEY = "ruhiyat.theme";
