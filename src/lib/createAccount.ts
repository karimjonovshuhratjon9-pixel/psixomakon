import { supabase, isSupabaseConfigured } from "./supabase";
import { isLoginTaken, validateLogin, validatePassword } from "./accounts";
import { uzError } from "./errors";

/* ==========================================================================
 * Foydalanuvchi boshqaruvi — BARCHASI serverda (Edge Function)
 *
 * BRAUZERDA `auth.signUp()` ISHLATILMAYDI:
 *  - "Confirm email" yoqilganda sessiya qaytmaydi → profil to'ldirilmaydi;
 *  - har chaqiruv email yuborish limitini yoqib yuboradi;
 *  - eng muhimi, o'quvchi YARATILGANDA adminning sessiyasi almashib ketadi.
 *
 * Shu sababli barcha amallar `admin-create-user` Edge Function da bajariladi:
 * JWT + rol serverda tekshiriladi, service_role key faqat serverda yashaydi,
 * Supabase Admin API esa sessiyaga umuman tegmaydi.
 * ========================================================================== */

export interface NewAccount {
  fullName: string;
  /** O'quvchi uchun MAJBURIY EMAS — bo'sh bo'lsa texnik alias serverda yaratiladi */
  email?: string;
  /** O'quvchi uchun asosiy identifikator (username) */
  login?: string;
  password: string;
  phone?: string;
  role: "student" | "psychologist";
  active: boolean;
}

export interface CreatedAccount {
  id: string;
  email: string | null;
  login: string | null;
  /** Tizimga qanday kirish qulay: username bo'lsa — login, aks holda email */
  identifier: string;
}

const FUNCTION_NAME = "admin-create-user";

let fnDeployed: boolean | null = null;

/**
 * Tarmoq xatosining HAQIQIY sababini aniqlaydi.
 *
 * 1) Funksiya umuman deploy qilinmagan bo'lsa, Supabase'ning functions hosti
 *    CORS javob bermaydi va brauzer faqat "Failed to fetch" deydi — u esa
 *    "internet yo'q" degani EMAS.
 * 2) Internet uzilgan bo'lsa, REST so'rovi ham yiqiladi.
 */
async function diagnoseNetworkFailure(original?: unknown): Promise<string> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    return "Supabase sozlamalari (.env) to‘liq emas. Administratorga murojaat qiling.";
  }

  let restOk = false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${url}/rest/v1/`, { headers: { apikey: key }, signal: ctrl.signal });
    clearTimeout(t);
    restOk = r.status > 0; // 401 "Secret API key required" ham — server javob berdi
  } catch {
    restOk = false;
  }

  if (!restOk) {
    return (
      "Supabase loyihasiga ulanib bo‘lmadi. Internet, VPN/firewall yoki " +
      "loyiha manzili (VITE_SUPABASE_URL) ni tekshiring."
    );
  }

  if (fnDeployed === false) {
    return (
      "`admin-create-user` server funksiyasi hali deploy qilinmagan. " +
      "Terminalda bajarib, o‘quvchini qayta yarating: " +
      "`npx supabase functions deploy admin-create-user --project-ref <project-ref>`"
    );
  }

  // REST javob berdi — demak nuqson funksiyaning CORS/preflight javobida.
  // Sababi: funksiya deploy qilinmagan (404) yoki loyihada CORS bloklangan.
  const detail = original instanceof Error ? original.message : String(original ?? "");
  return (
    "Server funksiyasi (`admin-create-user`) javob bermadi. Ehtimoliy sabablar: " +
    "funksiya Supabase’ga deploy qilinmagan yoki brauzer uni CORS sababli " +
    "bloklagan. " +
    `Texnik ma’lumot: ${detail.slice(0, 120)}`
  );
}

interface FnError {
  code?: string;
  message?: string;
}

/** Supabase manzili va anon kaliti (diagnostika uchun ham kerak) */
export function supabaseConfig() {
  return {
    url: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "",
    key: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "",
  };
}

/** Token bilan Edge Function chaqiruvi (umumiy) */
async function callFn<T>(body: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase ulanmagan. .env faylini to‘ldiring.");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error(
      "Sessiya topilmadi. Qaytadan tizimga kiring — so‘ng amalni bajaring.",
    );
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`;

  // Timeout: server javob bermasa brauzer cheksiz kutadi va foydalanuvchi
  // "hech narsa bo'lmayapti" degan holatga tushadi. 25s — Edge Function
  // sovuq start + Akkaunt yaratish uchun yetarli.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(
        "Server 25 sekund ichida javob bermadi. Qayta urinib ko‘ring; " +
          "takrorlansa — administratorga murojaat qiling.",
      );
    }
    // "Failed to fetch" — brauzer sababni AYTA OLMAYDI (CORS, DNS, TLS, offline,
    // adblock). Shuning uchun serverga real so'rov bilan tekshiramiz va aniq
    // xabar beramiz (funksiya deploy qilinmaganmi? loyiha ochirilganmi?).
    throw new Error(await diagnoseNetworkFailure(e));
  }
  clearTimeout(timer);

  // Gateway funksiya topmasa JSON yubormasligi mumkin — status bo'yicha aniqlaymiz
  if (res.status === 404) {
    fnDeployed = false;
  } else if (res.ok) {
    fnDeployed = true;
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const err = (payload as { error?: FnError } | null)?.error;
    if (err?.message) throw new Error(err.message);
    if (res.status === 404) {
      fnDeployed = false;
      throw new Error(
        "Server funksiyasi (`admin-create-user`) topilmadi. U Supabase’ga " +
          "deploy qilinmagan — README → «Edge Function deploy» bo‘limiga qarang.",
      );
    }
    fnDeployed = true;
    if (res.status === 401) {
      throw new Error("Sessiya yaroqsiz yoki muddati tugagan. Qayta kiring.");
    }
    if (res.status === 403) {
      // 403 ikki xil sababdan bo'ladi: (a) rol admin/psixolog emas,
      // (b) akkaunt bloklangan. Ikkalasida ham foydalanuvchi AKKAUNT
      // holatini o'zi tuzata oladi (fix_my_account).
      throw new Error(
        "Bunga ruxsatingiz yo‘q. Akkauntingiz admin yoki psixolog rolida " +
          "bo‘lishi (va bloklanmagan bo‘lishi) kerak. Ekranning pastidagi " +
          "«Akkauntimni tuzatish» bo‘limidan rolni tanlab tuzating.",
      );
    }
    throw new Error(
      uzError({ message: `Serverda xatolik (HTTP ${res.status})` }),
    );
  }

  return payload as T;
}

/**
 * Yangi akkaunt yaratadi.
 * Admin: student yoki psychologist. Psixolog: faqat student.
 */
export async function createAccount(
  input: NewAccount,
): Promise<CreatedAccount> {
  const login = input.login?.trim().toLowerCase() || null;
  const email = input.email?.trim().toLowerCase() || null;

  if (input.fullName.trim().length < 3) {
    throw new Error("Ism va familiyani to‘liq kiriting");
  }
  const pwdErr = validatePassword(input.password);
  if (pwdErr) throw pwdErr;
  if (login) {
    const lErr = validateLogin(login);
    if (lErr) throw lErr;
    if (await isLoginTaken(login)) throw new Error("Bu login allaqachon band");
  }
  // O'quvchi login bilan kiradi; psixologda esa email majburiy (server tekshiradi)
  if (input.role === "psychologist" && !email) {
    throw new Error("Psixolog uchun email kiriting");
  }
  if (input.role === "student" && !login) {
    throw new Error("O‘quvchi uchun login kiriting (email ixtiyoriy)");
  }

  const res = await callFn<{
    ok?: boolean;
    user?: { id: string; email: string | null; login: string | null };
  }>({
    action: "create",
    role: input.role,
    fullName: input.fullName.trim(),
    email,
    login,
    phone: input.phone?.trim() || null,
    password: input.password,
    active: input.active,
  });

  if (!res?.ok || !res.user?.id) {
    throw new Error(
      "Server javobi noto‘g‘ri. Akkaunt yaratilgani tasdiqlanmadi.",
    );
  }

  return {
    id: res.user.id,
    email: res.user.email ?? email,
    login: res.user.login ?? login,
    identifier: res.user.login ?? res.user.email ?? email ?? "",
  };
}

/* -------------------------------------------------------------------------- */
/* Tahrirlash                                                                 */
/* -------------------------------------------------------------------------- */

export interface ProfilePatch {
  fullName?: string;
  login?: string | null;
  phone?: string | null;
  email?: string | null;
  isBlocked?: boolean;
  /** Yangi guruh (null = guruhdan chiqarish) */
  groupId?: string | null;
  password?: string;
}

/**
 * Profilni yangilaydi.
 * `password` bo'lsa — Supabase Admin API orqali parol ham o'zgartiriladi.
 */
export async function updateAccount(
  userId: string,
  patch: ProfilePatch,
): Promise<void> {
  if (patch.login) {
    const lErr = validateLogin(patch.login);
    if (lErr) throw lErr;
  }
  if (patch.password) {
    const pErr = validatePassword(patch.password);
    if (pErr) throw pErr;
  }

  // Guruh alohida jadvalda — avval uni (RLS o'zi tekshiradi), keyin profil.
  if (patch.groupId !== undefined) {
    await setStudentGroup(userId, patch.groupId);
  }

  const hasProfileChange =
    patch.fullName !== undefined ||
    patch.login !== undefined ||
    patch.phone !== undefined ||
    patch.email !== undefined ||
    patch.isBlocked !== undefined ||
    patch.password !== undefined;

  if (!hasProfileChange) return;

  await callFn({ action: "update", userId, patch });
}

/** O'quvchi guruhini almashtirish (bo'sh bo'lsa — guruhsiz) */
export async function setStudentGroup(
  studentId: string,
  groupId: string | null,
): Promise<void> {
  if (groupId) {
    // group_members PK (group_id, student_id): dublikatni jimgina o'tkazamiz
    const { error } = await supabase
      .from("group_members")
      .upsert(
        { group_id: groupId, student_id: studentId },
        { onConflict: "group_id,student_id", ignoreDuplicates: true },
      );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("student_id", studentId);
    if (error) throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Parolni tiklash / bloklash / o'chirish                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parolni HAQIQATAN o'zgartiradi (Supabase Admin API orqali).
 * Yangi parol hech qayerga log yozilmaydi — bir marta qaytariladi.
 */
export async function resetPassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  const pErr = validatePassword(newPassword);
  if (pErr) throw pErr;
  await callFn({ action: "reset_password", userId, password: newPassword });
}

export async function setBlocked(
  userId: string,
  blocked: boolean,
): Promise<void> {
  await callFn({ action: "set_blocked", userId, blocked });
}

/** Asosiy ma'lumotlarni yangilash (parol bundan mustasno) */
export async function updateProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<void> {
  const { password: _ignored, ...rest } = patch;
  void _ignored;
  await callFn({ action: "update", userId, patch: rest });
}

/** Ism/telefon — o'qituvchi va admin uchun server orqali (RLS ga bog'liq emas) */
export async function updateIdentity(
  userId: string,
  fullName: string,
  phone: string | null,
): Promise<void> {
  await callFn({
    action: "update",
    userId,
    patch: { fullName: fullName.trim(), phone },
  });
}

/**
 * Foydalanuvchini butunlay o'chiradi.
 * Profil nusxasi `deleted_profiles` ga arxivlanadi, `audit_log` ga yozuv
 * qo'shiladi, bog'liq tayinlashlar CASCADE bilan o'chadi.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await callFn({ action: "delete", userId });
}
