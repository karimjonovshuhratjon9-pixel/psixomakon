import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "../context/themeCtx";
import { cn } from "./ui";

const NEXT_LABEL = {
  light: "Yorug‘ rejim",
  dark: "Qorong‘i rejim",
  system: "Tizim mavzusi",
} as const;

/** Topbar uchun mavzu almashtirgich (light → dark → system) */
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const { mode, resolved, cycle } = useTheme();
  const Icon = mode === "system" ? Monitor : resolved === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn(
        "group flex items-center gap-2 rounded-xl text-ink/60 transition hover:bg-ink/5 hover:text-ink",
        compact ? "h-9 w-9 justify-center" : "h-9 px-2.5",
      )}
      title={`${NEXT_LABEL[mode]} — almashtirish uchun bosing`}
      aria-label={`Mavzu: ${NEXT_LABEL[mode]}. Almashtirish`}
    >
      <Icon size={17} className="shrink-0" />
      {!compact && (
        <span className="hidden text-[12px] font-semibold xl:block">
          {NEXT_LABEL[mode]}
        </span>
      )}
    </button>
  );
}
