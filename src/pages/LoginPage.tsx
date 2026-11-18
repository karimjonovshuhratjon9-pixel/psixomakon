import { useState, type FormEvent } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  Sparkles,
  User,
  ArrowRight,
  ShieldCheck,
  Zap,
  LineChart,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { uzError } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { SetupCheck } from "../components/SetupCheck";

export function LoginPage() {
  const { signIn, configured } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await signIn(identifier, password);
      if (err) {
        setError(uzError(err));
        return;
      }

      // Kirish muvaffaqiyatli. Profil o'qilmasa Protected() ekraniga o'tib
      // "Profil topilmadi" yoki cheksiz yuklanish bo'lardi — buni oldin
      // shu yerda aniqlaymiz (tushunarli xabar bilan).
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      const { data: p, error: pErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", uid ?? "")
        .maybeSingle();

      if (!p) {
        await supabase.auth.signOut();
        setError(
          pErr
            ? `Profilni o‘qishda xatolik: ${pErr.message.slice(0, 120)}`
            : "Login va parol to‘g‘ri, lekin profil topilmadi. " +
                "Administrator «Sozlama holati» diagnostikasini ishga tushirsin.",
        );
      }
    } catch (err) {
      setError(uzError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: brand / marketing */}
      <div className="relative hidden overflow-hidden brand-panel p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-forest-700/40 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-sage-500/20 blur-3xl" />
        <div className="bg-grain absolute inset-0 opacity-30" />

        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15">
            <Sparkles size={20} />
          </div>
          <div>
            <p className="font-display text-2xl tracking-wide text-white">
              PSIXOMAKON
            </p>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/40">
              psixologik platforma
            </p>
          </div>
        </div>

        <div className="relative max-w-md animate-fade-up">
          <h1 className="font-display text-[40px] leading-[1.12] text-white">
            Har bir ruhiyat —
            <br />
            alohida e’tiborga loyiq.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/60">
            Psixologlar uchun o‘quvchilarni boshqarish, testlar yaratish va
            natijalarni tahlil qilish uchun yagona, xavfsiz va nafis platforma.
          </p>

          <div className="mt-10 space-y-3">
            {[
              {
                icon: <ShieldCheck size={16} />,
                t: "Yopiq tizim",
                d: "Akkauntlar faqat vakolatli shaxslar tomonidan yaratiladi",
              },
              {
                icon: <Zap size={16} />,
                t: "Avtomatik baholash",
                d: "Standart va psixologik testlar uchun tayyor scoring",
              },
              {
                icon: <LineChart size={16} />,
                t: "Chuqur tahlil",
                d: "Guruh statistikasi, o‘rtacha natija va diagrammalar",
              },
            ].map((f) => (
              <div
                key={f.t}
                className="flex items-start gap-3 rounded-2xl bg-white/5 p-3.5 ring-1 ring-white/10"
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sage-300/20 text-sage-200">
                  {f.icon}
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-white/90">
                    {f.t}
                  </p>
                  <p className="text-[12px] text-white/45">{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] text-white/30">
          © {new Date().getFullYear()} PSIXOMAKON. Barcha huquqlar himoyalangan.
        </p>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center bg-cream px-5 py-12">
        <div className="w-full max-w-[400px] animate-fade-up">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-forest-800 text-white dark:text-forest-50">
              <Sparkles size={18} />
            </div>
            <p className="font-display text-2xl tracking-wide text-forest-950">
              PSIXOMAKON
            </p>
          </div>

          <h2 className="font-display text-[30px] leading-tight text-forest-950">
            Tizimga kirish
          </h2>
          <p className="mt-2 text-sm text-ink/50">
            Login va parolingizni kiriting. Akkauntni psixologingiz yoki
            administrator beradi.
          </p>

          {!configured && (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800 ring-1 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/25">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div>
                <b>Supabase ulanmagan.</b> <code>.env</code> faylida{" "}
                <code>VITE_SUPABASE_URL</code> va{" "}
                <code>VITE_SUPABASE_ANON_KEY</code> ni to‘ldiring, so‘ng
                sahifani yangilang.
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="login">
                Login yoki email
              </label>
              <div className="relative">
                <User
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30"
                />
                <input
                  id="login"
                  className="field !pl-10"
                  autoComplete="username"
                  placeholder="masalan: aziz.karimov"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="password">
                Parol
              </label>
              <div className="relative">
                <Lock
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30"
                />
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  className="field !pl-10 !pr-11"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-ink/35 hover:bg-ink/5"
                  aria-label={show ? "Parolni yashirish" : "Parolni ko‘rsatish"}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700 ring-1 ring-rose-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full !py-3"
              disabled={loading || !configured}
            >
              {loading ? "Kirish..." : "Kirish"}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>

          <div className="mt-8 rounded-2xl border border-dashed border-ink/10 p-4 text-[12px] leading-relaxed text-ink/45">
            <b className="text-ink/60">Ochiq ro‘yxatdan o‘tish mavjud emas.</b>{" "}
            O‘quvchi akkauntini psixolog, psixolog akkauntini esa bosh
            administrator yaratadi.
          </div>

          <div className="mt-4 pb-16">
            <SetupCheck compact />
          </div>

          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-[12px] font-medium text-ink/40 underline-offset-4 hover:underline"
            type="button"
          >
            Sahifani yangilash
          </button>
        </div>
      </div>
    </div>
  );
}
