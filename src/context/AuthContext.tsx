import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured, toEmail } from "../lib/supabase";
import { loginLookupOk, tryRepairProfile } from "../lib/diag";
import type { Profile } from "../types";

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  refresh: () => Promise<void>;
  signIn: (identifier: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  configured: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s?.user) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", s.user.id)
      .maybeSingle();
    if (data) {
      setProfile(data as Profile);
      return;
    }

    // Profil topilmadi. Sababi: (a) `on_auth_user_created` triggeri ishlamagan,
    // (b) RLS funksiyalarining EXECUTE huquqi yo'q, (c) akkaunt o'chirilgan.
    // (a) holatda `repair_my_profile()` bir marta tiklaydi — rol/blok holati
    // tegilmaydi, shuning uchun xavfsiz.
    if (!error && (await tryRepairProfile())) {
      const { data: fixed } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", s.user.id)
        .maybeSingle();
      if (fixed) {
        setProfile(fixed as Profile);
        return;
      }
    }

    // Profil trigger bilan yaratilishi kerak. Bo'lmasa — kirishga ruxsat yo'q.
    setProfile(null);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadProfile(data.session);
  }, [loadProfile]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (event === "SIGNED_OUT") {
        setSession(null);
        setProfile(null);
        return;
      }
      setSession(s);
      await loadProfile(s);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const raw = identifier.trim().replace(/^@+/, "");
    if (!raw) return { error: "Login yoki emailni kiriting" };
    if (!password) return { error: "Parolni kiriting" };

    let resolved: string | null;
    try {
      resolved = await toEmail(raw);
    } catch {
      return {
        error:
          "Serverga ulanib bo‘lmadi. Internet aloqasini va Supabase sozlamalarini tekshiring.",
      };
    }

    // Username topilmadi — parolni tekshirishning ma’nosi yo‘q
    if (!resolved) {
      return {
        error:
          "Bunday login topilmadi. Loginni tekshiring yoki administratorga murojaat qiling.",
      };
    }
    const email: string = resolved;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      // Eng ko'p uchraydigan texnik sababni ajratib ko'rsatamiz: profil bazada
      // bor, lekin auth manzili eskirgan (login o'zgargan, alias yangilanmagan).
      // Bunday holatda Supabase "invalid credentials" qaytaradi va sabab
      // foydalanuvchiga ko'rinmaydi.
      const msg = error.message || "";
      const { data: probe } = await supabase
        .from("profiles")
        .select("id")
        .eq("login", raw.toLowerCase())
        .maybeSingle();

      if (probe) {
        const ok = await loginLookupOk(raw);
        if (!ok) {
          return {
            error:
              "Login topildi, lekin akkauntning kirish manzili (Auth email) " +
              "yangilanmagan — shu sababli parol qabul qilinmayapti. " +
              "Administratorga murojaat qiling: u «admin-create-user» " +
              "funksiyasi orqali login ni qayta saqlashi kerak.",
          };
        }
      } else if (/invalid login credentials|invalid_credentials/i.test(msg)) {
        return {
          error:
            "Bunday login topilmadi. Loginni tekshiring yoki administratorga murojaat qiling.",
        };
      }
      return { error: msg };
    }

    // Parol to'g'ri, lekin akkaunt bloklangan bo'lishi mumkin — darhol
    // tushunarli xabar beramiz (Protected ham keyin bloklangan sahifani
    // ko'rsatadi, lekin foydalanuvchi nima uchun kirishi sodir bo'lganini
    // shu zahoti bilishi kerak).
    const uid = data.user?.id;
    if (uid) {
      const { data: p } = await supabase
        .from("profiles")
        .select("is_blocked")
        .eq("id", uid)
        .maybeSingle();
      if (!p) {
        // Bir marta tiklashga urinamiz (faqat bo'sh maydonlar to'ldiriladi)
        await tryRepairProfile(raw.includes("@") ? undefined : raw);
        const { data: fixed } = await supabase
          .from("profiles")
          .select("is_blocked")
          .eq("id", uid)
          .maybeSingle();
        if (!fixed) {
          await supabase.auth.signOut();
          return {
            error:
              "Akkauntingiz uchun profil topilmadi. Administratorga murojaat qiling.",
          };
        }
        if (fixed.is_blocked) {
          await supabase.auth.signOut();
          return {
            error:
              "Akkauntingiz bloklangan. Kirish uchun administrator bilan bog‘laning.",
          };
        }
        return {};
      }
      if (p.is_blocked) {
        // Sessiyani ochiq qoldirmaymiz
        await supabase.auth.signOut();
        return {
          error:
            "Akkauntingiz bloklangan. Kirish uchun administrator bilan bog‘laning.",
        };
      }
    }

    return {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      loading,
      session,
      profile,
      refresh,
      signIn,
      signOut,
      configured: isSupabaseConfigured,
    }),
    [loading, session, profile, refresh, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
