import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ThemeContext,
  THEME_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  type Resolved,
  type ThemeMode,
} from "./themeCtx";

const ORDER: ThemeMode[] = ["light", "dark", "system"];

function readMode(): ThemeMode {
  try {
    let v = localStorage.getItem(THEME_STORAGE_KEY);
    if (!v) {
      // Eski nomdagi (ruhiyat.theme) tanlovni bir marta ko'chirib olamiz
      v = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
      if (v) localStorage.setItem(THEME_STORAGE_KEY, v);
    }
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* localStorage bloklangan bo'lishi mumkin */
  }
  return "system";
}

function systemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches === true
  );
}

function resolve(mode: ThemeMode): Resolved {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function apply(resolved: Resolved) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

/**
 * Mavzu (light / dark / system) boshqaruvi.
 * Tanlov localStorage'da saqlanadi; `index.html` dagi kichik skript
 * birinchi render'dan oldin klassni qo'yadi (miltillash bo'lmasligi uchun).
 *
 * DIQQAT: bu faqat ko'rinish sozlamasi. Xavfsizlik yoki autentifikatsiya
 * bilan hech qanday aloqasi yo'q.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [resolved, setResolved] = useState<Resolved>(() => resolve(mode));

  // Mavzuni qo'llash
  useEffect(() => {
    const r = resolve(mode);
    setResolved(r);
    apply(r);
  }, [mode]);

  // "system" rejimida OS sozlamasi o'zgarsa — darhol ergashamiz
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r = resolve("system");
      setResolved(r);
      apply(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, m);
    } catch {
      /* e'tiborsiz */
    }
    setModeState(m);
  }, []);

  const cycle = useCallback(() => {
    setModeState((cur) => {
      const next = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* e'tiborsiz */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ mode, resolved, setMode, cycle }),
    [mode, resolved, setMode, cycle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
