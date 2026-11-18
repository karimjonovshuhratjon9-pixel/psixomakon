export function errMessage(e: unknown): string {
  if (!e) return "Noma'lum xatolik";
  if (typeof e === "string") return e;
  const anyE = e as {
    message?: string;
    error_description?: string;
    details?: string;
    hint?: string;
  };
  return (
    anyE.message ||
    anyE.error_description ||
    anyE.details ||
    anyE.hint ||
    "Xatolik yuz berdi"
  );
}

/**
 * Matnning o‘zbekcha (bizning) xabar ekanini aniqlovchi belgilar.
 * "a-z dan tashqari hammasi" testi ishlamaydi — o‘zbekcha ham lotin
 * harflarida yoziladi. Shuning uchun maxsus belgi + o‘zbekcha so‘zlar.
 */
const UZ_HINT =
  /[‘’ʻ]|\b(murojaat|topilmadi|iltimos|qiling|xatolik|yuz berdi|kerak|mavjud|vaqtincha|kiring)\b/i;

/**
 * Supabase / tarmoq xatolarini foydalanuvchi tushunadigan o‘zbek tiliga
 * o‘giradi. Texnik matn (§, errcode, JWT...) interfeysda ko‘rsatilmaydi.
 */
export function uzError(e: unknown): string {
  const msg = errMessage(e);

  // --- Kirish (Supabase Auth) ---
  if (/invalid login credentials|invalid_credentials/i.test(msg))
    return "Login yoki parol noto‘g‘ri. Iltimos, qayta tekshiring.";
  if (/email not confirmed|email_not_confirmed/i.test(msg))
    return "Email tasdiqlanmagan. Administratorga murojaat qiling — akkaunt tasdiqlanishi kerak.";
  if (/email_address_invalid|invalid email/i.test(msg))
    return "Email manzili noto‘g‘ri kiritilgan.";
  if (/email_address_not_authorized/i.test(msg))
    return "Bu email manzilga ruxsat berilmagan. Boshqa email kiriting.";
  if (/over_email_send_rate_limit|email rate limit/i.test(msg))
    return "Email yuborish limiti tugadi. Iltimos, keyinroq qayta urinib ko‘ring.";
  if (
    /user already registered|already registered|already been registered|user_already_exists/i.test(
      msg,
    )
  )
    return "Bu email allaqachon ro‘yxatdan o‘tgan. Boshqa email kiriting.";
  if (
    /weak.?password|password should be at least|password_too_short/i.test(msg)
  )
    return "Parol juda oddiy yoki qisqa. Kamida 6 belgidan iborat parol kiriting.";
  if (/same_password/i.test(msg))
    return "Yangi parol eskisidan farq qilishi kerak.";
  if (/signups? not allowed|signup_disabled/i.test(msg))
    return "Yangi akkaunt yaratish vaqtincha o‘chirilgan. Administratorga murojaat qiling.";
  if (/user not found/i.test(msg)) return "Bunday foydalanuvchi topilmadi.";
  if (/jwt|token has expired|refresh token/i.test(msg))
    return "Sessiya muddati tugagan. Qaytadan tizimga kiring.";

  // --- Ruxsat (RLS / funksiya) ---
  if (/row-level security|new row violates|permission denied/i.test(msg))
    return "Ruxsat yo‘q. Bu amalni bajarish uchun vakolatingiz yetarli emas.";
  if (/duplicate key value.*unique constraint/i.test(msg))
    return "Bu login yoki email allaqachon band. Boshqa qiymat kiriting.";
  if (/not_allowed/i.test(msg)) return "Bunga ruxsatingiz yo‘q.";

  // --- Ma'lumotlar bazasi sxemasi (odatda migratsiya qo'llanmagan) ---
  if (/does not exist|undefined column|undefined_table|undefined_function|schema cache/i.test(msg))
    return (
      "Ma’lumotlar bazasi sxemasi to‘liq emas (ustun/funksiya topilmadi). " +
      "Administrator supabase/migrations fayllarini ishga tushirishi kerak. " +
      `Texnik ma’lumot: ${msg.slice(0, 140)}`
    );

  // --- Tarmoq ---
  if (
    /failed to fetch|networkerror|load failed|network request failed/i.test(msg)
  )
    return "Serverga ulanib bo‘lmadi. Internet aloqasini tekshiring.";
  if (/functionsfetch|functionsrelayerror|edge function/i.test(msg))
    return "Server funksiyasi javob bermadi. Administratorga murojaat qiling.";

  // --- Biznes-mantiq: biz yozgan o‘zbekcha xabarlar o‘zgarishsiz qoladi ---
  // Texnik inglizcha matn interfeysga chiqmaydi.
  // O‘zbekcha matnni inglizchadan ajratish uchun "a-z dan tashqari" testi
  // YARAMAYDI: "murojaat", "login" kabi so‘zlar lotin harflaridan iborat.
  // Shuning uchun o‘zbekchaga xos belgi/so‘zlar ro‘yxati ishlatiladi.
  if (UZ_HINT.test(msg)) return msg;

  // Noma'lum texnik xato — UMUMIY matn bilan yashirmaymiz: sababini qisqa
  // ko'rinishda qo'shamiz, aks holda "Xatolik yuz berdi" hech narsa demaydi.
  return (
    "Xatolik yuz berdi. Qayta urinib ko‘ring yoki administratorga murojaat " +
    `qiling. Texnik ma’lumot: ${msg.slice(0, 160)}`
  );
}
