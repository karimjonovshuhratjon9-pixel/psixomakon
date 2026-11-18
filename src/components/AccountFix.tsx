import { useState } from "react";
import { Wrench, AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/toastCtx";

/**
 * "Akkauntimni tuzatish" — bosh administrator uchun.
 *
 * MUAMMO: birinchi admin akkaunti README bo'yicha Dashboard → Add user orqali
 * yaratiladi. `handle_new_user` triggeri esa HAR QANDAY yangi auth
 * foydalanuvchisini `student` + `is_blocked = true` qilib yaratadi.
 * Agar `create_admin.sql` ishlatilmasa, adminning profili `student` bo'lib
 * qoladi: u tizimga kiradi, lekin admin panelida "Bunga ruxsatingiz yo'q"
 * (403) oladi.
 *
 * Funksiya xavfsiz: rol faqat `admin` yoki `psychologist` ga o'zgartiriladi,
 * `blocked` dan faqat faollashtirish (false) mumkin, `created_by` ga
 * tegmaydi. `security definer` — RLS ham buni to'smaydi.
 */
export function AccountFix() {
  const { profile, refresh, signOut } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<"admin" | "psychologist">("admin");
  const [busy, setBusy] = useState(false);

  if (!profile) return null;
  if (profile.role === "admin" && !profile.is_blocked) return null;

  async function apply() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("fix_my_account", {
        p_role: mode,
      });
      if (error) throw error;
      if (!data) {
        toast(
          "Akkauntni o‘zgartirib bo‘lmadi. Administrator bilan bog‘laning.",
          "error",
        );
        return;
      }
      await refresh();
      toast(
        `Akkaunt ${mode === "admin" ? "administrator" : "psixolog"} sifatida tiklandi`,
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Xatolik", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-6 w-full max-w-md p-6 text-left">
      <div className="flex items-start gap-2.5">
        <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold text-forest-950">
            Akkaunt roli to‘liq sozlanmagan
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink/55">
            Sizning profilingiz <b>{profile.role}</b>
            {profile.is_blocked ? " va bloklangan" : ""} holatida. Shuning uchun
            o‘quvchi qo‘shish (va boshqa boshqaruv amallari) rad etiladi.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <label className="label">Akkaunt turi</label>
        <select
          className="field"
          value={mode}
          onChange={(e) => setMode(e.target.value as "admin" | "psychologist")}
        >
          <option value="admin">Bosh administrator</option>
          <option value="psychologist">Psixolog</option>
        </select>
      </div>

      <button
        className="btn-primary mt-4 w-full"
        onClick={apply}
        disabled={busy}
      >
        <Wrench size={15} /> {busy ? "Tuzatilmoqda..." : "Akkauntimni tuzatish"}
      </button>

      <button
        className="mt-3 w-full text-[12px] text-ink/40 underline-offset-4 hover:underline"
        onClick={signOut}
        type="button"
      >
        Boshqa akkaunt bilan kirish
      </button>
    </div>
  );
}
