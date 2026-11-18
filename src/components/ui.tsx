import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Inbox,
  Loader2,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { ToastContext } from "../context/toastCtx";
import { SetupCheck } from "./SetupCheck";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ========================================================================== */
/*  Layout                                                                    */
/* ========================================================================== */

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="animate-fade-up min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-forest-600">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[24px] leading-tight text-forest-950 sm:text-[30px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink/55">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  return <Tag className={cn("card", className)}>{children}</Tag>;
}

export function CardHeader({
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
    <div className="flex flex-col gap-3 border-b border-ink/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-forest-600">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-semibold text-forest-950">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-[12px] text-ink/45">{description}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = "forest",
  trend,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  hint?: string;
  tone?: "forest" | "sage" | "amber" | "blue" | "rose";
  trend?: { dir: "up" | "down"; text: string };
}) {
  const tones = {
    forest: "bg-forest-800 text-white dark:text-forest-50",
    sage: "bg-sage-200 text-forest-900",
    amber:
      "bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300",
    blue: "bg-sky-100 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-400/20 dark:text-rose-300",
  }[tone];
  return (
    <div className="card animate-fade-up p-5 transition hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-semibold text-ink/50">{label}</p>
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
            tones,
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2.5 font-display text-[28px] leading-none text-forest-950">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[11.5px] text-ink/45">{hint}</p>}
      {trend && (
        <p
          className={cn(
            "mt-1.5 text-[11.5px] font-semibold",
            trend.dir === "up" ? "text-forest-600" : "text-rose-500",
          )}
        >
          {trend.dir === "up" ? "↑" : "↓"} {trend.text}
        </p>
      )}
    </div>
  );
}

/* ========================================================================== */
/*  States                                                                    */
/* ========================================================================== */

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
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-3xl bg-forest-50 text-forest-500">
        {icon ?? <Inbox size={24} />}
      </div>
      <p className="font-semibold text-forest-950">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink/50">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Ekranning pastki o'ng burchagidagi "Sozlama holati" tugmasi (diagnostika) */
export function DiagnosticsButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden">
      {open && (
        <div className="mb-2 w-[min(92vw,380px)] shadow-soft">
          <SetupCheck compact />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-secondary !rounded-full !px-3.5 !py-2 shadow-soft"
        title="Server va baza sozlamalari holatini tekshirish"
      >
        <Wrench size={14} /> {open ? "Yopish" : "Sozlama holati"}
      </button>
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

/** Skeleton — jadval/karta yuklanayotganda "sakrash" bo'lmasligi uchun */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-ink/[0.06] dark:bg-ink/[0.08]",
        className,
      )}
    />
  );
}

export function TableSkeleton({
  rows = 5,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="divide-y divide-ink/5">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-4">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton
              key={c}
              className={cn("h-4", c === 0 ? "w-40" : "w-20", "shrink-0")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ErrorBox({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] leading-relaxed text-rose-700 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/25",
        className,
      )}
      role="alert"
    >
      <AlertTriangle size={17} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function InfoBox({
  children,
  tone = "info",
  className,
}: {
  children: ReactNode;
  tone?: "info" | "warn" | "success";
  className?: string;
}) {
  const map = {
    info: "bg-forest-50 text-forest-900 ring-forest-100 dark:bg-forest-800/15 dark:text-forest-200 dark:ring-forest-700/30",
    warn: "bg-amber-50 text-amber-800 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/25",
    success:
      "bg-forest-50 text-forest-800 ring-forest-100 dark:bg-forest-800/15 dark:text-forest-200 dark:ring-forest-700/30",
  }[tone];
  const Icon =
    tone === "warn" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-2xl px-4 py-3 text-[12.5px] leading-relaxed ring-1",
        map,
        className,
      )}
    >
      <Icon size={15} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ========================================================================== */
/*  Modal                                                                     */
/* ========================================================================== */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
  size,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const width =
    size === "xl"
      ? "sm:max-w-5xl"
      : size === "lg" || wide
        ? "sm:max-w-3xl"
        : size === "sm"
          ? "sm:max-w-sm"
          : "sm:max-w-lg";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-cream shadow-lift animate-fade-up sm:rounded-3xl",
          width,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-ink/5 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="font-display text-[19px] leading-tight text-forest-950">
              {title}
            </h3>
            {description && (
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink/55">
                {description}
              </p>
            )}
          </div>
          <button
            className="btn-icon shrink-0"
            onClick={onClose}
            aria-label="Yopish"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-ink/5 bg-surface2/60 px-5 py-3.5 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Xavfli amal uchun tasdiqlash oynasi */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Tasdiqlash",
  danger,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Bekor qilish
          </button>
          <button
            className={danger ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[13.5px] leading-relaxed text-ink/70">{body}</div>
    </Modal>
  );
}

/* ========================================================================== */
/*  Badge / Toast / misc                                                      */
/* ========================================================================== */

export function Badge({
  children,
  tone = "sage",
  dot,
}: {
  children: ReactNode;
  tone?: "sage" | "forest" | "amber" | "rose" | "sky" | "slate";
  dot?: boolean;
}) {
  const tones = {
    sage: "bg-sage-100 text-forest-900 dark:bg-sage-200/30 dark:text-forest-100",
    forest: "bg-forest-800 text-white dark:text-forest-50",
    amber:
      "bg-amber-100 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-400/20 dark:text-sky-200",
    slate: "bg-ink/5 text-ink/60",
  }[tone];
  return (
    <span className={cn("chip", tones)}>
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      )}
      {children}
    </span>
  );
}

export function Toaster() {
  const ctx = useContext(ToastContext);
  if (!ctx) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex w-[92vw] max-w-sm -translate-x-1/2 flex-col gap-2">
      {ctx.toasts.map((t) => {
        const Icon =
          t.tone === "error"
            ? XCircle
            : t.tone === "info"
              ? Info
              : CheckCircle2;
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex animate-fade-up items-start gap-2.5 rounded-2xl px-4 py-3 text-[13px] font-medium shadow-lift ring-1",
              t.tone === "error"
                ? "bg-rose-600 text-white ring-rose-500"
                : t.tone === "info"
                  ? "bg-surface text-ink ring-ink/10"
                  : "bg-forest-900 text-white ring-forest-800 dark:bg-forest-800 dark:text-forest-50 dark:ring-forest-700",
            )}
            role="status"
          >
            <Icon size={16} className="mt-0.5 shrink-0" />
            <span className="min-w-0">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ Dropdown --------------------------------- */

export function Dropdown({
  trigger,
  children,
  align = "right",
  width = "w-52",
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          className={cn(
            "absolute z-40 mt-2 animate-fade-up overflow-hidden rounded-2xl border border-ink/8 bg-surface p-1.5 shadow-lift",
            width,
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  danger,
  icon,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition disabled:opacity-40",
        danger
          ? "text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
          : "text-ink/75 hover:bg-forest-50 hover:text-forest-900 dark:hover:bg-forest-800/25",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ------------------------------- Switch ---------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      {label && <span className="text-[13px] text-ink/70">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50",
          checked ? "bg-forest-700" : "bg-ink/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}

/* -------------------------------- Tabs ----------------------------------- */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-2xl bg-ink/5 p-1 text-[12.5px] font-semibold",
        className,
      )}
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition",
            value === o.value
              ? "bg-surface text-forest-950 shadow-soft"
              : "text-ink/50 hover:text-ink/80",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export { ToastContext };
