import { useState } from "react";
import { LogOut, ShieldCheck, User, Mail, Copy, Info } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/toastCtx";
import { supabase } from "../lib/supabase";
import { updateIdentity } from "../lib/createAccount";
import { uzError } from "../lib/errors";
import { Badge, Card, ErrorBox, PageHeader, cn } from "../components/ui";
import { AccountFix } from "../components/AccountFix";
import { initials } from "../lib/api";

const ROLE: Record<string, string> = {
  admin: "Bosh administrator",
  psychologist: "Psixolog",
  student: "O‘quvchi",
};

export function SettingsPage() {
  const { profile, signOut, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  async function saveProfile() {
    setError(null);
    setBusy(true);
    try {
      if (profile!.role === "admin" || profile!.role === "psychologist") {
        // RLS: admin boshqa hech kimning profilini o'zgartira olmaydi, lekin
        // o'z qatorini yangilay oladi — baribir server orqali yuboramiz,
        // shunda rol/huquq o'zgarsa ham ishlaydi.
        await updateIdentity(profile!.id, name, phone.trim() || null);
      } else {
        const { error } = await supabase
          .from("profiles")
          .update({ full_name: name.trim(), phone: phone.trim() || null })
          .eq("id", profile!.id);
        if (error) throw error;
      }
    } catch (e) {
      setBusy(false);
      return setError(uzError(e));
    }
    setBusy(false);
    await refresh();
    toast("Profil saqlandi");
  }

  async function changePassword() {
    setError(null);
    if (pwd.length < 6) return setError("Parol kamida 6 belgi bo‘lishi kerak");
    if (pwd !== pwd2) return setError("Parollar mos kelmadi");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) return setError(uzError(error));
    setPwd("");
    setPwd2("");
    toast("Parol o‘zgartirildi");
  }

  return (
    <div>
      <PageHeader
        title="Sozlamalar"
        subtitle="Profil ma’lumotlari va xavfsizlik."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {profile.role !== "admin" && <AccountFix />}
          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-forest-950">
              <User size={16} className="text-forest-600" /> Profil
            </h2>
            <div className="space-y-4">
              <div>
                <label className="label">To‘liq ism</label>
                <input
                  className="field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Telefon</label>
                <input
                  className="field"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Login</label>
                <div className="flex items-center gap-2">
                  <input
                    className="field font-mono"
                    value={profile.login ?? "—"}
                    readOnly
                  />
                  <button
                    className="btn-secondary shrink-0 !px-3"
                    onClick={() => {
                      if (profile.login)
                        navigator.clipboard.writeText(profile.login);
                      toast("Nusxa olindi");
                    }}
                  >
                    <Copy size={15} />
                  </button>
                </div>
              </div>
              {error && <ErrorBox message={error} />}
              <button
                className="btn-primary"
                onClick={saveProfile}
                disabled={busy}
              >
                Saqlash
              </button>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-forest-950">
              <ShieldCheck size={16} className="text-forest-600" /> Parolni
              almashtirish
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Yangi parol</label>
                <input
                  type="password"
                  className="field"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Tasdiqlash</label>
                <input
                  type="password"
                  className="field"
                  value={pwd2}
                  onChange={(e) => setPwd2(e.target.value)}
                />
              </div>
            </div>
            <button
              className="btn-secondary mt-4"
              onClick={changePassword}
              disabled={busy}
            >
              Parolni yangilash
            </button>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5 text-center">
            <div
              className={cn(
                "mx-auto grid h-20 w-20 place-items-center rounded-3xl text-xl font-bold",
                "bg-sage-200 text-forest-900",
              )}
            >
              {initials(profile.full_name || "R")}
            </div>
            <p className="mt-3 font-semibold text-forest-950">
              {profile.full_name}
            </p>
            <div className="mt-2 flex justify-center">
              <Badge tone="forest">{ROLE[profile.role]}</Badge>
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-ink/45">
              <Mail size={13} /> {profile.login || "—"}
            </p>
            <button
              className="btn-ghost mt-4 w-full text-rose-600 hover:bg-rose-50"
              onClick={signOut}
            >
              <LogOut size={15} /> Chiqish
            </button>
          </Card>

          <Card className="p-5">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink/60">
              <Info size={14} /> Xavfsizlik
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink/45">
              Barcha ma’lumotlar Supabase Row Level Security siyosatlari bilan
              himoyalangan. Parollar bcrypt orqali saqlanadi va hech kimga
              ko‘rinmaydi.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
