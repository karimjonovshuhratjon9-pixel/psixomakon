// =============================================================================
// RUHIYAT — admin-create-user (Supabase Edge Function)
//
// NEGA KERAK?
//   Admin panelidan o'quvchi yaratish uchun brauzerda auth.signUp() ishlatish
//   ikki jihatdan noto'g'ri edi:
//     1) signUp "Confirm email" yoqilganda sessiya QAYTARMAYDI → profil
//        to'ldirilmaydi, foydalanuvchi esa abadiy "Email tasdiqlanmagan"
//        holatida qoladi;
//     2) signUp elektron xat yuborish limitiga (email rate limit) urilib,
//        adminni ham, butun loyihani ham bloklaydi.
//   Bundan tashqari Service Role key hech qachon brauzerga chiqmasligi kerak.
//   Shu sababli foydalanuvchi SERVERDA, xavfsiz Admin API orqali yaratiladi.
//
// XAVFSIZLIK:
//   • Chaqiruvchi foydalanuvchi JWT'si tekshiriladi (anonim chaqiruv rad etiladi).
//   • Chaqiruvchining `profiles` yozuvi o'qiladi: role, is_blocked.
//   • Ruxsatlar (RLS bilan bir xil qoida):
//       - admin  → role: 'student' | 'psychologist'
//       - psixolog → faqat 'student' va created_by o'zi
//   • Parol hech qanday jadvalda saqlanmaydi va log'ga yozilmaydi.
//   • SUPABASE_SERVICE_ROLE_KEY faqat Edge Function secret sifatida yashaydi
//     (supabase secrets set ...), frontendга chiqmaydi.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// --- CORS -------------------------------------------------------------------
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Foydalanuvchiga ko'rsatiladigan o'zbekcha xato kodi */
type ErrorCode =
  | "not_authorized"
  | "not_allowed"
  | "invalid_input"
  | "email_taken"
  | "login_taken"
  | "weak_password"
  | "server_error";

function fail(code: ErrorCode, message: string, status = 400) {
  return json({ ok: false, error: { code, message } }, status);
}

// --- Kitob … ---
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

interface Payload {
  action?: "create";
  role?: string;
  fullName?: string;
  email?: string;
  login?: string | null;
  phone?: string | null;
  password?: string;
  active?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return fail("invalid_input", "Faqat POST so'rovi qabul qilinadi", 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return fail(
      "server_error",
      "Server sozlanmagan: SUPABASE_SERVICE_ROLE_KEY topilmadi",
      500,
    );
  }

  // --- 1. Chaqiruvchining JWT sini tekshirish -------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return fail("not_authorized", "Avval tizimga kiring", 401);
  }

  // Foydalanuvchi kontekstidagi client — JWT orqali kim chaqirayotganini bilamiz
  const userClient = createClient(SUPABASE_URL, ANON_KEY ?? SERVICE_ROLE, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(token);

  if (userErr || !user) {
    return fail(
      "not_authorized",
      "Sessiya yaroqsiz yoki muddati tugagan. Qayta kiring.",
      401,
    );
  }

  // --- 2. Chaqiruvchining rolini va blok holatini tekshirish ----------------
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: caller, error: callerErr } = await admin
    .from("profiles")
    .select("id, role, is_blocked")
    .eq("id", user.id)
    .maybeSingle();

  if (callerErr) {
    return fail("server_error", "Profilni tekshirishda xatolik", 500);
  }
  if (!caller || caller.is_blocked) {
    return fail(
      "not_allowed",
      "Akkauntingiz bloklangan yoki profil topilmadi",
      403,
    );
  }
  if (caller.role !== "admin" && caller.role !== "psychologist") {
    return fail(
      "not_allowed",
      "Bunga ruxsatingiz yo'q: akkaunt yaratish faqat admin va psixologga ochiq",
      403,
    );
  }

  // --- 3. Kirish ma'lumotlarini validatsiya qilish --------------------------
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return fail("invalid_input", "So'rov ma'lumotlari o'qilmadi");
  }

  const role = (body.role ?? "student").trim();
  if (role !== "student" && role !== "psychologist") {
    return fail("invalid_input", "Rol noto'g'ri: student yoki psychologist");
  }
  if (caller.role === "psychologist" && role !== "student") {
    return fail(
      "not_allowed",
      "Psixolog faqat o'quvchi akkauntini yarata oladi",
      403,
    );
  }

  const fullName = (body.fullName ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const rawLogin = (body.login ?? "").toString().trim().toLowerCase();
  const login = rawLogin || null;
  const phone = (body.phone ?? "").toString().trim() || null;
  const password = (body.password ?? "").toString();
  const active = body.active !== false;

  if (fullName.length < 3) {
    return fail("invalid_input", "Ism va familiyani to'liq kiriting");
  }
  if (!EMAIL_RE.test(email)) {
    return fail("invalid_input", "Email manzil noto'g'ri kiritilgan");
  }
  if (login && !LOGIN_RE.test(login)) {
    return fail(
      "invalid_input",
      "Login 3-30 belgi bo'lsin: faqat lotin harflari, raqamlar va . _ -",
    );
  }
  if (password.length < 6) {
    return fail("weak_password", "Parol kamida 6 belgidan iborat bo'lsin");
  }

  // --- 4. Bandlik tekshiruvi (aniq xato xabari uchun) -----------------------
  const { data: emailRow } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (emailRow) {
    return fail("email_taken", "Bu email allaqachon ro'yxatdan o'tgan", 409);
  }

  if (login) {
    const { data: loginRow } = await admin
      .from("profiles")
      .select("id")
      .ilike("login", login)
      .maybeSingle();
    if (loginRow) {
      return fail("login_taken", "Bu login allaqachon band", 409);
    }
  }

  // --- 5. Auth foydalanuvchisini Admin API bilan yaratish -------------------
  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    {
      email,
      password,
      email_confirm: true, // email tasdiqlash talab qilinmaydi
      user_metadata: { full_name: fullName },
      app_metadata: { created_by: caller.id },
    },
  );

  if (createErr || !created?.user) {
    const msg = createErr?.message ?? "";
    if (/already|registered|exists/i.test(msg)) {
      return fail("email_taken", "Bu email allaqachon ro'yxatdan o'tgan", 409);
    }
    if (/password/i.test(msg)) {
      return fail("weak_password", "Parol talabga javob bermaydi", 400);
    }
    return fail(
      "server_error",
      `Foydalanuvchini yaratib bo'lmadi: ${msg || "noma'lum xatolik"}`,
      500,
    );
  }

  const newId = created.user.id;

  // --- 6. Profilni yakunlash ------------------------------------------------
  // Trigger (handle_new_user) profilni `student` + blocked holida yaratadi.
  // Agar yo'q bo'lsa — o'zimiz yaratamiz (xavfsiz, idempotent).
  const profilePatch = {
    role,
    full_name: fullName,
    login,
    phone,
    email,
    is_blocked: !active,
    created_by: role === "student" ? caller.id : null,
  };

  const { error: upErr } = await admin
    .from("profiles")
    .update(profilePatch)
    .eq("id", newId);

  if (upErr) {
    // To'liq orqaga qaytarish (yarim yaratilgan akkaunt qolmasin)
    await admin.auth.admin.deleteUser(newId).then(
      () => undefined,
      () => undefined,
    );
    return fail(
      "server_error",
      `Profilni saqlab bo'lmadi: ${upErr.message}`,
      500,
    );
  }

  const { data: saved, error: readErr } = await admin
    .from("profiles")
    .select("id, role, is_blocked, login, email")
    .eq("id", newId)
    .maybeSingle();

  if (readErr || !saved) {
    await admin.auth.admin.deleteUser(newId).then(
      () => undefined,
      () => undefined,
    );
    return fail("server_error", "Profil yaratilganini tasdiqlab bo'lmadi", 500);
  }

  // --- 7. Natija ------------------------------------------------------------
  return json({
    ok: true,
    user: {
      id: saved.id,
      email: saved.email ?? email,
      login: saved.login ?? null,
      role: saved.role,
      isBlocked: saved.is_blocked,
    },
  });
});
