import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Faqat ANON key ishlatiladi. Service role key hech qachon frontendga
 * chiqarilmaydi — barcha huquq tekshiruvlari RLS orqali bazada bajariladi
 * (akkaunt yaratish esa `admin-create-user` Edge Function ichida).
 */
export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);

/**
 * Login sifatida email YOKI username qabul qilinadi.
 *
 * Username bo'lsa, bazadagi `email_for_login()` RPC orqali haqiqiy email
 * topiladi. Avval bu yerda "not-found@psyxomakon.local" kabi SOXTA email
 * qaytarilardi: bunday manzil (a) hech qachon mavjud bo'lmaydi va
 * (b) Supabase email validatsiyasidan o'tmaydi — natijada o'quvchi
 * to'g'ri login/parol bilan ham "Login yoki parol noto'g'ri" xatosini olardi.
 *
 * Endi topilmasa `null` qaytadi va chaqiruvchi aniq o'zbekcha xato ko'rsatadi.
 */
export async function toEmail(identifier: string): Promise<string | null> {
  const v = identifier.trim().replace(/^@+/, "");
  if (!v) return null;
  // Email oxiri `.invalid` bo'lishi mumkin (o'quvchining ichki texnik manzili) —
  // bu ham to'g'ri email, shuning uchun "@ bor" tekshiruvi yetarli.
  if (v.includes("@")) return v.toLowerCase();

  const { data, error } = await supabase.rpc("email_for_login", { p_login: v });
  if (error) throw error;
  return (data as string | null) || null;
}
