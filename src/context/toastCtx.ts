import { createContext, useContext } from "react";

export interface Toast {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
}

export interface ToastCtx {
  toasts: Toast[];
  push: (message: string, tone?: Toast["tone"]) => void;
}

export const ToastContext = createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.push;
}

export function useToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToasts must be used within ToastProvider");
  return ctx.toasts;
}
