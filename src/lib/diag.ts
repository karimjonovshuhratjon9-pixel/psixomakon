import { supabase } from "./supabase";

/**
 * Diagnostika va o'z-o'zini tiklash.
 *
 * NEGA KERAK: admin o'quvchini yaratgandan keyin o'quvchi "Login yoki parol
 * noto'g'ri" yoki "Profil topilmadi" xatosini olishi mumkin. Sabab har xil
 * bo'ladi (auth manzili, RLS, blok holati). Bu yerdagi ikki funksiya
 * foydalanuvchiga AYNAN qaysi qadamda muammo borligini aytadi va biz
 * tuzata oladigan qismini avtomatik tuzatadi.
 */

/** Login → Auth email bog'lanishi to'g'rimi (faqat true/false, RPC) */
export async function loginLookupOk(login: string): Promise<boolean> {
  const value = login.trim().toLowerCase();
  if (!value) return false;
  const { data, error } = await supabase.rpc("auth_users_diag", {
    p_login: value,
  });
  if (error) return false;
  return Boolean(data);
}

/**
 * Sessiya bor, lekin profil yo'q bo'lsa bir marta tiklashga urinadi.
 * `repair_my_profile()` rol va blok holatiga TEGMAYDI.
 */
export async function tryRepairProfile(login?: string): Promise<boolean> {
  const { error } = await supabase.rpc("repair_my_profile", {
    p_login: login?.trim().toLowerCase() || null,
  });
  return !error;
}
