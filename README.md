# PSIXOMAKON — Psixologik test platformasi

React + TypeScript + Vite + Tailwind CSS + Supabase asosidagi psixologlar va o‘quvchilar uchun test platformasi.
Interfeys to‘liq o‘zbek tilida.

---

## 1. Tez ishga tushirish

```bash
npm install
copy .env.example .env      # Windows (PowerShell) — keyin faylni to‘ldiring
npm run dev                 # http://localhost:5173
```

Build va tekshiruv:

```bash
npm run typecheck           # TypeScript xatolarini tekshirish
npm run build               # ishlab chiqarish build (dist/)
npm run preview             # build natijasini ko‘rish
```

---

## 2. Supabase sozlash (majburiy)

### 2.1. Loyiha yaratish

1. [supabase.com](https://supabase.com) → **New project**.
2. **Project Settings → API** bo‘limidan quyidagilarni oling:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`

> ⚠️ `service_role` kalitini **hech qachon** `.env` ga yozmang — u frontendga chiqmasligi kerak.

`.env`:

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 2.2. Sxema va xavfsizlik siyosatlarini qo‘llash

**SQL Editor** da quyidagi fayllarni **shu tartibda** ishga tushiring:

| #   | Fayl                                       | Nima qiladi                                                                                     |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1   | `supabase/schema.sql`                      | Jadvallar, RLS siyosatlari, `score_attempt()` funksiyasi, auth trigger                          |
| 2   | `supabase/seed.sql`                        | 3 ta mavjud namuna test (ixtiyoriy, lekin tavsiya etiladi)                                      |
| 2b  | `supabase/migration_student_login_fix.sql` | **Majburiy**: login (username) → email RPC, `profiles` RLS tuzatishi, natija ustunlarini yopish |
| 2c  | `supabase/migration_user_management.sql`  | **Majburiy**: `profiles.email`, `audit_log`, `deleted_profiles`, import jadvallari |
| 2d  | `supabase/migration_psyxomakon_fix.sql`  | **Majburiy**: RLS funksiyalarining `EXECUTE` huquqi, `profiles_guard`, `repair_my_profile()`, `auth_users_diag()` |
| 3   | `supabase/create_admin.sql`                | Birinchi bosh adminni yaratish (3-bo‘limga qarang). Fayldagi emailni o‘zingiznikiga moslang             |

> **Muhim:** `schema.sql` — idempotent. Har bir siyosatdan oldin `drop policy if exists`
> yozilgan, shuning uchun qayta ishga tushirishda `policy ... already exists` xatosi
> chiqmaydi. Boshqa migratsiyalar ham `if not exists` / `or replace` bilan yozilgan.

### 2.2.1. Nega `migration_student_login_fix.sql` kerak?

Avvalgi holatda admin o‘quvchi yaratardi, lekin o‘quvchi kira olmasdi. Sabablari:

1. `signUp()` brauzerda chaqirilardi va **“Confirm email” yoqilgani uchun sessiya qaytmasdi**
   → profil yangilanmay qolardi (o‘quvchi `is_blocked = true` holida qolardi).
2. Har bir `signUp` tasdiqlash xati yuborishga urinardi → `over_email_send_rate_limit`
   → butun loyihada email orqali ro‘yxatdan o‘tish bloklanardi.
3. Username topilmaganda `toEmail()` soxta `not-found@ruhiyat.local` manzil qaytarardi —
   bunday email Supabase validatsiyasidan o‘tmaydi, ya’ni login **hech qachon** ishlamasdi.

**Yechim:**

- `src/lib/createAccount.ts` endi `auth.signUp()` emas, balki serverdagi
  **`admin-create-user` Edge Function** ni chaqiradi (xavfsiz Admin API, `email_confirm: true`).
  Admin sessiyasi o‘zgarmaydi — admin tizimdan chiqmaydi.
- `migration_psyxomakon_fix.sql` RLS yordamchi funksiyalarining `EXECUTE` huquqini tiklaydi
  (aks holda profil yozilmay, o‘quvchi `is_blocked = true` holida qolib ketardi),
  `repair_my_profile()` orqali buzilgan akkauntlarni tiklaydi va login sahifasiga
  `auth_users_diag()` diagnostikasini beradi.
- Edge Function profilni `update` → 0 qator bo‘lsa `upsert` bilan yozadi — trigger
  ishlamagan loyihalarda ham akkaunt to‘liq yaratiladi.
- Login sahifasi username ni `email_for_login()` RPC orqali haqiqiy emailga o‘giradi.
- `migration_student_login_fix.sql` `profiles` RLS siyosatini, `attempts` ustun
  grant’larini (o‘quvchi ballni ko‘rmaydi) va `teacher_has_student()` ni tuzatadi.

### 2.5. `admin-create-user` Edge Function ni deploy qilish (MAJBURIY)

Fayl: `supabase/functions/admin-create-user/index.ts`

```bash
# 1) Supabase CLI (bir marta)
npm i -g supabase

# 2) Loyihaga ulanish
supabase login
supabase link --project-ref <sizning-project-ref>

# 3) Deploy (service_role kaliti O'ZI secret sifatida qo'shiladi —
#    hech qachon .env ga yoki frontendga yozilmaydi)
supabase functions deploy admin-create-user --project-ref <sizning-project-ref>
```

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` secretlari Edge Function
> muhitida **avtomatik** mavjud. Ularni hech qadamda `.env` ga ko‘chirmang.
>
> Dashboard orqali ham mumkin: **Edge Functions → Create function → nomi: `admin-create-user`** →
> kodni joylang → **Deploy**. `verify_jwt = true` bo‘lsin (sukut bo‘yicha shunday).

Deploy ishlamaganini qanday bilish: admin panelida o‘quvchi yaratishda
“`admin-create-user` server funksiyasi topilmadi” degan o‘zbekcha xato chiqadi.

### 2.6. `authentication/email confirmation` (yangilangan ma’lumot)

Endi akkaunt **serverda** `admin-create-user` Edge Function orqali yaratiladi va u
`email_confirm: true` bilan ishlaydi — **“Confirm email” sozlamasi endi akkaunt yaratishga
ta’sir qilmaydi** (email yuborilmaydi, limit tugamaydi).

Shu bilan birga quyidagilar tekshirilishi shart:

- **Dashboard → Authentication → Sign In / Providers → Email** — provayder **yoqilgan** bo‘lsin,
  aks holda parol bilan kirish (`signInWithPassword`) ishlamaydi.
- **Dashboard → Authentication → URL Configuration**
  - **Site URL**: ilovangiz manzili (masalan `https://sizning-domen.uz`)
  - **Redirect URLs**: o‘sha manzil

> Agar “Confirm email” ni **ON** qoldirmoqchi bo‘lsangiz ham, admin yaratgan o‘quvchilar
> darhol kira oladi — Edge Function emailni server tomonda tasdiqlangan deb yaratadi.

### 2.4. Ochiq ro‘yxatdan o‘tish

Ilovada ro‘yxatdan o‘tish sahifasi **yo‘q**. `auth.users` ga yangi yozuv qo‘shilsa, trigger profilni
**`student` roli va `is_blocked = true`** holatda yaratadi — ya’ni kirish huquqi berilmaydi.
Login sahifasi ham faqat mavjud akkauntlar uchun.

---

## 3. Birinchi bosh adminni yaratish

1. **Authentication → Users → Add user**
   - Email: `admin@psyxomakon.uz`
   - Password: kuchli parol
   - ✅ **Auto Confirm User**
2. `supabase/create_admin.sql` faylini oching, emailni moslang va **SQL Editor** da ishga tushiring:

```sql
update public.profiles
set role = 'admin', is_blocked = false,
    full_name = coalesce(nullif(full_name, ''), 'Bosh administrator')
where id = (select id from auth.users where email = 'admin@psyxomakon.uz');
```

3. `http://localhost:5173/login` → `admin@psyxomakon.uz` + parol bilan kiring.

> Akkauntlar **email** bilan yaratiladi. Login sahifasida emailni ham, psixolog belgilagan
> qulay login (username) ni ham kiritish mumkin — username `email_for_login()` funksiyasi orqali
> emailga aylanadi.

Keyin admindan: psixolog akkauntini yarating → psixolog o‘quvchi yarating → test yaratadi → tayinlaydi.

---

## 4. Rollar va ruxsatlar (backend darajasida)

| Amal                                       |        Admin        |        Psixolog         |     O‘quvchi      |
| ------------------------------------------ | :-----------------: | :---------------------: | :---------------: |
| Psixolog akkauntlarini yaratish / bloklash |         ✅          |           ❌            |        ❌         |
| O‘quvchilarni ko‘rish                      |      barchasi       | faqat o‘zi yaratganlari |        ❌         |
| O‘quvchi akkauntini yaratish               |         ✅          |  ✅ (faqat o‘zi uchun)  |        ❌         |
| Guruhlar                                   |       ko‘rish       |   yaratish/boshqarish   | a’zolikni ko‘radi |
| Kutubxona testlari (`scope = 'library'`)   | yaratish/tahrirlash |    ko‘rish/tayinlash    |        ❌         |
| Shaxsiy testlar (`scope = 'personal'`)     |          —          |   yaratish/tahrirlash   |        ❌         |
| Test tayinlash                             |         ✅          |           ✅            |        ❌         |
| Natijalarni ko‘rish                        |      barchasi       | faqat o‘z o‘quvchilari  |      **❌**       |
| Qayta urinishga ruxsat                     |         ✅          |   ✅ (o‘z o‘quvchisi)   |        ❌         |

Bularning barchasi **Supabase RLS siyosatlari** bilan bazada bajariladi — UI’da tugmani yashirish bilan
cheklanmagan. O‘quvchilar `options.score` / `options.dim_scores` ustunlarini o‘qiy olmaydi (ustun darajasidagi
GRANT), ballash faqat `score_attempt()` SECURITY DEFINER funksiyasida bo‘ladi.

---

## 5. Test tizimi

**Ikki tur:**

- `standard` — A/B/C/D, bitta to‘g‘ri javob (`options.score = 1`). Ball avtomatik hisoblanadi.
- `psych` — o‘lchovlar (dimensions) bo‘yicha ballar. Har variantga `dim_scores` beriladi,
  natija `attempts.dimension_result` ga yoziladi. **Klinik tashxis emas** — UI’da shu ogohlantirish bor.

**Topshirish mantiqi:**

- Bitta urinish — `attempts` jadvalida 1 satr (`assignment_id + student_id`).
- Javob har bosishda `answers` ga upsert qilinadi (avtomatik saqlash).
- Vaqt `attempts.started_at` / `deadline_at` da **bazada** saqlanadi → sahifa yopilsa ham davom etadi.
- Qayta kirganda mavjud urinish + javoblar yuklanadi (davom ettirish).
- Vaqt tugasa brauzer `score_attempt()` RPC ni chaqiradi (avtomatik topshirish).

---

## 6. Arxitektura

```
src/
├── lib/
│   ├── supabase.ts        # Supabase client (faqat anon key) + toEmail()
│   ├── api.ts             # test/savol yuklash, formatlash
│   ├── accounts.ts        # login/parol yordamchilari
│   ├── createAccount.ts   # akkaunt yaratish → Edge Function (signUp EMAS)
│   ├── errors.ts          # xatolarni o‘zbekchaga o‘girish
│   └── home.ts            # rolga mos bosh sahifa
├── context/
│   ├── AuthContext.tsx    # sessiya + profil
│   ├── toastCtx.ts        # toast konteksti
│   └── ToastProvider.tsx  # toast + useQuery
├── components/
│   ├── AppLayout.tsx      # sidebar + topbar (responsive)
│   ├── ui.tsx             # Card, Modal, Badge, StatCard...
│   └── charts.tsx         # Recharts diagrammalar
└── pages/
    ├── LoginPage.tsx
    ├── DashboardPage.tsx
    ├── StudentsPage.tsx · GroupsPage.tsx
    ├── TestsPage.tsx · TestBuilderPage.tsx · TestPreviewPage.tsx
    ├── LibraryPage.tsx · AssignmentsPage.tsx
    ├── ResultsPage.tsx · ResultDetailPage.tsx
    ├── SettingsPage.tsx
    ├── admin/PsychologistsPage.tsx
    └── student/MyTestsPage.tsx · TakeTestPage.tsx

supabase/
├── schema.sql                        # jadvallar + RLS
├── migration_student_login_fix.sql   # login/RLS tuzatishlari (MAJBURIY)
├── migration_user_management.sql     # foydalanuvchi boshqaruvi (MAJBURIY)
├── migration_psyxomakon_fix.sql      # kirish muammolarining yakuniy tuzatishi (MAJBURIY)
├── seed.sql · create_admin.sql
├── config.toml                       # functions verify_jwt
└── functions/admin-create-user/      # server-side Admin API (service_role)
```

---

## 7. Hozir tayyor bo‘lmagan / kelgusi funksiyalar

- **Parolni tizim ichidan tiklash** — o‘qituvchi/admin panelida «Parolni yangilash»
  server orqali (`admin-create-user` → `reset_password`) **haqiqatan** ishlaydi.
  Faqat Supabase Dashboard kerak bo‘lgan holat: bosh administratorning o‘z paroli.
- **Oldindan belgilangan psixologik metodikalar kutubxonasi** — faqat 2 ta namunaviy metodika bor.
  Yangi metodikalarni test konstruktori orqali qo‘shish mumkin.
- **PDF / Excel eksport** — talab bo‘yicha hozircha kiritilmagan. Natija sahifasida CSV yuklab olish bor.
- **Guruh statistikasi bo‘yicha alohida sahifa** — hozircha natija sahifasida diagramma sifatida.
- **Email/parolni tiklash oqimi** — public registratsiya yo‘qligi sababli kiritilmagan.
- **`attempts.round`** maydoni mavjud, lekin qayta urinish urinishni o‘chirish orqali amalga oshiriladi.

---

## 8. Eslatma

Psixologik test natijalari **klinik tashxis emas** va mutaxassis xulosasini almashtirmaydi.
