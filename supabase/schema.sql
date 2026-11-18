-- =============================================================================
-- PSIXOMAKON — Psixologik test platformasi
-- Supabase schema + Row Level Security
-- Supabase Dashboard → SQL Editor → ushbu faylni to'liq nusxalab ishga tushiring.
--
-- FAYL IDEMPOTENT: har bir policy'dan OLDIN uning barcha mumkin bo'lgan eski
-- nomlari `drop policy if exists` bilan o'chiriladi. Shu sababli skriptni
-- qayta ishga tushirish "policy already exists" xatosini bermaydi.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TYPES
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin', 'psychologist', 'student');
exception when duplicate_object then null; end $$;
DROP FUNCTION
do $$ begin
  create type public.test_kind as enum ('standard', 'psych');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.test_scope as enum ('library', 'personal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attempt_status as enum ('in_progress', 'submitted');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 2. TABLES
-- -----------------------------------------------------------------------------

-- profiles: auth.users ga 1:1 bog'langan
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        public.user_role not null default 'student',
  full_name   text not null default '',
  login       text unique,                      -- o'quvchilar uchun qulay login
  phone       text,
  is_blocked  boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.tests (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text not null default '',
  category      text not null default 'Umumiy',
  kind          public.test_kind not null default 'standard',
  scope         public.test_scope not null default 'personal',
  min_age       int,
  max_age       int,
  time_limit_sec int,                            -- null = cheklovsiz
  -- scoring: { "type": "correct" } | { "type": "dimensions", "dimensions": [{key,label,description}] }
  scoring       jsonb not null default '{"type":"correct"}'::jsonb,
  owner_id      uuid references public.profiles(id) on delete cascade,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.questions (
  id         uuid primary key default gen_random_uuid(),
  test_id    uuid not null references public.tests(id) on delete cascade,
  position   int not null default 0,
  text       text not null
);

-- options.score — standart testlarda 1 = to'g'ri javob;
-- psixologik testlarda dimension ballari (scoring.dimensions kalitlari bilan)
create table if not exists public.options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  position    int not null default 0,
  text        text not null,
  score       int not null default 0,
  dim_scores  jsonb not null default '{}'::jsonb
);

-- o'quvchi guruhga faqat psixolog tomonidan qo'shiladi
create table if not exists public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (group_id, student_id)
);

create table if not exists public.assignments (
  id            uuid primary key default gen_random_uuid(),
  test_id       uuid not null references public.tests(id) on delete cascade,
  student_id    uuid references public.profiles(id) on delete cascade,
  group_id      uuid references public.groups(id) on delete cascade,
  assigned_by   uuid not null references public.profiles(id),
  due_at        timestamptz,
  allow_retake  boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint assignment_target check ((student_id is null) <> (group_id is null))
);
create index if not exists assignments_student_idx on public.assignments(student_id);
create index if not exists assignments_group_idx on public.assignments(group_id);

create table if not exists public.attempts (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  test_id       uuid not null references public.tests(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  status        public.attempt_status not null default 'in_progress',
  round         int not null default 1,
  started_at    timestamptz not null default now(),   -- vaqt shu yerdan hisoblanadi
  deadline_at   timestamptz,
  submitted_at  timestamptz,
  auto_submitted boolean not null default false,
  total_score   numeric,
  max_score     numeric,
  percent       numeric,
  dimension_result jsonb,
  updated_at    timestamptz not null default now()
);
create index if not exists attempts_student_idx on public.attempts(student_id);
create index if not exists attempts_test_idx on public.attempts(test_id);

create table if not exists public.answers (
  attempt_id  uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  option_id   uuid references public.options(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

-- -----------------------------------------------------------------------------
-- 3. HELPER FUNCTIONS (RLS recursion ni oldini olish uchun security definer)
-- -----------------------------------------------------------------------------
create or replace function public.current_role_is(target public.user_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = target and p.is_blocked = false
  );
$$;

-- Profil RLS ichida ishlatiladigan yordamchi
create or replace function public.current_user_id() returns uuid language sql stable as $$
  select auth.uid();
$$;

-- Login (username) orqali email topish — login sahifasi uchun.
-- Faqat login → email xaritalashni qaytaradi (parol tekshiruvi Supabase Auth da).
create or replace function public.email_for_login(p_login text)
returns text language sql stable security definer set search_path = public as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.login) = lower(trim(p_login))
  limit 1;
$$;

grant execute on function public.email_for_login(text) to anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role_is('admin');
$$;

create or replace function public.is_psych()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role_is('psychologist');
$$;

create or replace function public.is_student_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role_is('student');
$$;

create or replace function public.owns_test(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tests tst
    where tst.id = t and tst.owner_id = auth.uid() and public.is_psych()
  );
$$;

create or replace function public.owns_group(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups grp
    where grp.id = g and grp.owner_id = auth.uid() and public.is_psych()
  );
$$;

create or replace function public.group_has_member(g uuid, s uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = g and gm.student_id = s and public.owns_group(g)
  );
$$;

create or replace function public.psych_has_student(s uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_psych() and exists (
    select 1 from public.profiles st
    where st.id = s and st.role = 'student' and st.created_by = auth.uid()
  );
$$;

-- o'quvchi o'ziga tayinlangan testni ko'ra oladimi
create or replace function public.assigned_to_me(a uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assignments asg
    where asg.id = a
      and (
        asg.student_id = auth.uid()
        or (asg.group_id is not null and exists (
          select 1 from public.group_members gm
          where gm.group_id = asg.group_id and gm.student_id = auth.uid()
        ))
      )
  );
$$;

-- psixolog/admin bu testni boshqara oladimi (tayinlash, tahrirlash)
create or replace function public.can_manage_test(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.tests tst
    where tst.id = t
      and public.is_psych()
      and (tst.owner_id = auth.uid() or tst.scope = 'library')
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. AUTH → PROFILES SYNC
--    Ochiq ro'yxatdan o'tish o'chirilgan (README ga qarang), lekin trigger
--    xavfsizlik uchun har doim 'student' roli va bloklangan holat bilan yaratadi.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, is_blocked)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'student',
    true   -- admin tasdiqlamaguncha bloklangan; admin/psixolog keyin ochiladi
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.tests         enable row level security;
alter table public.questions     enable row level security;
alter table public.options       enable row level security;
alter table public.group_members enable row level security;
alter table public.assignments   enable row level security;
alter table public.attempts      enable row level security;
alter table public.answers       enable row level security;

-- Re-run xavfsizligi: shu fayldan KEYIN ishlaydigan migratsiyalar yaratadigan
-- siyosatlar ham oldindan o'chiriladi — schema.sql ni istalgan paytda qayta
-- ishga tushirish xavfsiz bo'lsin.
drop policy if exists deleted_profiles_admin on public.deleted_profiles;
drop policy if exists audit_log_admin on public.audit_log;
drop policy if exists audit_log_no_client on public.audit_log;
drop policy if exists user_imports_select on public.user_imports;
drop policy if exists user_imports_write on public.user_imports;
drop policy if exists user_imports_update on public.user_imports;
drop policy if exists user_imports_delete on public.user_imports;

-- ---------- profiles ----------
-- Re-run xavfsizligi: har bir siyosatning barcha eski nomi o'chiriladi.
-- Skriptni 2-3 marta ishga tushirish mumkin (eski qo'lda yaratilgan
-- siyosatlar ham tozalanadi).
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.is_admin()
  or (public.is_psych() and (created_by = auth.uid() or id = auth.uid()))
);

create policy profiles_insert on public.profiles for insert to authenticated with check (
  public.is_admin()
  or (public.is_psych() and role = 'student' and created_by = auth.uid())
);

-- Yangilash: yaratish paytida rol/egasi o‘rnatiladi.
-- Keyingi tahrirlar faqat holatni (bloklash) o‘zgartirishi mumkin —
-- ya’ni admin bo‘lmagan foydalanuvchi birovni admin qilib qo‘ya olmaydi.
create policy profiles_update on public.profiles for update to authenticated using (
  public.is_admin() or (public.is_psych() and role = 'student' and created_by = auth.uid())
) with check (
  public.is_admin() or (public.is_psych() and role = 'student' and created_by = auth.uid())
);

-- O‘z-o‘zini himoya: oddiy foydalanuvchi rol, egasi yoki blok holatini
-- o‘zgartira olmaydi (faqat admin). SECURITY INVOKER trigger.
create or replace function public.profiles_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.is_blocked is distinct from old.is_blocked
     or new.created_by is distinct from old.created_by then
    raise exception 'not_allowed: role/is_blocked faqat admin tomonidan o‘zgartiriladi'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------- groups ----------
drop policy if exists groups_all on public.groups;
drop policy if exists groups_select on public.groups;
drop policy if exists groups_insert on public.groups;
drop policy if exists groups_update on public.groups;
drop policy if exists groups_delete on public.groups;
create policy groups_select on public.groups for select to authenticated using (
  public.is_admin() or owner_id = auth.uid()
  or (public.is_student_ok() and exists (
    select 1 from public.group_members gm where gm.group_id = id and gm.student_id = auth.uid()
  ))
);
create policy groups_insert on public.groups for insert to authenticated with check (
  public.is_psych() and owner_id = auth.uid()
);
create policy groups_update on public.groups for update to authenticated
  using (public.is_psych() and owner_id = auth.uid())
  with check (public.is_psych() and owner_id = auth.uid());
create policy groups_delete on public.groups for delete to authenticated
  using (owner_id = auth.uid() and public.is_psych());

-- ---------- tests ----------
drop policy if exists tests_select on public.tests;
drop policy if exists tests_insert on public.tests;
drop policy if exists tests_update on public.tests;
drop policy if exists tests_delete on public.tests;
create policy tests_select on public.tests for select to authenticated using (
  public.is_admin()
  or (public.is_psych() and (scope = 'library' or owner_id = auth.uid()))
  or (public.is_student_ok() and exists (
    select 1 from public.assignments a
    where a.test_id = id
      and (a.student_id = auth.uid() or (a.group_id is not null and exists (
        select 1 from public.group_members gm where gm.group_id = a.group_id and gm.student_id = auth.uid()
      )))
  ))
);
create policy tests_insert on public.tests for insert to authenticated with check (
  public.is_admin() and scope = 'library'
  or public.is_psych() and scope = 'personal' and owner_id = auth.uid()
);
create policy tests_update on public.tests for update to authenticated
  using (public.is_admin() or (public.is_psych() and scope = 'personal' and owner_id = auth.uid()))
  with check (public.is_admin() or (public.is_psych() and scope = 'personal' and owner_id = auth.uid()));
create policy tests_delete on public.tests for delete to authenticated
  using (public.is_admin() or (public.is_psych() and scope = 'personal' and owner_id = auth.uid()));

-- ---------- questions ----------
drop policy if exists questions_select on public.questions;
drop policy if exists questions_write on public.questions;
create policy questions_select on public.questions for select to authenticated using (
  exists (
    select 1 from public.tests t where t.id = test_id and (
      public.is_admin()
      or (public.is_psych() and (t.scope = 'library' or t.owner_id = auth.uid()))
      or (public.is_student_ok() and exists (
        select 1 from public.assignments a
        where a.test_id = t.id and (
          a.student_id = auth.uid() or (a.group_id is not null and exists (
            select 1 from public.group_members gm where gm.group_id = a.group_id and gm.student_id = auth.uid()
          ))
        )
      ))
    )
  )
);
create policy questions_write on public.questions for all to authenticated
  using (public.owns_test(test_id))
  with check (public.owns_test(test_id) or public.is_admin());

-- ---------- options ----------
-- XAVFSIZLIK: o'quvchi `score` va `dim_scores` ustunlarini hech qachon o'qiy olmaydi.
-- Shu sababli jadval darajasidagi SELECT olib tashlanadi va faqat ustunlar
-- grant orqali ochiladi; RLS esa qatorlarga ruxsat beradi.
revoke select on public.options from authenticated, anon;
-- Admin/psixolog uchun to'liq o'qish (balllar tahrirlash uchun kerak)
grant select (id, question_id, position, text, score, dim_scores) on public.options to authenticated;

drop policy if exists options_select on public.options;
drop policy if exists options_write on public.options;
create policy options_select on public.options for select to authenticated using (
  exists (
    select 1 from public.questions q join public.tests t on t.id = q.test_id
    where q.id = question_id and (
      public.is_admin()
      or (public.is_psych() and (t.scope = 'library' or t.owner_id = auth.uid()))
      or (public.is_student_ok() and exists (
        select 1 from public.assignments a
        where a.test_id = t.id and (
          a.student_id = auth.uid() or (a.group_id is not null and exists (
            select 1 from public.group_members gm where gm.group_id = a.group_id and gm.student_id = auth.uid()
          ))
        )
      ))
    )
  )
);
create policy options_write on public.options for all to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id and public.owns_test(q.test_id)))
  with check (exists (select 1 from public.questions q where q.id = question_id and public.owns_test(q.test_id)));

-- ---------- group_members ----------
drop policy if exists gm_select on public.group_members;
drop policy if exists gm_write on public.group_members;
create policy gm_select on public.group_members for select to authenticated using (
  public.is_admin() or public.owns_group(group_id) or student_id = auth.uid()
);
create policy gm_write on public.group_members for all to authenticated
  using (public.owns_group(group_id))
  with check (
    public.owns_group(group_id)
    and exists (
      select 1 from public.profiles p
      where p.id = student_id and p.role = 'student' and p.created_by = auth.uid()
    )
  );

-- ---------- assignments ----------
drop policy if exists assignments_select on public.assignments;
drop policy if exists assignments_insert on public.assignments;
drop policy if exists assignments_update on public.assignments;
drop policy if exists assignments_delete on public.assignments;
create policy assignments_select on public.assignments for select to authenticated using (
  public.is_admin()
  or (public.is_psych() and (assigned_by = auth.uid() or (group_id is not null and public.owns_group(group_id))))
  or (public.is_student_ok() and (
    student_id = auth.uid() or (group_id is not null and exists (
      select 1 from public.group_members gm where gm.group_id = assignments.group_id and gm.student_id = auth.uid()
    ))
  ))
);
create policy assignments_insert on public.assignments for insert to authenticated with check (
  (public.is_admin() or public.is_psych())
  and public.can_manage_test(test_id)
  and assigned_by = auth.uid()
  and (
    (student_id is not null and (select role from public.profiles where id = student_id) = 'student'
      and (public.is_admin() or (select created_by from public.profiles where id = student_id) = auth.uid()))
    or
    (group_id is not null and (public.is_admin() or public.owns_group(group_id)))
  )
);
create policy assignments_update on public.assignments for update to authenticated using (
  public.is_admin() or (public.is_psych() and (assigned_by = auth.uid() or (group_id is not null and public.owns_group(group_id))))
) with check (
  public.is_admin() or (public.is_psych() and (assigned_by = auth.uid() or (group_id is not null and public.owns_group(group_id))))
);
create policy assignments_delete on public.assignments for delete to authenticated using (
  public.is_admin() or (public.is_psych() and assigned_by = auth.uid())
);

-- ---------- attempts ----------
drop policy if exists attempts_select on public.attempts;
drop policy if exists attempts_insert on public.attempts;
drop policy if exists attempts_update_student on public.attempts;
drop policy if exists attempts_update_staff on public.attempts;
drop policy if exists attempts_delete_staff on public.attempts;
create policy attempts_select on public.attempts for select to authenticated using (
  public.is_admin()
  or (public.is_psych() and public.psych_has_student(student_id))
  or (public.is_student_ok() and student_id = auth.uid() and public.assigned_to_me(assignment_id))
);
create policy attempts_insert on public.attempts for insert to authenticated with check (
  public.is_student_ok()
  and student_id = auth.uid()
  and public.assigned_to_me(assignment_id)
  and exists (select 1 from public.assignments a where a.id = assignment_id and a.test_id = test_id)
);
-- O'quvchi faqat in_progress holatdagi urinishini yangilay oladi
create policy attempts_update_student on public.attempts for update to authenticated
  using (public.is_student_ok() and student_id = auth.uid() and status = 'in_progress')
  with check (public.is_student_ok() and student_id = auth.uid() and status = 'in_progress');

-- O‘quvchi ball/foizni soxtalashtira olmaydi; topshirish faqat score_attempt() orqali.
create or replace function public.attempts_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  -- score_attempt() faqat shu bayroqni o‘rnatib natijani yozadi
  if current_setting('ruhiyat.scoring', true) = 'on' then
    return new;
  end if;
  if public.is_admin()
     or (public.is_psych() and public.psych_has_student(old.student_id)) then
    return new;
  end if;
  if old.status = 'in_progress' and new.status = 'submitted' then
    raise exception 'not_allowed: testni faqat score_attempt() funksiyasi yakunlaydi'
      using errcode = '42501';
  end if;
  if new.total_score is distinct from old.total_score
     or new.percent is distinct from old.percent
     or new.max_score is distinct from old.max_score
     or new.dimension_result is distinct from old.dimension_result
     or new.started_at is distinct from old.started_at
     or new.deadline_at is distinct from old.deadline_at then
    raise exception 'not_allowed: natija maydonlari serverda hisoblanadi'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists attempts_guard_trg on public.attempts;
create trigger attempts_guard_trg
  before update on public.attempts
  for each row execute function public.attempts_guard();
-- Psixolog/admin qayta urinishga ruxsat berish (status = 'reset' → o'chiriladi)
create policy attempts_update_staff on public.attempts for update to authenticated
  using (
    (public.is_admin() or (public.is_psych() and public.psych_has_student(student_id)))
  )
  with check (
    (public.is_admin() or (public.is_psych() and public.psych_has_student(student_id)))
  );
create policy attempts_delete_staff on public.attempts for delete to authenticated using (
  public.is_admin() or (public.is_psych() and public.psych_has_student(student_id))
);

-- ---------- answers ----------
drop policy if exists answers_select on public.answers;
drop policy if exists answers_write on public.answers;
create policy answers_select on public.answers for select to authenticated using (
  public.is_admin()
  or (public.is_psych() and exists (
    select 1 from public.attempts at
    where at.id = attempt_id and public.psych_has_student(at.student_id)
  ))
  or (public.is_student_ok() and exists (
    select 1 from public.attempts at where at.id = attempt_id and at.student_id = auth.uid()
  ))
);
create policy answers_write on public.answers for all to authenticated using (
  exists (
    select 1 from public.attempts at
    where at.id = attempt_id and at.student_id = auth.uid() and at.status = 'in_progress'
  )
) with check (
  exists (
    select 1 from public.attempts at
    where at.id = attempt_id and at.student_id = auth.uid() and at.status = 'in_progress'
  )
);

-- -----------------------------------------------------------------------------
-- 6. SCORING (server-side — o'quvchi hisobni o'zgartira olmaydi)
-- -----------------------------------------------------------------------------
create or replace function public.score_attempt(p_attempt_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.attempts;
  v_test public.tests;
  v_own boolean;
  v_staff boolean;
  v_total numeric := 0;
  v_max numeric := 0;
  v_answered int := 0;
  v_qcount int := 0;
  v_dims jsonb;
  v_dim jsonb;
  v_dim_sum numeric;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if v_attempt.id is null then raise exception 'attempt_not_found'; end if;
  if v_attempt.status = 'submitted' then return; end if;

  v_own := (v_attempt.student_id = auth.uid());
  select public.is_admin() or (public.is_psych() and public.psych_has_student(v_attempt.student_id))
    into v_staff;

  if not (v_own or v_staff) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into v_test from public.tests where id = v_attempt.test_id;

  select count(*) into v_qcount from public.questions where test_id = v_test.id;

  if coalesce(v_test.scoring->>'type', 'correct') = 'dimensions' then
    -- Psixologik: har bir dimension uchun tanlangan variant ballarini yig'ish
    v_dims := '{}'::jsonb;
    for v_dim in select * from jsonb_array_elements(coalesce(v_test.scoring->'dimensions', '[]'::jsonb)) loop
      select coalesce(sum(coalesce((o.dim_scores->>(v_dim->>'key'))::numeric, 0)), 0)
        into v_dim_sum
      from public.answers a
      join public.options o on o.id = a.option_id
      where a.attempt_id = v_attempt.id;
      v_dims := v_dims || jsonb_build_object(v_dim->>'key', v_dim_sum);
      v_total := v_total + v_dim_sum;
    end loop;
    v_max := null;
    select count(*) into v_answered from public.answers where attempt_id = v_attempt.id and option_id is not null;
  else
    -- Standart: to'g'ri javoblar
    select coalesce(sum(case when o.score > 0 then 1 else 0 end), 0), count(*)
      into v_total, v_answered
    from public.answers a
    join public.options o on o.id = a.option_id
    where a.attempt_id = v_attempt.id;
    v_max := v_qcount;
  end if;

  -- attempts_guard triggerini aylanib o‘tish (faqat shu funksiya ichida)
  perform set_config('ruhiyat.scoring', 'on', true);

  update public.attempts set
    status = 'submitted',
    submitted_at = now(),
    total_score = v_total,
    max_score = v_max,
    percent = case
      when v_test.scoring->>'type' = 'dimensions' then
        case when v_qcount > 0 then round((v_answered::numeric / v_qcount) * 100, 1) else 0 end
      else
        case when coalesce(v_max, 0) > 0 then round((v_total / v_max) * 100, 1) else 0 end
    end,
    dimension_result = case when v_test.scoring->>'type' = 'dimensions' then v_dims else null end,
    updated_at = now()
  where id = p_attempt_id;

  perform set_config('ruhiyat.scoring', 'off', true);
end $$;

grant execute on function public.score_attempt(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. HUQUQLAR (RLS + GRANT)
--
-- RLS qatorga ruxsat beradi, lekin `GRANT` bo'lmasa PostgREST
-- "permission denied for table / function" qaytaradi. Supabase sukut bo'yicha
-- `public` sxemasidagi jadvallarga `anon, authenticated` ga huquq beradi, ammo
-- `revoke` bilan o'zgartirilgan loyihalarda bu qayta tiklanmaydi.
-- Shu sababli asosiy jadvallar uchun huquqlar ATAYLAB beriladi.
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles      to authenticated;
grant select, insert, update, delete on public.groups        to authenticated;
grant select, insert, update, delete on public.tests         to authenticated;
grant select, insert, update, delete on public.questions     to authenticated;
grant select, insert, update, delete on public.options       to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.assignments   to authenticated;
grant select, insert, update, delete on public.attempts      to authenticated;
grant select, insert, update, delete on public.answers       to authenticated;

-- XAVFSIZLIK: o'quvchi `options.score` / `dim_scores` ni o'qiy olmasin —
-- jadval darajasidagi SELECT olib tashlanadi, lekin barcha ustunlar
-- (o'qish uchun zarur bo'lganlar) ustun-darajasidagi GRANT bilan beriladi.
-- Avvalgi holatda faqat 4 ustun berilgan edi → admin/psixolog testni ochganda
-- "permission denied for table options" olardi.
-- RLS qatorlarni baribir cheklaydi.
revoke select on public.options from authenticated, anon;
grant select (id, question_id, position, text, score, dim_scores)
  on public.options to authenticated;


-- attempts: o'quvchi o'z urinishining HOLATINI ko'radi, BALLINI ko'rmaydi.
-- GRANT umumiy huquqlar (PostgREST uchun kerak, RLS alohida boshqaradi)
grant select, insert, update, delete on public.attempts to authenticated;

-- RLS qator-level siyosat: faqat o'quvchilar faqat o'zinglarining urinishlarini yaratishi va holatini o'zgartirishi mumkin
-- Admin/psixolog barcha amallarni bajara oladi
revoke select on public.attempts from authenticated;
grant select (
  id, assignment_id, test_id, student_id, status, round,
  started_at, deadline_at, submitted_at, auto_submitted, updated_at
) on public.attempts to authenticated;

-- O'quvchilar faqat o'zingi urinishini yaratishi va status='in_progress' yangilashi mumkin
create policy attempts_insert_student on public.attempts for insert to authenticated
  with check (public.is_student_ok() and student_id = auth.uid());

-- Admin/psixolog barcha urinishlarni boshqarishi mumkin
create policy attempts_insert_staff on public.attempts for insert to authenticated
  with check (public.is_admin() or (public.is_psych() and public.psych_has_student(student_id)));

-- O'quvchilar faqat o'zingi holatini yangilashi mumkin (faqat in_progress)
create policy attempts_update_student on public.attempts for update to authenticated
  using (public.is_student_ok() and student_id = auth.uid() and status = 'in_progress')
  with check (public.is_student_ok() and student_id = auth.uid() and status = 'in_progress');

-- Admin/psixolog barcha holatlarni yangilashi mumkin
create policy attempts_update_staff on public.attempts for update to authenticated
  using (public.is_admin() or (public.is_psych() and public.psych_has_student(student_id)))
  with check (public.is_admin() or (public.is_psych() and public.psych_has_student(student_id)));

-- RLS yordamchi funksiyalari — `authenticated` uchun EXECUTE shart.
grant execute on function public.is_admin()                   to authenticated;
grant execute on function public.is_psych()                   to authenticated;
grant execute on function public.is_student_ok()              to authenticated;
grant execute on function public.current_role_is(public.user_role) to authenticated;
grant execute on function public.current_user_id()            to authenticated;
grant execute on function public.owns_test(uuid)              to authenticated;
grant execute on function public.owns_group(uuid)             to authenticated;
grant execute on function public.group_has_member(uuid, uuid) to authenticated;
grant execute on function public.psych_has_student(uuid)      to authenticated;

grant execute on function public.can_manage_test(uuid)        to authenticated;
grant execute on function public.email_for_login(text)        to anon, authenticated;

-- Staff (admin/psixolog) natija ustunlarini o'qishi mumkin — ustun GRANT yoki
-- `to authenticated` bo'lgani uchun bu qator RLS bilan bir xil ishlaydi.
grant select (total_score, max_score, percent, dimension_result)
  on public.attempts to authenticated;

grant execute on function public.score_attempt(uuid) to authenticated;
