import { type ReactNode, useEffect } from "react";
import { X, Loader2, Inbox, AlertTriangle } from "lucide-react";
import { useContext } from "react";
import { useToast, ToastContext } from "../context/toastCtx";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="animate-fade-up">
        <h1 className="font-display text-[26px] leading-tight text-forest-950 sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-sm text-ink/55">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = "forest",
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  hint?: string;
  tone?: "forest" | "sage" | "amber" | "blue";
}) {
  const tones = {
    forest: "bg-forest-800 text-white",
    sage: "bg-sage-200 text-forest-900",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-sky-100 text-sky-700",
  }[tone];
  return (
    <div className="card animate-fade-up p-5 transition hover:shadow-lift">
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-semibold text-ink/50">{label}</p>
        <span
          className={cn("grid h-10 w-10 place-items-center rounded-2xl", tones)}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 font-display text-3xl text-forest-950">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink/45">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-3xl bg-forest-50 text-forest-500">
        {icon ?? <Inbox size={24} />}
      </div>
      <p className="font-semibold text-forest-950">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink/50">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink/50">
      <Loader2 className="animate-spin" size={18} />
      {label ?? "Yuklanmoqda..."}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-950/30 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        className={cn(
          "relative max-h-[92vh] w-full overflow-y-auto rounded-t-4xl bg-cream p-6 shadow-lift animate-fade-up sm:rounded-3xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-xl text-forest-950">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-ink/55">{description}</p>
            )}
          </div>
          <button
            className="btn-ghost !p-2"
            onClick={onClose}
            aria-label="Yopish"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = "sage",
}: {
  children: ReactNode;
  tone?: "sage" | "forest" | "amber" | "rose" | "sky" | "slate";
}) {
  const tones = {
    sage: "bg-sage-100 text-forest-800",
    forest: "bg-forest-800 text-white",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-700",
    sky: "bg-sky-100 text-sky-700",
    slate: "bg-ink/5 text-ink/60",
  }[tone];
  return <span className={cn("chip", tones)}>{children}</span>;
}

export function Toaster() {
  const { toasts } = useToastCtx();
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex w-[92vw] max-w-sm -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "animate-fade-up rounded-2xl px-4 py-3 text-sm font-medium shadow-lift",
            t.tone === "error"
              ? "bg-rose-600 text-white"
              : t.tone === "info"
                ? "bg-forest-950 text-white"
                : "bg-forest-800 text-white",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// Toast context ni komponent ichida olish uchun (push o'rniga to'liq kontekst)
function useToastCtx() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('missing ToastProvider');
  return ctx;
}
void useToast;


