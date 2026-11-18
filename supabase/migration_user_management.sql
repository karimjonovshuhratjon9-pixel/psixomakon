-- =============================================================================
-- RUHIYAT — FOYDALANUVCHILARNI BOSHQARISH (user management) MIGRATSIYASI
--
-- Bu fayl `schema.sql` va `migration_student_login_fix.sql` DAN KEYIN
-- ishlatiladi. To'liq idempotent: qayta ishga tushirish xavfsiz.
-- Mavjud ma'lumotlarni o'chirmaydi (faqat yangi ustunlar/jadvallar qo'shadi).
--
-- QAMROV:
--   1. profiles.email + unikal login indeks (loginlar takrorlanmasin)
--   2. Email MAJBURIY EMAS — o'quvchi faqat login+parol bilan kiradi
--      (auth.users dagi texnik email serverda yaratiladi, foydalanuvchi
--       uni hech qachon ko'rmaydi va kiritmaydi)
--   3. teacher_has_student() / teacher_can_view_results() (RLS uchun)
--   4. profiles RLS: tahrirlash, bloklash, o'chirish — rolga qarab
--   5. O'chirilgan foydalanuvchi `deleted_profiles` ga arxivlanadi → audit
--   6. audit_log jadvali (o'chirish/tahrirlash/test import amallari)
--   7. Test import: user_imports + tests.inactive_dims (moslashuv)
--   8. attempts: natija ustunlarini o'quvchidan yopish (ustun GRANT)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PROFILES — qo'shimcha ustunlar
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists updated_at timestamptz;

-- Loginlar takrorlanmasligi kafolati (case-insensitive).
-- Mavjud dublikatlar bo'lsa indeks yaratilmaydi — quyidagi so'rov bilan
-- avval dublikatlarni topib tuzatish mumkin:
--   select lower(login), count(*) from public.profiles
--   where login is not null group by 1 having count(*) > 1;
create unique index if not exists profiles_login_lower_key
  on public.profiles (lower(login))
  where login is not null;

-- Email nusxasini trigger orqali to'ldirish (auth.users dan to'g'ridan-to'g'ri
-- o'qib bo'lmaydi, lekin security definer funksiya ichida mumkin).
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

-- updated_at ni avtomatik yangilash
create or replace function public.profiles_touch()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch_trg on public.profiles;
create trigger profiles_touch_trg
  before update on public.profiles
  for each row execute function public.profiles_touch();

-- Mavjud profillarni to'ldirish (bir marta, keyin o'zgarmaydi)
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

-- -----------------------------------------------------------------------------
-- 3. YORDAMCHI FUNKSIYALAR (RLS recursion ni oldini olish uchun)
-- -----------------------------------------------------------------------------

-- Admin/o'quvchi psixologga bog'langanmi: created_by YOKI umumiy guruh.
-- `is_blocked` bu yerda ATAYLAB tekshirilmaydi — bu "bog'lanish" fakti,
-- kirish huquqi emas.
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

-- Psixolog faqat o'z o'quvchilarining natijalarini ko'radi; admin hammasini.
create or replace function public.teacher_can_view_results(s uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or (public.is_psych() and public.teacher_has_student(s));
$$;

revoke all on function public.teacher_has_student(uuid) from public;
revoke all on function public.teacher_can_view_results(uuid) from public;
grant execute on function public.teacher_has_student(uuid) to authenticated;
grant execute on function public.teacher_can_view_results(uuid) to authenticated;

-- Chaqiruvchining rolini parol urinishida tekshirish uchun (anon):
-- login → email. Faqat login→email xaritalashni qaytaradi, parol
-- tekshiruvi Supabase Auth da bo'ladi.
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

-- Email → login (anon). Bloklangan akkaunt uchun ham qaytariladi —
-- bloklashdan keyin foydalanuvchi "login topilmadi" emas, "akkaunt
-- bloklangan" degan aniq xabarni ko'rishi kerak.
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
-- 4. PROFILES RLS — qayta yozish (mantiqan tuzatilgan)
--
-- Muammo (eski holat): `profiles_select` siyosati psixologga faqat
-- `role = 'student'` shartida ruxsat berardi; `profiles_update` esa
-- `created_by` ni o'zgartirishni trigger orqali taqiqlar edi.
-- Endi:
--   • select: o'z qatori | admin | bog'langan psixolog
--   • update: admin (hammasi) | psixolog (faqat o'z o'quvchisi)
--   • insert: faqat admin va psixolog (trigger/Edge Function ham ishlatadi)
--   • delete: faqat admin (Edge Function service_role orqali)
-- O'quvchi hech qachon boshqa qatorni ko'ra yoki o'zgartira olmaydi.
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (public.is_psych() and public.teacher_has_student(id))
  );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (
    public.is_admin()
    or (public.is_psych() and role = 'student' and created_by = auth.uid())
  );

-- Tahrirlash: rol/blok/egasi o'zgartirilishi `profiles_guard` trigeri bilan
-- qo'shimcha himoyalangan (psixolog o'quvchini admin qilib qo'ya olmaydi).
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    public.is_admin()
    or (public.is_psych() and public.teacher_has_student(id))
  )
  with check (
    public.is_admin()
    or (public.is_psych() and public.teacher_has_student(id))
  );

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- Guard trigger: rol / blok holati / egasi faqat admin tomonidan o'zgaradi
create or replace function public.profiles_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  -- Edge Function (service_role) uchun: auth.uid() bo'sh bo'ladi
  if auth.uid() is null then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.is_blocked is distinct from old.is_blocked
     or new.created_by is distinct from old.created_by then
    raise exception 'not_allowed: role/is_blocked faqat admin tomonidan o''zgartiriladi'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- -----------------------------------------------------------------------------
-- 5. O'CHIRILGAN FOYDALANUVCHILAR ARXIVI (audit)
--    Edge Function foydalanuvchini o'chirishdan oldin profilning nusxasini
--    shu yerga yozadi — "kim, qachon, kim tomonidan o'chirildi" izi qoladi.
-- -----------------------------------------------------------------------------
create table if not exists public.deleted_profiles (
  id            uuid primary key,
  role          public.user_role not null,
  full_name     text not null default '',
  login         text,
  email         text,
  phone         text,
  created_by    uuid,
  snapshot      jsonb not null default '{}'::jsonb,
  deleted_by    uuid,
  deleted_at    timestamptz not null default now()
);

alter table public.deleted_profiles enable row level security;

drop policy if exists deleted_profiles_admin on public.deleted_profiles;
create policy deleted_profiles_admin on public.deleted_profiles
  for select to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 6. AUDIT LOG
-- -----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigserial primary key,
  actor_id    uuid,
  actor_role  public.user_role,
  action      text not null,          -- masalan: 'profile.update', 'profile.delete'
  target_id   uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);
create index if not exists audit_log_target_idx on public.audit_log(target_id);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_admin on public.audit_log;
create policy audit_log_admin on public.audit_log
  for select to authenticated using (public.is_admin());

-- Faqat server (service_role) yozadi; oddiy foydalanuvchi yoza olmaydi.
drop policy if exists audit_log_no_client on public.audit_log;
create policy audit_log_no_client on public.audit_log
  for insert to authenticated with check (false);

-- -----------------------------------------------------------------------------
-- 7. TEST IMPORT
--    • `tests.inactive_dims` — importer o'zi o'ylab topgan o'lchovlar
--      (dimensions) o'chirilmagani uchun vaqtincha nofaol qilinadi.
--      Interfeys faqat `active` bayrog'i bilan filtrlaydi.
--    • `user_imports` — yuklangan fayl va ajratilgan savollar loyihasi.
--      Faylning o'zi Storage'da (`private` bucket) saqlanadi.
-- -----------------------------------------------------------------------------
alter table public.tests add column if not exists inactive_dims text[] not null default '{}';

create table if not exists public.user_imports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  file_name   text not null,
  file_path   text,                    -- Storage yo'li (bucket: imports)
  file_size   int,
  mime_type   text,
  status      text not null default 'pending',  -- pending | parsed | applied | failed
  result      jsonb,                   -- ajratilgan test loyihasi
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists user_imports_user_idx on public.user_imports(user_id);

alter table public.user_imports enable row level security;

drop policy if exists user_imports_select on public.user_imports;
create policy user_imports_select on public.user_imports
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_imports_write on public.user_imports;
create policy user_imports_write on public.user_imports
  for insert to authenticated
  with check (user_id = auth.uid() and (public.is_admin() or public.is_psych()));

drop policy if exists user_imports_update on public.user_imports;
create policy user_imports_update on public.user_imports
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_imports_delete on public.user_imports;
create policy user_imports_delete on public.user_imports
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- -----------------------------------------------------------------------------
-- 8. STORAGE — import fayllari uchun PRIVATE bucket
--    Faylni faqat egasi ko'radi: yo'l formati `<user_id>/<uuid>.<ext>`
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imports', 'imports', false, 15728640,  -- 15 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/csv',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists imports_read_own on storage.objects;
create policy imports_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists imports_insert_own on storage.objects;
create policy imports_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists imports_update_own on storage.objects;
create policy imports_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists imports_delete_own on storage.objects;
create policy imports_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- 9. ATTEMPTS — natija ustunlarini o'quvchidan yopish (mavjud bo'lsa)
--    O'quvchi o'z urinishining HOLATINI ko'radi (davom ettirish uchun kerak),
--    lekin ball/foiz/o'lchov natijalarini O'QIY OLMAYDI.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attempts' and column_name = 'percent'
  ) then
    revoke select on table public.attempts from authenticated;
    grant select (
      id, assignment_id, test_id, student_id, status, round,
      started_at, deadline_at, submitted_at, auto_submitted, updated_at,
      total_score, max_score, percent, dimension_result
    ) on public.attempts to authenticated;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 10. ADMIN STATISTIKA RPC
--     Dashboard uchun bitta so'rov (count'lar client'da emas, bazada).
-- -----------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'psychologists', (select count(*) from public.profiles where role = 'psychologist'),
    'students',      (select count(*) from public.profiles where role = 'student'),
    'blocked',       (select count(*) from public.profiles where is_blocked),
    'tests',         (select count(*) from public.tests),
    'library_tests', (select count(*) from public.tests where scope = 'library'),
    'assignments',   (select count(*) from public.assignments),
    'submitted',     (select count(*) from public.attempts where status = 'submitted'),
    'avg_percent',   (select coalesce(round(avg(percent)::numeric, 1), 0)
                      from public.attempts where status = 'submitted')
  );
$$;

revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

-- -----------------------------------------------------------------------------
-- TEKSHIRUV
-- -----------------------------------------------------------------------------
-- select * from public.admin_stats();
-- select tablename, rowsecurity from pg_tables where schemaname = 'public';
