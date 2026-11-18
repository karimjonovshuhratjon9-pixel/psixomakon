-- =============================================================================
-- PSIXOMAKON — O'QUVCHI YARATISH VA KIRISH (LOGIN) — YAKUNIY TUZATISH
--
-- QACHON ISHLATILADI:
--   schema.sql → seed.sql → migration_student_login_fix.sql →
--   migration_user_management.sql  DAN KEYIN. Idempotent: qayta ishga tushirish
--   xavfsiz.
--
-- NEGA KERAK (real loyihada tekshirilgan holatlar):
--   1. migration_user_management.sql dagi `profiles_insert` siyosati va
--      insert triggeri `public.is_admin()` / `public.is_psych()` funksiyalarini
--      chaqiradi. Ba'zi loyihalarda bu funksiyalarning EXECUTE huquqi
--      `authenticated` rolidan olib tashlangan (yoki schema.sql eski nusxasi
--      qo'llanilgan) → RLS ifodasi `permission denied for function is_admin`
--      bilan yiqiladi. Natijada:
--         • Edge Function `createUser` dan keyin profilni YANGILAY olmaydi;
--         • yangi o'quvchi `is_blocked = true` (trigger default) holatida qoladi;
--         • o'quvchi login qilganda profilni o'qiy olmaydi → "Profil topilmadi"
--           yoki darhol "Akkaunt bloklangan".
--      → funksiya huquqlari va is_blocked holati qayta tiklanadi.
--   2. O'quvchi yaratilganda `is_blocked` qiymati admin tanloviga bog'liq emas —
--      chetlab o'tish uchun `profiles_guard` ham yangilanadi (psixolog/admin).
--   3. Eski (buzilgan) akkauntlar uchun `repair_my_profile()` — o'quvchining
--      o'zi bir marta bosib profilini tiklay oladi (faqat login/ism to'ldiriladi,
--      rol va blok holati TEGILMAYDI). Login sahifasida avtomatik chaqiriladi.
--   4. `auth_users_diag()` — o'quvchining auth emaili (login × email × alias)
--      to'g'ri bog'langanini aniqlash uchun faqat true/false diagnostika.
--      Parol hash ham, boshqa akkauntlar ham oshkor qilinmaydi.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RLS yordamchi funksiyalarining EXECUTE huquqi (eng ko'p uchraydigan sabab)
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_blocked = false
  );
$$;

create or replace function public.is_psych()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'psychologist' and p.is_blocked = false
  );
$$;

create or replace function public.is_student_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'student' and p.is_blocked = false
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_psych() to authenticated;
grant execute on function public.is_student_ok() to authenticated;
grant execute on function public.current_role_is(public.user_role) to authenticated;
grant execute on function public.current_user_id() to authenticated;
grant execute on function public.teacher_has_student(uuid) to authenticated;
grant execute on function public.teacher_can_view_results(uuid) to authenticated;
grant execute on function public.owns_group(uuid) to authenticated;
grant execute on function public.group_has_member(uuid, uuid) to authenticated;
grant execute on function public.psych_has_student(uuid) to authenticated;
grant execute on function public.assigned_to_me(uuid) to authenticated;
grant execute on function public.can_manage_test(uuid) to authenticated;
grant execute on function public.owns_test(uuid) to authenticated;

-- public schema (PostgREST orqali) uchun table huquqlari — RLS baribir ishlaydi,
-- lekin GRANT bo'lmasa "permission denied for table" chiqadi.
grant usage on schema public to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. PROFILES SELECT — o'quvchi HAR DOIM o'z qatorini o'qiy oladi
--    (sessiya ochiq bo'lsa profil topilmasin degan holat yo'q bo'lsin)
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (public.is_psych() and public.teacher_has_student(id))
  );

-- -----------------------------------------------------------------------------
-- 3. GUARD TRIGGER — admin/psixolog is_blocked ni o'zgartira olsin
--    (faqat adminlik va blok holatini o'zgartirish admin/psixolog zimmasida;
--     student hech qachon o'z rolini yoki blok holatini o'zgartira olmaydi)
-- -----------------------------------------------------------------------------
create or replace function public.profiles_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Edge Function / service_role: auth.uid() bo'sh
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.created_by is distinct from old.created_by then
    raise exception 'not_allowed: rol faqat admin tomonidan o''zgartiriladi'
      using errcode = '42501';
  end if;

  -- Psixolog faqat o'z o'quvchisining blok holatini o'zgartiradi (o'chirish
  -- va boshqa akkauntlarga tegish faqat admin). O'quvchi o'zi uchun hech narsa.
  if new.is_blocked is distinct from old.is_blocked then
    if not (public.is_psych() and public.teacher_has_student(old.id)) then
      raise exception 'not_allowed: blok holati faqat admin yoki o''z psixologi tomonidan'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- -----------------------------------------------------------------------------
-- 4. PROFILES UPDATE/INSERT — insert hali ham faqat admin/psixolog uchun
--    (barcha akkauntlar Edge Function orqali yaratiladi)
-- -----------------------------------------------------------------------------
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (
    public.is_admin()
    or (public.is_psych() and role = 'student' and created_by = auth.uid())
  );

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

-- -----------------------------------------------------------------------------
-- 5. O'QUVCHINING O'Z PROFILINI TIKLASHI (eski/buzilgan akkauntlar uchun)
--    Hech qanday imtiyoz bermaydi: `is_blocked` o'zgartirilmaydi, rol faqat
--    `student` bo'lishi mumkin. Bo'sh maydonlar to'ldiriladi.
-- -----------------------------------------------------------------------------
create or replace function public.repair_my_profile(p_login text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  me  public.profiles%rowtype;
  email_verified boolean := false;
  candidate text;
begin
  if uid is null then
    return false;
  end if;

  select * into me from public.profiles where id = uid;
  if not found then
    return false;                     -- trigger yaratmagan — qo'lda tekshirish kerak
  end if;

  if me.role <> 'student' or me.is_blocked then
    return false;                     -- faqat faol o'quvchi tiklanadi
  end if;

  -- Auth manzili haqiqatan mavjudmi (login o'zgargandan keyin kerak)
  select exists (
    select 1 from auth.users u where u.id = uid and u.email is not null
  ) into email_verified;
  if not email_verified then
    return false;
  end if;

  candidate := nullif(lower(trim(coalesce(p_login, ''))), '');
  if candidate is not null and candidate !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    candidate := null;
  end if;

  update public.profiles p
  set
    login = coalesce(p.login, candidate),
    full_name = case
      when p.full_name is null or p.full_name = '' then 'O''quvchi'
      else p.full_name
    end
  where p.id = uid
    and (
      p.login is null
      or p.full_name is null
      or p.full_name = ''
    )
    and (
      candidate is null
      or not exists (
        select 1 from public.profiles other
        where other.id <> uid and lower(other.login) = candidate
      )
    );

  return true;
end $$;

revoke all on function public.repair_my_profile(text) from public;
grant execute on function public.repair_my_profile(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. DIAGNOSTIKA — login/email bog'lanishi to'g'rimi?
--    Faqat true/false. Parol hash va boshqa akkauntlar OSHKOR QILINMAYDI.
-- -----------------------------------------------------------------------------
create or replace function public.auth_users_diag(p_login text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where lower(coalesce(p.login, '')) = lower(trim(coalesce(p_login, '')))
      and u.email is not null
      and (
        lower(u.email) = lower(coalesce(nullif(p.email, ''), u.email))
        or lower(u.email) like '%@students.invalid'
      )
      and not p.is_blocked
  );
$$;

revoke all on function public.auth_users_diag(text) from public;
grant execute on function public.auth_users_diag(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. TEKSHIRUV (SQL Editor)
-- -----------------------------------------------------------------------------
-- select p.id, p.full_name, p.login, p.email, p.role, p.is_blocked,
--        u.email as auth_email, u.email_confirmed_at
-- from public.profiles p
-- join auth.users u on u.id = p.id
-- where p.role = 'student'
-- order by p.created_at desc
-- limit 20;

-- -----------------------------------------------------------------------------
-- 8. XAVFSIZLIK: eski self-promotion RPC ni butunlay olib tashlash
-- Admin roli faqat Supabase SQL Editor / service_role kabi ishonchli kanal
-- orqali beriladi. Authenticated foydalanuvchi o'z rolini o'zgartira olmaydi.
-- -----------------------------------------------------------------------------
revoke all on function public.fix_my_account(text) from public, anon, authenticated;
drop function if exists public.fix_my_account(text);

-- Excel import / audit jadvallari (migration_user_management.sql) yaratgan
-- bo'lsa — ular uchun ham huquq kerak, aks holda "permission denied for table".
do $$
begin
  if to_regclass('public.user_imports') is not null then
    execute 'grant select, insert, update, delete on public.user_imports to authenticated';
  end if;
  if to_regclass('public.audit_log') is not null then
    execute 'grant select on public.audit_log to authenticated';
    execute 'grant insert on public.audit_log to service_role';
  end if;
  if to_regclass('public.deleted_profiles') is not null then
    execute 'grant select on public.deleted_profiles to authenticated';
  end if;
end $$;

-- profiles jadvali huquqlari (RLS qatorlarni baribir cheklaydi)
grant select, insert, update, delete on public.profiles to authenticated;
-- Login sahifasi anon sifatida login → email xaritasini o'qiy oladi (RPC orqali)
grant execute on function public.email_for_login(text) to anon, authenticated;
