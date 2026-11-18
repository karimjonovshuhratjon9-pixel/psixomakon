// =============================================================================
// PSIXOMAKON — admin-create-user (Supabase Edge Function)
//
// FOYDALANUVCHI BOSHQARUVI UCHUN YAGONA SERVER-DARVOZA.
//
// Amallar: create | update | reset_password | set_blocked | delete
//
// NEGA BRAUZERDA `auth.signUp()` ISHLATILMAYDI?
//   1) "Confirm email" yoqilganda signUp sessiya QAYTARMAYDI → profil
//      to'ldirilmaydi va o'quvchi hech qachon kira olmaydi;
//   2) har bir chaqiruv tasdiqlash xati yuborishga urinadi → loyiha bo'ylab
//      `over_email_send_rate_limit` (boshqa akkauntlar ham to'xtaydi);
//   3) signUp chaqiruvchining sessiyasini almashtirib yuborishi mumkin —
//      admin o'quvchi yaratgan zahoti tizimdan chiqib ketadi.
//
// Shu sababli hamma narsa SERVERDA, Supabase Admin API bilan bajariladi.
// Service role key faqat shu funksiyaning secret'i — frontendga chiqmaydi.
//
// O'QUVCHI EMAIL KERAK EMAS:
//   O'quvchi faqat login + parol bilan kiradi. Supabase Auth email-based
//   bo'lgani uchun server ichki (texnik) manzil yaratadi:
//       <login>@students.invalid
//   `.invalid` — RFC 2606 bo'yicha HECH QACHON mavjud bo'lmaydigan TLD,
//   shuning uchun xat yuborilmaydi va manzil hech kimga tegishli emas.
//   Bu manzil HECH QACHON foydalanuvchiga ko'rsatilmaydi.
//
// XAVFSIZLIK:
//   • JWT tekshiriladi (anonim chaqiruv rad etiladi).
//   • Chaqiruvchining roli va blok holati BAZADAN o'qiladi.
//   • Psixolog faqat o'zi yaratgan / guruhidagi o'quvchilarga tegadi.
//   • Psixolog o'z-o'zini yoki boshqa xodimni o'chira/bloklay olmaydi.
//   • Parol hech qanday jadvalga va logga yozilmaydi.
//   • O'chirishdan oldin profil `deleted_profiles` ga arxivlanadi.
//   • Barcha muhim amallar `audit_log` ga yoziladi.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ErrorCode =
  | "not_authorized"
  | "not_allowed"
  | "invalid_input"
  | "email_taken"
  | "login_taken"
  | "weak_password"
  | "not_found"
  | "server_error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(code: ErrorCode, message: string, status = 400) {
  return json({ ok: false, error: { code, message } }, status);
}

/**
 * 403 sababi ANIQ aytiladi + "kim ekanligini aniqlash" uchun email qaytadi.
 * Konsol/Network'da HECH QANDAY maxfiy ma'lumot (parol, token) chiqmaydi.
 *
 * NEGA: 403 ning ikki sababi bor — rol admin/psixolog emas yoki bloklangan.
 * "Bunga ruxsatingiz yo'q" degan quruq matn foydalanuvchiga qaysi akkaunt bilan
 * kirganini ham, nimani tuzatish kerakligini ham aytmaydi.
 */
function notAllowed(reason: string, email: string | null) {
  const who = email ? ` Joriy akkaunt: ${email}.` : "";
  return fail(
    "not_allowed",
    `${reason}${who} Rolni / blok holatini tuzatish: Sozlamalar → " +
      "«Akkauntimni tuzatish», yoki SQL: select * from public.fix_my_account('admin');`,
    403,
  );
}

function notAuthorized(reason: string) {
  return fail("not_authorized", reason, 401);
}

/* ----------------------------- validatsiya ------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const STUDENT_EMAIL_DOMAIN = "students.invalid";

/** O'quvchi uchun ichki texnik email (hech qachon ko'rsatilmaydi) */
function aliasEmail(login: string) {
  return `${login}@${STUDENT_EMAIL_DOMAIN}`;
}

interface Payload {
  action?: string;
  role?: string;
  fullName?: string;
  email?: string | null;
  login?: string | null;
  phone?: string | null;
  password?: string;
  active?: boolean;
  userId?: string;
  blocked?: boolean;
  patch?: {
    fullName?: string;
    login?: string | null;
    phone?: string | null;
    email?: string | null;
    isBlocked?: boolean;
    password?: string;
  };
}

/* --------------------------- chaqiruvchi -------------------------------- */

interface Caller {
  id: string;
  role: "admin" | "psychologist" | "student";
  isBlocked: boolean;
  email: string | null;
}

type Admin = ReturnType<typeof createClient>;

/** Psixolog shu o'quvchi bilan bog'langanmi (created_by yoki umumiy guruh) */
async function teacherHasStudent(
  admin: Admin,
  studentId: string,
  myId: string,
) {
  const { data: st } = await admin
    .from("profiles")
    .select("id, created_by, role")
    .eq("id", studentId)
    .maybeSingle();
  if (!st) return { ok: false as const, reason: "not_found" as const };

  // 1) Akkauntni chaqiruvchi yaratgan
  if (st.created_by && st.created_by === myId) return { ok: true as const };

  // 2) O'quvchi chaqiruvchining guruhida
  const { data: gm } = await admin
    .from("group_members")
    .select("group_id, groups!inner(owner_id)")
    .eq("student_id", studentId);
  const inMyGroup = (gm ?? []).some((r: unknown) => {
    const g = (
      r as { groups?: { owner_id?: string } | { owner_id?: string }[] }
    ).groups;
    const owner = Array.isArray(g) ? g[0]?.owner_id : g?.owner_id;
    return owner === myId;
  });

  return inMyGroup
    ? { ok: true as const }
    : { ok: false as const, reason: "forbidden" as const };
}

async function loadCaller(
  admin: Admin,
  userId: string,
): Promise<Caller | null> {
  const { data } = await admin
    .from("profiles")
    .select("id, role, is_blocked, email")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    role: data.role,
    isBlocked: data.is_blocked,
    email: data.email ?? null,
  };
}

async function audit(
  admin: Admin,
  actor: Caller,
  action: string,
  targetId: string | null,
  details: Record<string, unknown> = {},
) {
  try {
    await admin.from("audit_log").insert({
      actor_id: actor.id,
      actor_role: actor.role,
      action,
      target_id: targetId,
      details,
    });
  } catch {
    // audit yozilmasa ham asosiy amalni to'xtatmaymiz
  }
}

/* ============================== SERVER ================================== */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return fail("invalid_input", "Faqat POST so‘rovi qabul qilinadi", 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return fail(
      "server_error",
      "Server sozlanmagan (service role topilmadi)",
      500,
    );
  }

  /* ---------------------- 1. Chaqiruvchini aniqlash ---------------------- */
  const token = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return notAuthorized("Avval tizimga kiring");

  const userClient = createClient(SUPABASE_URL, ANON_KEY ?? SERVICE_ROLE, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(token);

  if (userErr || !user) {
    return notAuthorized("Sessiya yaroqsiz yoki muddati tugagan. Qaëta kiring.");
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const caller = await loadCaller(admin, user.id);
  if (!caller) {
    return notAllowed(
      "Profil topilmadi. Administratorga murojaat qiling.",
      user.email ?? null,
    );
  }
  if (caller.isBlocked) {
    return notAllowed("Akkauntingiz bloklangan.", caller.email);
  }
  if (caller.role !== "admin" && caller.role !== "psychologist") {
    return notAllowed("Bunga ruxsatingiz yo'q.", caller.email);
  }

  /* ------------------------ 2. So'rovni o'qish -------------------------- */
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return fail("invalid_input", "So‘rov ma’lumotlari o‘qilmadi");
  }

  const action = body.action ?? "create";

  try {
    switch (action) {
      case "create":
        return await handleCreate(admin, caller, body);
      case "update":
        return await handleUpdate(admin, caller, body);
      case "reset_password":
        return await handleResetPassword(admin, caller, body);
      case "set_blocked":
        return await handleSetBlocked(admin, caller, body);
      case "delete":
        return await handleDelete(admin, caller, body);
      default:
        return fail("invalid_input", `Noma’lum amal: ${action}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Ichki tafsilotlarni foydalanuvchiga to'liq ko'rsatmaymiz
    return fail("server_error", `Serverda xatolik: ${msg.slice(0, 200)}`, 500);
  }
});

/* --------------------------------------------------------------------------
 * PROFILNI YOZISH (mustahkam)
 *
 * Nega `.update()` emas? `createUser` triggeri profilni avtomatik yaratadi,
 * lekin ba'zi loyihalarda trigger o'chirilgan/kechiktirilgan bo'lishi mumkin —
 * u holda `update` 0 qatorga tegib, jim "muvaffaqiyat" qaytaradi va o'quvchi
 * `is_blocked = true` holatida qolib ketaveradi. Shu sababli:
 *   1) update;  2) 0 qator bo'lsa — upsert (RLS ni chetlab o'tadigan service_role).
 * -------------------------------------------------------------------------- */
async function upsertProfile(
  admin: Admin,
  id: string,
  values: Record<string, unknown>,
): Promise<string | null> {
  const { data: updated, error } = await admin
    .from("profiles")
    .update(values)
    .eq("id", id)
    .select("id");

  if (!error && updated && updated.length > 0) return null;

  // Trigger yaratmagan yoki RLS xatosi — to'liq qatorni upsert qilamiz
  const { error: upErr } = await admin
    .from("profiles")
    .upsert({ id, ...values }, { onConflict: "id" });

  if (upErr) return upErr.message || error?.message || "Profil saqlanmadi";
  return null;
}

/* ============================== CREATE ================================== */

async function handleCreate(admin: Admin, caller: Caller, body: Payload) {
  const role = (body.role ?? "student").trim();
  if (role !== "student" && role !== "psychologist") {
    return fail("invalid_input", "Rol noto‘g‘ri: student yoki psychologist");
  }
  if (caller.role === "psychologist" && role !== "student") {
    return fail(
      "not_allowed",
      "Psixolog faqat o‘quvchi akkauntini yarata oladi",
      403,
    );
  }

  const fullName = (body.fullName ?? "").trim();
  const login = (body.login ?? "").toString().trim().toLowerCase() || null;
  const rawEmail = (body.email ?? "").toString().trim().toLowerCase();
  const phone = (body.phone ?? "").toString().trim() || null;
  const password = (body.password ?? "").toString();
  const active = body.active !== false;

  if (fullName.length < 3) {
    return fail("invalid_input", "Ism va familiyani to‘liq kiriting");
  }
  if (password.length < 6) {
    return fail("weak_password", "Parol kamida 6 belgidan iborat bo‘lsin");
  }

  // --- O'QUVCHI: login MAJBURIY, email IXTIYORIY ---------------------------
  if (role === "student") {
    if (!login) {
      return fail("invalid_input", "O‘quvchi uchun login kiriting");
    }
    if (!LOGIN_RE.test(login)) {
      return fail(
        "invalid_input",
        "Login 3–30 belgi bo‘lsin: faqat lotin harflari, raqamlar va . _ -",
      );
    }
    if (await loginExists(admin, login)) {
      return fail("login_taken", "Bu login allaqachon band", 409);
    }
  }

  // Admin/psixolog: email MAJBURIY (login bilan ham kirish mumkin)
  if (role === "psychologist" && !rawEmail) {
    return fail("invalid_input", "Psixolog uchun email kiriting");
  }
  if (rawEmail && !EMAIL_RE.test(rawEmail)) {
    return fail("invalid_input", "Email manzil noto‘g‘ri kiritilgan");
  }

  // Kirish uchun haqiqiy email: o'quvchida — ixtiyoriy email yoki texnik alias
  const authEmail =
    role === "student" ? rawEmail || aliasEmail(login as string) : rawEmail;

  const { data: emailRow } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", authEmail)
    .maybeSingle();
  if (emailRow) {
    return fail("email_taken", "Bu email allaqachon ro‘yxatdan o‘tgan", 409);
  }

  /* --- Auth foydalanuvchisini yaratish (Admin API — sessiyaga tegmaydi) --- */
  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    {
      email: authEmail,
      password,
      email_confirm: true, // tasdiqlash xati yuborilmaydi
      user_metadata: { full_name: fullName },
      app_metadata: { created_by: caller.id },
    },
  );

  if (createErr || !created?.user) {
    const msg = createErr?.message ?? "";
    if (/already|registered|exists/i.test(msg)) {
      return fail("email_taken", "Bu email yoki login allaqachon band", 409);
    }
    if (/password/i.test(msg)) {
      return fail("weak_password", "Parol talabga javob bermaydi");
    }
    return fail("server_error", `Foydalanuvchi yaratilmadi: ${msg}`, 500);
  }

  const newId = created.user.id;

  // Trigger `handle_new_user` profilni yaratadi; uni to'ldiramiz (yoki upsert).
  const writeErr = await upsertProfile(admin, newId, {
    role,
    full_name: fullName,
    login,
    phone,
    // o'quvchi texnik aliasini email sifatida SAQLAMAYMIZ
    email: rawEmail || null,
    is_blocked: !active,
    created_by: role === "student" ? caller.id : null,
  });

  if (writeErr) {
    await admin.auth.admin.deleteUser(newId).then(
      () => undefined,
      () => undefined,
    );
    return fail("server_error", `Profil saqlanmadi: ${writeErr}`, 500);
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
    return fail("server_error", "Profil yaratilganini tasdiqlab bo‘lmadi", 500);
  }

  // Kirish manzilini tekshiramiz: o'quvchi login bilan, psixolog email bilan
  // kirishi SHART. Aks holda keyin "login topilmadi" degan chalkash xato chiqadi.
  const { data: authUser } = await admin.auth.admin.getUserById(newId);
  if (!authUser?.user?.email) {
    return fail(
      "server_error",
      "Akkaunt yaratildi, lekin kirish manzili (Auth email) topilmadi. " +
        "Administratorga murojaat qiling.",
      500,
    );
  }

  await audit(admin, caller, "profile.create", newId, {
    role,
    login,
    active,
  });

  return json({
    ok: true,
    user: {
      id: saved.id,
      email: saved.email,
      login: saved.login,
      role: saved.role,
      isBlocked: saved.is_blocked,
    },
  });
}

async function loginExists(admin: Admin, login: string) {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .ilike("login", login)
    .maybeSingle();
  return Boolean(data);
}

/* --------------------- TOUCHABLE QILISH (ruxsat) ------------------------ */

/** Psixolog shu foydalanuvchiga tegish huquqiga egami */
async function canManageStudent(
  admin: Admin,
  caller: Caller,
  targetId: string,
): Promise<{ ok: true; target: TargetRow } | { ok: false; res: Response }> {
  const { data: target } = await admin
    .from("profiles")
    .select("id, role, login, email, full_name, created_by")
    .eq("id", targetId)
    .maybeSingle();

  if (!target) {
    return {
      ok: false,
      res: fail("not_found", "Foydalanuvchi topilmadi", 404),
    };
  }

  if (target.id === caller.id) {
    return {
      ok: false,
      res: fail(
        "not_allowed",
        "O‘z akkauntingizga bu amalni qo‘llab bo‘lmaydi",
        403,
      ),
    };
  }

  if (caller.role === "admin") return { ok: true, target };

  // psixolog
  if (target.role !== "student") {
    return {
      ok: false,
      res: fail(
        "not_allowed",
        "Psixolog faqat o‘quvchilarni boshqara oladi",
        403,
      ),
    };
  }

  const linked = await teacherHasStudent(admin, targetId, caller.id);
  if (!linked.ok) {
    return {
      ok: false,
      res: fail(
        "not_allowed",
        "Bu o‘quvchi sizga tegishli emas — amal rad etildi",
        403,
      ),
    };
  }
  return { ok: true, target };
}

interface TargetRow {
  id: string;
  role: "admin" | "psychologist" | "student";
  login: string | null;
  email: string | null;
  full_name: string;
  created_by: string | null;
}

/* ============================== UPDATE ================================== */

async function handleUpdate(admin: Admin, caller: Caller, body: Payload) {
  const userId = body.userId;
  if (!userId) return fail("invalid_input", "Foydalanuvchi ID si yuborilmadi");

  const perm = await canManageStudent(admin, caller, userId);
  if (!perm.ok) return perm.res;
  const target = perm.target;

  const patch = body.patch ?? {};
  const profilePatch: Record<string, unknown> = {};

  if (patch.fullName !== undefined) {
    const n = String(patch.fullName).trim();
    if (n.length < 3) {
      return fail(
        "invalid_input",
        "Ism va familiya kamida 3 belgidan iborat bo‘lsin",
      );
    }
    profilePatch.full_name = n;
  }

  if (patch.phone !== undefined) {
    profilePatch.phone = patch.phone ? String(patch.phone).trim() : null;
  }

  if (patch.email !== undefined) {
    const e = patch.email ? String(patch.email).trim().toLowerCase() : "";
    if (e && !EMAIL_RE.test(e)) {
      return fail("invalid_input", "Email manzil noto‘g‘ri kiritilgan");
    }
    profilePatch.email = e || null;
  }

  // Login — unikallikni server tekshiradi
  let newAuthEmail: string | null = null;
  if (patch.login !== undefined) {
    const login = patch.login ? String(patch.login).trim().toLowerCase() : "";
    if (!login) {
      if (target.role === "student") {
        return fail(
          "invalid_input",
          "O‘quvchi uchun login bo‘sh bo‘lmasligi kerak",
        );
      }
      profilePatch.login = null;
    } else {
      if (!LOGIN_RE.test(login)) {
        return fail(
          "invalid_input",
          "Login 3–30 belgi bo‘lsin: faqat lotin harflari, raqamlar va . _ -",
        );
      }
      if (login !== (target.login ?? "").toLowerCase()) {
        if (await loginExists(admin, login)) {
          return fail("login_taken", "Bu login allaqachon band", 409);
        }
      }
      profilePatch.login = login;
      newAuthEmail = login;
    }
  }

  // Blok holati — faqat admin (EDGE tomonda ham tekshiriladi)
  if (patch.isBlocked !== undefined) {
    if (caller.role !== "admin") {
      return fail(
        "not_allowed",
        "Bloklash faqat administratorga ruxsat etilgan",
        403,
      );
    }
    profilePatch.is_blocked = Boolean(patch.isBlocked);
  }

  // Parol (ixtiyoriy — bir amalda)
  if (patch.password) {
    const pwd = String(patch.password);
    if (pwd.length < 6) {
      return fail("weak_password", "Parol kamida 6 belgidan iborat bo‘lsin");
    }
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: pwd,
    });
    if (error) {
      return fail(
        "server_error",
        `Parol o‘zgartirilmadi: ${error.message}`,
        500,
      );
    }
  }

  if (Object.keys(profilePatch).length === 0) {
    return json({ ok: true, updated: [] });
  }

  const updMsg = await upsertProfile(admin, userId, profilePatch);
  if (updMsg) {
    const dup = /duplicate key|unique/i.test(updMsg);
    return fail(
      dup ? "login_taken" : "server_error",
      dup ? "Bu login allaqachon band" : `Saqlanmadi: ${updMsg}`,
      dup ? 409 : 500,
    );
  }

  /* --- Login o'zgardi: Auth emailini ham yangilaymiz ---------------------- */
  // O'quvchi texnik alias bilan ishlaydi → username o'zgarsa email ham
  // o'zgarishi SHART, aks holda yangi login bilan kirib bo'lmaydi.
  if (newAuthEmail) {
    const currentEmail = (target.email ?? "").toLowerCase();
    const usesAlias =
      target.role === "student" &&
      (currentEmail.endsWith(`@${STUDENT_EMAIL_DOMAIN}`) || !currentEmail);

    if (usesAlias) {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        email: aliasEmail(newAuthEmail),
        email_confirm: true,
      });
      if (error) {
        return fail(
          "server_error",
          "Login saqlandi, lekin kirish manzilini yangilab bo‘lmadi. " +
            "Administratorga murojaat qiling.",
          500,
        );
      }
    }
  }

  await audit(admin, caller, "profile.update", userId, {
    fields: Object.keys(profilePatch),
    password_changed: Boolean(patch.password),
  });

  return json({ ok: true, updated: Object.keys(profilePatch) });
}

/* =========================== RESET PASSWORD ============================= */

async function handleResetPassword(
  admin: Admin,
  caller: Caller,
  body: Payload,
) {
  const userId = body.userId;
  const password = (body.password ?? "").toString();
  if (!userId) return fail("invalid_input", "Foydalanuvchi ID si yuborilmadi");
  if (password.length < 6) {
    return fail("weak_password", "Parol kamida 6 belgidan iborat bo‘lsin");
  }

  const perm = await canManageStudent(admin, caller, userId);
  if (!perm.ok) return perm.res;

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    return fail("server_error", `Parol o‘zgartirilmadi: ${error.message}`, 500);
  }

  // Parol HECH QAYERGA yozilmaydi — faqat fakt qayd etiladi
  await audit(admin, caller, "profile.reset_password", userId, {});
  return json({ ok: true });
}

/* ============================= SET BLOCKED ============================== */

async function handleSetBlocked(admin: Admin, caller: Caller, body: Payload) {
  const userId = body.userId;
  if (!userId) return fail("invalid_input", "Foydalanuvchi ID si yuborilmadi");
  if (caller.role !== "admin") {
    return fail(
      "not_allowed",
      "Bloklash faqat administratorga ruxsat etilgan",
      403,
    );
  }

  const perm = await canManageStudent(admin, caller, userId);
  if (!perm.ok) return perm.res;

  const blocked = Boolean(body.blocked);

  const { error } = await admin
    .from("profiles")
    .update({ is_blocked: blocked })
    .eq("id", userId);
  if (error) return fail("server_error", `Saqlanmadi: ${error.message}`, 500);

  // Bloklangan foydalanuvchining mavjud sessiyalarini ham bekor qilamiz —
  // aks holda u ochiq sahifada ishlashda davom etadi.
  if (blocked) {
    await admin.auth.admin.signOut(userId, "global").then(
      () => undefined,
      () => undefined, // eski versiyalarda bu imkoniyat bo'lmasligi mumkin
    );
  }

  await audit(admin, caller, "profile.block", userId, { blocked });
  return json({ ok: true, blocked });
}

/* ================================ DELETE ================================ */

async function handleDelete(admin: Admin, caller: Caller, body: Payload) {
  const userId = body.userId;
  if (!userId) return fail("invalid_input", "Foydalanuvchi ID si yuborilmadi");

  const perm = await canManageStudent(admin, caller, userId);
  if (!perm.ok) return perm.res;
  const target = perm.target;

  // Psixolog o'chira olmaydi — faqat admin (o'chirish natijalarga ta'sir qiladi)
  if (caller.role !== "admin") {
    return fail(
      "not_allowed",
      "O‘chirish faqat administratorga ruxsat etilgan. " +
        "Bloklashingiz yoki tayinlashlarni bekor qilishingiz mumkin.",
      403,
    );
  }

  // 1. Arxiv nusxasi (audit uchun)
  const { data: full } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  const { data: stats } = await admin
    .from("attempts")
    .select("id, status")
    .eq("student_id", userId);

  await admin.from("deleted_profiles").upsert({
    id: userId,
    role: target.role,
    full_name: target.full_name,
    login: target.login,
    email: target.email,
    phone: (full as { phone?: string | null } | null)?.phone ?? null,
    created_by: target.created_by,
    snapshot: full ?? {},
    deleted_by: caller.id,
  });

  // 2. Auth foydalanuvchisini o'chirish.
  //    `profiles.id` FOREIGN KEY ... ON DELETE CASCADE → profil ham o'chadi,
  //    tayinlashlar/urinishlar ham cascade bilan ketadi.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return fail("server_error", `O‘chirilmadi: ${error.message}`, 500);
  }

  await audit(admin, caller, "profile.delete", userId, {
    role: target.role,
    login: target.login,
    attempts: stats?.length ?? 0,
    submitted: (stats ?? []).filter(
      (s: { status: string }) => s.status === "submitted",
    ).length,
    archived: true,
  });

  return json({
    ok: true,
    archived: true,
    attempts: stats?.length ?? 0,
  });
}
