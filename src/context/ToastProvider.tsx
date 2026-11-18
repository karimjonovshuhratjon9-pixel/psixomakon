import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ToastContext, type Toast } from "./toastCtx";

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback(
    (message: string, tone: Toast["tone"] = "success") => {
      const id = ++seq;
      setToasts((t) => [...t, { id, message, tone }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
    },
    [],
  );
  const value = useMemo(() => ({ toasts, push }), [toasts, push]);
  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
}

/** Umumiy ma'lumot olish hook'i (loading / error / reload) */
export function useQuery<T>(
  loader: () => Promise<{ data: T | null; error?: unknown }>,
  deps: unknown[],
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loader()
      .then(({ data: d, error: e }) => {
        if (!active) return;
        if (e) setError((e as { message?: string }).message ?? String(e));
        else setError(null);
        setData(d);
      })
      .catch((e) => active && setError(String(e?.message ?? e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((x) => x + 1), []);
  return { data, loading, error, reload };
}
