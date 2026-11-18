# RUHIYAT — Audit va o‘zgartirishlar hisoboti

Bu hujjat **haqiqiy** tekshiruv natijalarini yozadi. "Ishlayapti" deb faqat
tekshirilgan narsa uchun yozilgan. Supabase bulut tomonidagi qadamlar (migratsiya,
deploy) **siz** tomoningizdan bajarilishi kerak — ular tasdiqlanmagan.

---

## 1. Topilgan haqiqiy muammolar

### 1.1. O‘quvchi tizimga kira olmasligi — 3 ta mustaqil sabab

| #   | Sabab                                                                                                                                                                       | Isbot                                                   | Tuzatish                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Brauzerda `auth.signUp()` chaqirilardi. Supabase sozlamasida `mailer_autoconfirm: false` → sessiya qaytmaydi, profil to‘ldirilmaydi, o‘quvchi `is_blocked = true` da qoladi | `GET /auth/v1/settings` → `"mailer_autoconfirm": false` | Akkaunt **serverda** `admin.createUser({ email_confirm: true })` orqali yaratiladi |
| 2   | `signUp()` har chaqiruvda tasdiqlash xati yuborishga urinadi → `429 over_email_send_rate_limit` (butun loyiha bloklanadi)                                                   | `POST /auth/v1/signup` → `over_email_send_rate_limit`   | Email yuborilmaydi (`email_confirm: true`)                                         |
| 3   | Username topilmasa `toEmail()` soxta `not-found@ruhiyat.local` qaytarardi — bunday manzil Supabase validatsiyasidan o‘tmaydi (`email_address_invalid`)                      | `signup` → `email_address_invalid`                      | `toEmail()` `null` qaytaradi; login xatosi aniq ko‘rsatiladi                       |

**Qo‘shimcha:** `signUp()` ba’zi holatlarda chaqiruvchining sessiyasini almashtiradi
— admin o‘quvchi yaratgan zahoti tizimdan chiqib ketardi. Endi **Admin API**
ishlatilgani uchun admin sessiyasiga umuman tegilinmaydi.

### 1.2. Email majburiy edi

O‘quvchi uchun email kiritish talab qilinardi. Endi:

- O‘quvchi uchun **login majburiy**, email **ixtiyoriy**.
- Supabase Auth email-based bo‘lgani uchun serverda ichki texnik manzil yaratiladi:
  `<login>@students.invalid`
  - `.invalid` — RFC 2606 bo‘yicha **hech qachon mavjud bo‘lmaydigan** TLD.
  - Xat yuborilmaydi, hech kimga tegishli emas, foydalanuvchiga ko‘rsatilmaydi.
  - **`.local` ishlatilmagan** — u Supabase tomonidan rad etiladi.
- Login o‘zgarganda Auth emaili ham serverda yangilanadi (aks holda yangi login
  bilan kirib bo‘lmasdi).

### 1.3. Parolni tiklash ishlamasdi

Eski "Parol tiklash" tugmasi parolni generatsiya qilib, clipboard'ga nusxalab,
foydalanuvchiga ko‘rsatardi — **bazaga hech narsa yozilmasdi**. O‘quvchi o‘sha
"yangi parol" bilan kira olmasdi. Endi `Supabase Admin API updateUserById`
orqali **haqiqatan** o‘zgartiriladi.

### 1.4. RLS nomuvofiqligi

`profiles_update` siyosati `created_by = auth.uid()` shartini talab qilardi, lekin
`profiles_guard` trigeri `created_by` ni o‘zgartirishni taqiqlar edi. Natijada
psixolog profilni yangilashda nozik xatoga urilishi mumkin edi. Yangi migratsiyada
siyosatlar `teacher_has_student()` (created_by **yoki** umumiy guruh) asosida
qayta yozildi.

### 1.5. Natijalar o‘quvchiga ochiq edi

`attempts` jadvalida `percent`, `total_score`, `dimension_result` ustunlari
`select to authenticated` bilan ochiq edi — o‘quvchi o‘z brauzerida to‘g‘ridan-to‘g‘ri
so‘rov yuborib ballini ko‘ra olardi. Endi:

- **UI**: `TakeTestPage` / `MyTestsPage` bu ustunlarni so‘ramaydi.
- **DB**: ustun darajasidagi `GRANT` bilan o‘quvchi rolida **yopiq** — qator RLS esa
  saqlanadi (davom ettirish uchun `status` kerak).
- `AuthGuard`/`RoleGate`: natija sahifalari faqat admin/psixolog uchun.

---

## 2. Yangi funksiyalar

### 2.1. Foydalanuvchi boshqaruvi (`admin-create-user` Edge Function)

| Amal                             | Admin |           Psixolog            |
| -------------------------------- | :---: | :---------------------------: |
| O‘quvchi yaratish                |  ✅   |    ✅ (created_by = o‘zi)     |
| O‘quvchini tahrirlash            |  ✅   |    ✅ faqat o‘z o‘quvchisi    |
| Login/email/telefon o‘zgartirish |  ✅   |    ✅ faqat o‘z o‘quvchisi    |
| Parolni yangilash                |  ✅   |    ✅ faqat o‘z o‘quvchisi    |
| Bloklash / faollashtirish        |  ✅   | ❌ (serverda ham rad etiladi) |
| O‘chirish                        |  ✅   | ❌ (serverda ham rad etiladi) |
| Psixolog yaratish/tahrirlash     |  ✅   |              ❌               |

Serverdagi har bir chaqiruv:

1. JWT ni tekshiradi (`auth.getUser`) → anonim chaqiruv rad etiladi.
2. Chaqiruvchining `profiles` yozuvini o‘qiydi → rol, `is_blocked`.
3. Egasi/aloqani tekshiradi (`created_by` yoki umumiy guruh).
4. Shundan keyingina service-role bilan amalni bajaradi.
5. `audit_log` ga yozadi (parol hech qachon yozilmaydi).

**O‘chirish:** profil nusxasi `deleted_profiles` ga arxivlanadi, keyin
`auth.admin.deleteUser()` — `profiles` CASCADE bilan o‘chadi, tayinlashlar va
natijalar ham. UI oqibatlarni aniq ko‘rsatadi va "bloklash" muqobilini taklif qiladi.

### 2.2. Dark mode

- `light` / `dark` / `system` — topbar'dagi tugma bilan almashtiriladi.
- `localStorage` (`ruhiyat.theme`) da saqlanadi.
- `index.html` dagi kichik skript birinchi render'dan **oldin** klassni qo‘yadi —
  oq ekran miltillashi yo‘q.
- Butun tizim **CSS o‘zgaruvchilari** ustida: sidebar, topbar, kartalar, jadvallar,
  modallar, input/select, tugmalar, dropdown, toast, grafiklar, login, test
  topshirish, natijalar.

**Topilgan va tuzatilgan bug:** `bg-forest-950` (va `bg-forest-900`) dark rejimda
**deyarli oq** bo‘lib qoladi. Ustida `text-white` ishlatilgan bloklar (login brend
paneli, dashboard "Tezkor harakatlar", test sahifasidagi karta) dark rejimda
**ko‘rinmay qolgan edi** — skrinshot bilan tasdiqlandi va tuzatildi
(`.brand-panel`, `.bg-solid-dark`, `.bg-solid-dark-2` — mavzuga bog‘liq emas).

### 2.3. Fayldan test import

Fayl **brauzerda** o‘qiladi (serverga yuborilmaydi).

| Format           | Usul                                          | Holat                                                 |
| ---------------- | --------------------------------------------- | ----------------------------------------------------- |
| PDF (matnli)     | `pdfjs-dist`                                  | ✅                                                    |
| DOCX             | `fflate` + `word/document.xml`                | ✅                                                    |
| PPTX             | `fflate` + `ppt/slides/slideN.xml`            | ✅                                                    |
| XLSX             | `fflate` + `sharedStrings.xml` + `sheetN.xml` | ✅                                                    |
| CSV / TXT        | `TextDecoder` (UTF-8 → cp1251 fallback)       | ✅                                                    |
| PNG / JPG / WEBP | `tesseract.js` OCR (uzb/rus/eng)              | ⚠️ ixtiyoriy, sekin                                   |
| .doc / .xls      | —                                             | ❌ aniq xato + DOCX/XLSX ga o‘tkazish maslahati       |
| Skanerlangan PDF | —                                             | ⚠️ matn qatlami yo‘q → OCR yoki rasm sifatida yuklash |

**Muhim:** import natijasi **darhol saqlanmaydi**. `ImportReviewPage` da har bir
savolni ko‘rish, tahrirlash, o‘chirish, variant qo‘shish, to‘g‘ri javobni belgilash
mumkin. Faqat tasdiqlagandan keyin `tests`/`questions`/`options` ga yoziladi.

Xavfsizlik: kengaytma **va** MIME tekshiriladi, hajm limiti (15 MB / OCR 6 MB),
ZIP-bomb himoyasi (ochilgan hajm 120 MB dan oshsa to‘xtaydi).

---

## 3. Bajarilgan tekshiruvlar (haqiqiy)

| Tekshiruv                                                                   | Natija                     |
| --------------------------------------------------------------------------- | -------------------------- |
| `npm run typecheck` (`tsc -b --noEmit`)                                     | ✅ 0 xato                  |
| `npm run build`                                                             | ✅ muvaffaqiyatli          |
| Edge Function haqiqiy `@supabase/supabase-js` API'siga qarshi `tsc`         | ✅ 0 xato                  |
| Login sahifasi render (light)                                               | ✅ 0 console error         |
| Dark mode: `system` → OS dark, `light`, `dark`; reload'dan keyin saqlanishi | ✅ tasdiqlandi             |
| Login xatosi (noto‘g‘ri parol) — o‘zbekcha xabar, dark mode                 | ✅ skrinshotda tasdiqlandi |
| CSS build: `brand-panel`, `bg-solid-dark` chiqarilishi                      | ✅ tasdiqlandi             |

## 4. Tekshirilmagan (siz bajarishingiz kerak)

Quyidagilar **haqiqiy Supabase bazasi** va **admin hisobi** talab qiladi. Men
admin parolini bilmayman, shuning uchun ularni bajarilmagan deb hisoblang:

- ❌ O‘quvchi yaratish → login qilish (end-to-end)
- ❌ RLS siyosatlarining real Postgres'da ishlashi
- ❌ Edge Function'ning deploy qilingan holda ishlashi
- ❌ Dark mode'ning **ichki sahifalarda** (dashboard, students, results) ko‘rinishi

**Bajarish tartibi:** `README.md` → «Supabase sozlash» → 3 qadam:

1. `supabase/migration_user_management.sql` ni SQL Editor'da ishga tushirish
2. `supabase functions deploy admin-create-user`
3. Admin panelidan o‘quvchi yaratib, login/parol bilan kirib tekshirish

Agar biror joyda xato chiqsa, xato matnini yuboring — aniq tuzataman.

---

## 5. O‘chirilgan (eski) fayllar

Refaktor paytida quyidagilar `*.legacy.tsx` sifatida saqlandi (ishlatilmaydi,
keyinchalik o‘chirish mumkin):

- `src/pages/StudentsPage.legacy.tsx`
- `src/components/ui.legacy.tsx`
- `src/components/AppLayout.legacy.tsx`
- `supabase/functions/admin-create-user/index.legacy.ts`
