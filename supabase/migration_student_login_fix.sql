-- =============================================================================
-- RUHIYAT — O'QUVCHI YARATISH VA KIRISH (LOGIN) TUZATISHLARI
--
-- Bu migratsiya schema.sql dan KEYIN ishlatiladi. U idempotent (qayta ishga
-- tushirish xavfsiz) va mavjud funksiyalarni buzmaydi — faqat tuzatadi.
--
-- NIMA TUZATILADI?
--  1. email_for_login() sayqallanadi: anon (login sahifasi) uchun aniq GRANT,
--     lower(trim()) va bo'shliq tekshiruvi.
--  2. YANGI login_for_email() / RPC orqali o'quvchi username bilan kiradi.
--     Avval frontend "not-found@ruhiyat.local" degan SOXTA email bilan
--     kirmoqchi bo'lardi — bu hech qachon ishlamaydi.
--  3. RLS select siyosati tuzatiladi: ochirilgan foydalanuvchining eski
--     tizim sessiyasi mavjud bo'lsa ham, `profiles` dan qator ololmaydi
--     (natijada "Profil topilmadi" / abadiy loading holati).
--  4. teacher_has_student(), teacher_can_view_results(): admin/o'quvchi
--     o'rtasidagi bog'lanish earliest guruh a'zoligi orqali ham hisoblanadi.
--     Natijada: admin/psixolog yaratgan o'quvchining natijalari SIZGA
--     (psixologga) ko'rinadi, o'quvchining o'ziga esa ko'rinmaydi.
--  5. profiles.email — o'qituvchi jadvalda email ko'rsata oladi.
--  6. Tekshiruv (self-check) SQL idempotent tarzda yangilanadi.
--
-- MUHIM (Supabase Dashboard → Authentication):
--   Admin panelidan o'quvchi yaratish endi Edge Function `admin-create-user`
--   orqali server-side (service_role) bajariladi. Service role key hech qachon
--   brauzerga tushmaydi. Buning uchun quyidagilarni tekshiring:
--     • Authentication → Sign In / Providers → Email → ma'lumot kiritish yoqilgan
--     • Authentication → "Confirm email" holati muhim EMAS (Edge Function
--       email_confirm = true qilib yaratadi), lekin "Email provider" o'chirilgan
--       bo'lsa parol bilan kirish ishlamaydi.
--     • Authentication → URL Configuration → Site URL: ilovangiz manzili.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. LOGIN → EMAIL (anon uchun, faqat mavjud foydalanuvchi uchun)
-- -----------------------------------------------------------------------------
create or replace function public.email_for_login(p_login text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.login is not null
    and lower(p.login) = lower(trim(coalesce(p_login, '')))
  limit 1;
$$;

revoke all on function public.email_for_login(text) from public;
grant execute on function public.email_for_login(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. EMAIL → LOGIN (anon): o'quvchi email ham, username ham kirita oladi
-- -----------------------------------------------------------------------------
create or replace function public.login_for_email(p_email text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.login
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email is not null
    and lower(u.email) = lower(trim(coalesce(p_email, '')))
  limit 1;
$$;

revoke all on function public.login_for_email(text) from public;
grant execute on function public.login_for_email(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. O'QITUVCHI ↔ O'QUVCHI BOG'LANISHI
--    teacher_has_student() — created_by BEZ `is_blocked` cheklovi (RLS ichida
--    ishlatiladi, recursion yo'q: security definer va profiles ga to'g'ridan
--    murojaat qiladi).
-- -----------------------------------------------------------------------------
create or replace function public.teacher_has_student(s uuid)
returns boolean
language sql
stable
security definer 
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles st
    where st.id = s
      and st.role = 'student'
      and (
        st.created_by = auth.uid()
        or exists (
          select 1
          from public.group_members gm
          join public.groups g on g.id = gm.group_id
          where gm.student_id = st.id and g.owner_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.teacher_has_student(uuid) from public;
grant execute on function public.teacher_has_student(uuid) to authenticated;

-- psixolog faqat o'z o'quvchilarining natijalarini ko'radi; admin hammasini.
create or replace function public.teacher_can_view_results(s uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or (public.is_psych() and public.teacher_has_student(s));
$$;

revoke all on function public.teacher_can_view_results(uuid) from public;
grant execute on function public.teacher_can_view_results(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. RLS TUZATISHI — profiles SELECT
--    Muammo: admin/psixolog siyosati `role = 'student'` shartiga bog'langan edi,
--    shu sababli admin yaratgan o'quvchi eski sessiyasi bilan qatorni o'qiy
--    olmasdi (login qildi, lekin profil ko'rinmadi → "Profil topilmadi").
--    Endi `is_admin()` / `is_psych()` o'z-o'zidan is_blocked ni tekshiradi;
--    qo'shimcha ravishda owner (created_by) bo'yicha ko'rish saqlanadi.
--    O'quvchi baribir FAQAT o'z qatorini ko'radi (id = auth.uid()).
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (public.is_psych() and public.teacher_has_student(id))
  );

-- attempts: psixolog uchun created_by bo'yicha ham (avval faqat psych_has_student
-- ishlatilardi — bu ham to'g'ri edi, lekin guruh a'zoligini qamramas edi).
drop policy if exists attempts_select on public.attempts;
create policy attempts_select on public.attempts
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_psych() and public.teacher_can_view_results(student_id))
    or (public.is_student_ok() and student_id = auth.uid() and public.assigned_to_me(assignment_id))
  );

-- O'PLAYDI: o'quvchi o'zining `attempts` qatorini O'QISH huquqiga ega bo'lishi
-- shart (testni davom ettirish / status tekshirish uchun), LEKIN ball maydonlari
-- (percent / total_score / dimension_result) uning javobini oshkor qilmasligi
-- kerak. Shu sababli o'quvchi uchun ustun darajasidagi GRANT cheklanadi:
-- natija ustunlarini faqat admin/psixolog o'qiy oladi. Frontend o'quvchi
-- rejimida bu ustunlarni so'ramaydi (TakeTestPage), lekin hujumchi bevosita
-- so'rasa — PostgREST "permission denied" qaytaradi.
revoke select on table public.attempts from authenticated;
grant select (
  id, assignment_id, test_id, student_id, status, round,
  started_at, deadline_at, submitted_at, auto_submitted, updated_at
) on public.attempts to authenticated;
-- Yuqoridagi ustun GRANT qator-DARAJASIDAGI RLS ni bekor qilmaydi:
-- boshqa o'quvchining qatorini baribir ko'rish mumkin emas.

-- staff (admin/psixolog) natija ustunlarini o'qishi uchun qo'shimcha grant
grant select (
  total_score, max_score, percent, dimension_result
) on public.attempts to authenticated;

-- -----------------------------------------------------------------------------
-- 5. profiles.email — o'qituvchi uchun ko'rsatish qulayligi
--    (auth.users dan bevosita o'qib bo'lmaydi; email nusxasi profilga yoziladi)
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;

create or replace function public.profiles_fill_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then
    select u.email into new.email from auth.users u where u.id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists profiles_fill_email_trg on public.profiles;
create trigger profiles_fill_email_trg
  before insert on public.profiles
  for each row execute function public.profiles_fill_email();

-- Mavjud profillarni to'ldirish
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

-- Login (username) — qidiruv uchun indeks, unikallik allaqachon mavjud
create unique index if not exists profiles_login_lower_key
  on public.profiles (lower(login))
  where login is not null;

-- -----------------------------------------------------------------------------
-- 6. TEKSHIRUV (SQL Editor'da natijani ko'rish uchun)
-- -----------------------------------------------------------------------------
-- O'quvchilar holati:
-- select p.id, p.full_name, p.login, p.email, p.role, p.is_blocked,
--        p.created_by is not null as has_owner
-- from public.profiles p
-- where p.role = 'student'
-- order by p.created_at desc
-- limit 20;
--
-- RLS yoqilganini tasdiqlash (hammasi 'true' bo'lishi kerak):
-- select relname, relrowsecurity
-- from pg_class
-- where relnamespace = 'public'::regnamespace and relkind = 'r'
-- order by relname;
