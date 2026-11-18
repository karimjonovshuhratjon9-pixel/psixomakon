import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { supabaseConfig } from "../lib/createAccount";
import { cn } from "./ui";

/**
 * "Supabase sozlamasi holati" tekshiruvi.
 *
 * NEGA KERAK: Edge Function deploy qilinmagan bo'lsa, brauzer faqat
 * "Failed to fetch" beradi va foydalanuvchi buni "internet ishlamayapti"
 * deb tushunadi. Bu panel har bir qatlamni ALOHIDA tekshiradi va aynan
 * qaysi biri yiqilayotganini ko'rsatadi.
 */

type Check = {
  key: string;
  label: string;
  detail: string;
  run: () => Promise<{ ok: boolean; info: string }>;
};

const timeout = (ms: number) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

const CHECKS: Check[] = [
  {
    key: "config",
    label: "Konfiguratsiya (.env)",
    detail: "VITE_SUPABASE_URL va anon kalit to‘ldirilgan",
    run: async () => {
      const { url, key } = supabaseConfig();
      if (!url || !key) return { ok: false, info: ".env fayli to‘liq emas" };
      return { ok: true, info: url.replace(/^https?:\/\//, "") };
    },
  },
  {
    key: "rest",
    label: "Ma’lumotlar bazasi (REST)",
    detail: "Bazaga so‘rov ketadi va javob qaytadi",
    run: async () => {
      const { url, key } = supabaseConfig();
      try {
        const r = await fetch(`${url}/rest/v1/`, {
          headers: { apikey: key },
          signal: timeout(8000),
        });
        return {
          ok: r.status > 0,
          info:
            r.status === 401
              ? "Server javob berdi (401 — bu normal, kalit talab qilinadi)"
              : `HTTP ${r.status}`,
        };
      } catch {
        return { ok: false, info: "So‘rov yiqildi (tarmoq/DNS/firewall)" };
      }
    },
  },
  {
    key: "auth",
    label: "Kirish xizmati (Auth)",
    detail: "Parol bilan kirish provayderi yoqilgan",
    run: async () => {
      const { url, key } = supabaseConfig();
      try {
        const r = await fetch(`${url}/auth/v1/settings`, {
          headers: { apikey: key },
          signal: timeout(8000),
        });
        if (!r.ok) return { ok: false, info: `HTTP ${r.status}` };
        const j = (await r.json()) as { external?: { email?: boolean } };
        return j.external?.email
          ? { ok: true, info: "Email provayder yoqilgan" }
          : {
              ok: false,
              info: "Email provayder O‘CHIRILGAN (Dashboard → Auth)",
            };
      } catch {
        return { ok: false, info: "So‘rov yiqildi" };
      }
    },
  },
  {
    key: "rpc",
    label: "Login diagnostikasi (RPC)",
    detail: "auth_users_diag() — migratsiya qo‘llanganmi",
    run: async () => {
      const { error } = await supabase.rpc("auth_users_diag", {
        p_login: "__probe__",
      });
      if (error) {
        return {
          ok: false,
          info: /could not find|does not exist|schema cache/i.test(
            error.message,
          )
            ? "migration_psyxomakon_fix.sql ishga tushirilmagan"
            : `${error.message.slice(0, 90)}`,
        };
      }
      return { ok: true, info: "Ishlayapti" };
    },
  },
  {
    key: "fn",
    label: "Server funksiyasi (admin-create-user)",
    detail: "O‘quvchi yaratish / parol / bloklash uchun",
    run: async () => {
      const { url, key } = supabaseConfig();
      try {
        // Anonim so‘rov: deploy qilingan bo'lsa 401, yo'q bo'lsa 404 qaytadi.
        const r = await fetch(`${url}/functions/v1/admin-create-user`, {
          method: "POST",
          headers: { apikey: key, "Content-Type": "application/json" },
          body: "{}",
          signal: timeout(15000),
        });
        if (r.status === 404) {
          return {
            ok: false,
            info: "Deploy qilinmagan → functions deploy admin-create-user",
          };
        }
        return { ok: true, info: `Deploy qilingan (HTTP ${r.status})` };
      } catch {
        return {
          ok: false,
          info: "Javob yo‘q — deploy qilinmagan yoki CORS bloklangan",
        };
      }
    },
  },
];

export function SetupCheck({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<
    Record<string, { ok: boolean; info: string } | "loading">
  >({});
  const [ran, setRan] = useState(false);

  async function runAll() {
    setRan(true);
    setState(
      Object.fromEntries(CHECKS.map((c) => [c.key, "loading" as const])),
    );
    const results = await Promise.all(
      CHECKS.map(async (c) => {
        try {
          const r = await c.run();
          setState((s) => ({ ...s, [c.key]: r }));
          return r;
        } catch (e) {
          const r = {
            ok: false,
            info: e instanceof Error ? e.message.slice(0, 90) : "Xatolik",
          };
          setState((s) => ({ ...s, [c.key]: r }));
          return r;
        }
      }),
    );
    setRan(results.every((r) => r.ok));
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-ink/10 bg-surface2/60 p-4",
        compact && "text-[12px]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wrench size={15} className="text-forest-600" />
          <p className="font-semibold text-forest-950">
            Sozlama holati (diagnostika)
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary !px-2.5 !py-1 !text-[12px]"
          onClick={runAll}
        >
          <RefreshCw size={13} />
          {ran ? "Qayta tekshirish" : "Tekshirish"}
        </button>
      </div>

      {!(supabaseConfig().url && supabaseConfig().key) && (
        <p className="mt-2 text-[12px] text-rose-600">
          .env to‘ldirilmagan — tekshiruv ishlamaydi.
        </p>
      )}

      {Object.keys(state).length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {CHECKS.map((c) => {
            const s = state[c.key];
            return (
              <li key={c.key} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">
                  {s === "loading" ? (
                    <Loader2 size={14} className="animate-spin text-ink/40" />
                  ) : s?.ok ? (
                    <CheckCircle2 size={14} className="text-emerald-600" />
                  ) : s ? (
                    <XCircle size={14} className="text-rose-600" />
                  ) : (
                    <span className="inline-block h-3.5 w-3.5 rounded-full bg-ink/15" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-ink/80">{c.label}</p>
                  <p className="text-[11px] leading-snug text-ink/45">
                    {s && s !== "loading" ? s.info : c.detail}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
