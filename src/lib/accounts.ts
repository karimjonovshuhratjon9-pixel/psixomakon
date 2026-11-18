import { supabase } from "./supabase";

/**
 * Login (username) bandligini tekshiradi — `profiles.login` unikal
 * (case-insensitive). Serverda ham bu tekshiriladi; bu yerdagi tekshiruv
 * faqat foydalanuvchiga tezroq javob berish uchun.
 */
export async function isLoginTaken(login: string): Promise<boolean> {
  const v = login.trim().toLowerCase();
  if (!v) return false;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .ilike("login", v)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export function randomPassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

/** Ism-familiyadan login (username) generatsiyasi */
export function slugLogin(fullName: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh",
    щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
    "ʻ": "", "’": "", "'": "", "`": "",
  };
  return fullName
    .toLowerCase()
    .split("")
    .map((c) => (map[c] !== undefined ? map[c] : c))
    .join("")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
}

/* -------------------------------------------------------------------------- */
/* Login / email format qoidalari                                             */
/* -------------------------------------------------------------------------- */

/** 3–30 belgi: lotin harflari, raqamlar, nuqta, pastki chiziq, defis */
export const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateLogin(login: string): string | null {
  const v = login.trim().toLowerCase();
  if (!v) return "Loginni kiriting";
  if (v.length < 3) return "Login kamida 3 belgidan iborat bo‘lsin";
  if (v.length > 30) return "Login 30 belgidan oshmasin";
  if (!LOGIN_RE.test(v))
    return "Login faqat lotin harflari, raqamlar va . _ - belgilaridan iborat bo‘lsin (harf yoki raqam bilan boshlansin)";
  return null;
}

export function validatePassword(pwd: string): string | null {
  if (!pwd) return "Parolni kiriting";
  if (pwd.length < 6) return "Parol kamida 6 belgidan iborat bo‘lsin";
  if (pwd.length > 72) return "Parol 72 belgidan oshmasin";
  return null;
}

export function validateEmail(email: string): string | null {
  const v = email.trim();
  if (!v) return "Emailni kiriting";
  if (!EMAIL_RE.test(v)) return "Email manzil noto‘g‘ri kiritilgan";
  return null;
}
