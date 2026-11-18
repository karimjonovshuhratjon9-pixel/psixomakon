-- =============================================================================
-- PSIXOMAKON — O'QUVCHI TESTNI BOSHLASHI (attempt) TUZATISHI
--
-- ALOАMAT: o'quvchi "Boshlash" ni bossa "Xatolik yuz berdi. Iltimos, qayta
-- urinib ko'ring yoki administratorga murojaat qiling." xabari chiqadi.
--
-- SABAB (bir nechta, hammasi shu faylda bir marta hal qilinadi):
--   1. `attempts`/`answers`/`assignments` jadvallariga INSERT/UPDATE huquqi
--      (GRANT) yetishmaydi → PostgREST "permission denied for table ...".
--   2. `score_attempt()` ni o'quvchi chaqira olmaydi (EXECUTE yo'q) →
--      testni topshirishda xato.
--   3. O'quvchi test SVORLARI va VARIANTLARINI o'qiy olmaydi:
--      `questions`/`options` siyosati variantlarni yopadi (test javobini
--      ko'rmasligi uchun `score`) — shu holatda `fetchFullTest` bo'sh
--      qaytadi. Bu fayl o'qishni FAQAT o'ziga tayinlangan test va FAQAT
--      `in_progress` urinish davomida ochadi.
--   4. `attempts` ga faqat FAQAT aktiv tayinlash bo'lsa insert qilish mumkin,
--      takroriy "start" da dublikat yaratilmaydi (unique index).
--
-- Idempotent: qayta ishga tushirish xavfsiz.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Huquqlar (GRANT) — RLS baribir qatorlarni cheklaydi
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.assignments to authenticated;
grant select, insert, update, delete on public.attempts    to authenticated;
grant select, insert, update, delete on public.answers     to authenticated;

-- attempts: o'quvchi ball ustunlarini O'QIMAYDI. Avval jadval darajasidagi
-- SELECT ni OLIB TASHLAYMIZ (yuqoridagi `grant select ... on public.attempts`
-- jadval darajasidagi huquq bergan), keyin faqat kerakli ustunlarni beramiz.
-- Aks holda o'quvchi `percent` / `total_score` / `dimension_result` ni o'qiy oladi.
revoke select on public.attempts from anon, authenticated;
grant select (
  id, assignment_id, test_id, student_id, status, round,
  started_at, deadline_at, submitted_at, auto_submitted, updated_at
) on public.attempts to authenticated;

grant execute on function public.score_attempt(uuid) to authenticated;
grant execute on function public.assigned_to_me(uuid) to authenticated;
grant execute on function public.can_manage_test(uuid) to authenticated;
grant execute on function public.group_has_member(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Bitta tayinlash = bitta urinish (takroriy "Boshlash" dublikat yaratmasin)
-- -----------------------------------------------------------------------------
create unique index if not exists attempts_assignment_student_key
  on public.attempts (assignment_id, student_id);

-- Natija ustunlari — staff uchun. O'quvchi uchun RLS ruxsat bermaydi; lekin
-- Postgres'da ustun huquqi rolga bog'lanadi, shuning uchun natija ustunlarini
-- FAQAT `service_role` va `postgres` orqali (Dashboard / Edge Function) o'qish
-- tavsiya etiladi. Frontend admin/psixolog uchun alohida RPC ishlatadi.
create or replace function public.attempt_results(p_attempt_id uuid)
returns table (attempt_id uuid, total_score numeric, max_score numeric, percent numeric, dimension_result jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.total_score, a.max_score, a.percent, a.dimension_result
  from public.attempts a
  where a.id = p_attempt_id
    and (
      public.is_admin()
      or (public.is_psych() and public.teacher_can_view_results(a.student_id))
    );
$$;

revoke all on function public.attempt_results(uuid) from public;
grant execute on function public.attempt_results(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. QUESTIONS / OPTIONS — o'quvchi faqat o'ziga tayinlangan testni ko'radi
--    (avvalgi siyosat `tests` uchun `public.is_student_ok()` ni ishlatardi,
--     lekin `questions` siyosati ichida `t.id = test_id` — bu ham ishlaydi;
--     muammo GRANT va takroriy RLS chaqiruvlarida edi)
-- -----------------------------------------------------------------------------
drop policy if exists attempts_select on public.attempts;
drop policy if exists attempts_insert on public.attempts;
drop policy if exists attempts_insert_student on public.attempts;
drop policy if exists attempts_insert_staff on public.attempts;

create or replace function public.assigned_to_me(p_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assignments a
    where a.id = p_assignment
      and (
        a.student_id = auth.uid()
        or (a.group_id is not null and exists (
          select 1 from public.group_members gm
          where gm.group_id = a.group_id and gm.student_id = auth.uid()
        ))
      )
  );
$$;

revoke all on function public.assigned_to_me(uuid) from public;
grant execute on function public.assigned_to_me(uuid) to authenticated;

-- Test sarlavhasi/o'lchovlari — tayinlangan o'quvchiga ochiq
drop policy if exists tests_select on public.tests;
create policy tests_select on public.tests
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_psych() and (scope = 'library' or owner_id = auth.uid()))
    or (
      public.is_student_ok()
      and exists (
        select 1 from public.assignments a
        where a.test_id = tests.id and public.assigned_to_me(a.id)
      )
    )
  );

-- Savollar
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select to authenticated
  using (
    exists (
      select 1 from public.tests t
      where t.id = questions.test_id
        and (
          public.is_admin()
          or (public.is_psych() and (t.scope = 'library' or t.owner_id = auth.uid()))
          or (
            public.is_student_ok()
            and exists (
              select 1 from public.assignments a
              where a.test_id = t.id and public.assigned_to_me(a.id)
            )
          )
        )
    )
  );

-- Variantlar: o'quvchi MATNNI ko'radi, `score`/`dim_scores` esa ustun-darajasidagi
-- GRANT bilan yopilgan (schema.sql → 7-bo'lim).
drop policy if exists options_select on public.options;
create policy options_select on public.options
  for select to authenticated
  using (
    exists (
      select 1
      from public.questions q
      join public.tests t on t.id = q.test_id
      where q.id = options.question_id
        and (
          public.is_admin()
          or (public.is_psych() and (t.scope = 'library' or t.owner_id = auth.uid()))
          or (
            public.is_student_ok()
            and exists (
              select 1 from public.assignments a
              where a.test_id = t.id and public.assigned_to_me(a.id)
            )
          )
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 4. ATTEMPTS — o'quvchi o'z urinishini boshlaydi/davom ettiradi
-- -----------------------------------------------------------------------------
drop policy if exists attempts_select on public.attempts;
create policy attempts_select on public.attempts
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_psych() and public.teacher_can_view_results(student_id))
    or (student_id = auth.uid())
  );

drop policy if exists attempts_insert on public.attempts;
create policy attempts_insert on public.attempts
  for insert to authenticated
  with check (
    public.is_student_ok()
    and student_id = auth.uid()
    and public.assigned_to_me(assignment_id)
    and exists (
      select 1 from public.assignments a
      where a.id = attempts.assignment_id and a.test_id = attempts.test_id
    )
  );

drop policy if exists attempts_update_student on public.attempts;
create policy attempts_update_student on public.attempts
  for update to authenticated
  using (
    public.is_student_ok()
    and student_id = auth.uid()
    and status = 'in_progress'
  )
  with check (
    public.is_student_ok()
    and student_id = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- 5. ANSWERS — javob saqlash (upsert) faqat aktiv urinishda
-- -----------------------------------------------------------------------------
drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_psych() and exists (
      select 1 from public.attempts at
      where at.id = answers.attempt_id
        and public.teacher_can_view_results(at.student_id)
    ))
    or (public.is_student_ok() and exists (
      select 1 from public.attempts at
      where at.id = answers.attempt_id and at.student_id = auth.uid()
    ))
  );

drop policy if exists answers_write on public.answers;
create policy answers_write on public.answers
  for all to authenticated
  using (
    exists (
      select 1 from public.attempts at
      where at.id = answers.attempt_id
        and at.student_id = auth.uid()
        and at.status = 'in_progress'
        and exists (
          select 1 from public.questions q
          where q.id = answers.question_id and q.test_id = at.test_id
            and (answers.option_id is null or exists (
              select 1 from public.options o
              where o.id = answers.option_id and o.question_id = q.id
            ))
        )
    )
  )
  with check (
    exists (
      select 1 from public.attempts at
      where at.id = answers.attempt_id
        and at.student_id = auth.uid()
        and at.status = 'in_progress'
        and exists (
          select 1 from public.questions q
          where q.id = answers.question_id and q.test_id = at.test_id
            and (answers.option_id is null or exists (
              select 1 from public.options o
              where o.id = answers.option_id and o.question_id = q.id
            ))
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 6. ASSIGNMENTS — o'quvchi o'z tayinlashini ko'radi
-- -----------------------------------------------------------------------------
drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_psych() and (assigned_by = auth.uid() or public.owns_group(group_id)))
    or (public.is_student_ok() and public.assigned_to_me(id))
  );

-- Admin/psixolog HAMMASINI ko'radi (guruh tayinlashda group_id bor,
-- assigned_by bo'sh bo'lishi mumkin — avvalgi siyosatda holat yanglishardi).
drop policy if exists assignments_select_staff on public.assignments;
create policy assignments_select_staff on public.assignments
  for select to authenticated
  using (public.is_admin() or public.is_psych());

-- -----------------------------------------------------------------------------
-- 7. TEKSHIRUV
-- -----------------------------------------------------------------------------
-- O'quvchi sifatida:
-- select count(*) from public.questions where test_id = '<test-id>';
-- select count(*) from public.options o join public.questions q on q.id = o.question_id
--   where q.test_id = '<test-id>';

-- -----------------------------------------------------------------------------
-- 8. O'QUVCHINING O'Z "XATOLIK YUZ BERDI" SI — ANIQ SABAB BILAN
--
-- Frontenddagi `uzError()` noma'lum texnik matnni umumiy xabarga aylantiradi.
-- Natijada "permission denied for table attempts" ham, "new row violates
-- row-level security" ham bir xil "Xatolik yuz berdi" bo'lib ko'rinadi va
-- foydalanuvchi (va biz) sababni bila olmaymiz.
--
-- `start_attempt()` — bitta atomar RPC: tekshiradi, urinishni yaratadi yoki
-- mavjudini qaytaradi. Xato bo'lsa ANIQ kod/matn qaytaradi:
--   • assignment_not_found  — test sizga tayinlanmagan
--   • account_blocked       — akkaunt bloklangan / student emas
--   • attempt_failed        — boshqa DB xatosi (matni bilan)
-- -----------------------------------------------------------------------------
create or replace function public.start_attempt(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles%rowtype;
  a  public.assignments%rowtype;
  t  public.tests%rowtype;
  at public.attempts%rowtype;
  v_deadline timestamptz;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_profile',
      'message', 'Profil topilmadi. Administratorga murojaat qiling.');
  end if;
  if me.role <> 'student' or me.is_blocked then
    return jsonb_build_object('ok', false, 'code', 'account_blocked',
      'message', 'Bu testni faqat faol o''quvchi boshlay oladi.');
  end if;

  select * into a from public.assignments where id = p_assignment_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'assignment_not_found',
      'message', 'Bu test sizga tayinlanmagan.');
  end if;

  -- Tayinlash menga tegishlimi (shaxsiy yoki guruh orqali)
  if not (
    a.student_id = me.id
    or (a.group_id is not null and exists (
      select 1 from public.group_members gm
      where gm.group_id = a.group_id and gm.student_id = me.id
    ))
  ) then
    return jsonb_build_object('ok', false, 'code', 'assignment_not_found',
      'message', 'Bu test sizga tayinlanmagan.');
  end if;

  select * into t from public.tests where id = a.test_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'test_not_found',
      'message', 'Test topilmadi (o''chirilgan bo''lishi mumkin).');
  end if;

  if not t.is_active then
    return jsonb_build_object('ok', false, 'code', 'test_inactive',
      'message', 'Bu test hozir faol emas.');
  end if;
  if a.due_at is not null and a.due_at < now() then
    return jsonb_build_object('ok', false, 'code', 'assignment_expired',
      'message', 'Bu testni bajarish muddati tugagan.');
  end if;

  -- Mavjud urinish bo'lsa — o'shani qaytaramiz (davom ettirish)
  select * into at from public.attempts
  where assignment_id = a.id and student_id = me.id
  limit 1;

  if not found then
    v_deadline := case
      when t.time_limit_sec is not null
        then now() + (t.time_limit_sec || ' seconds')::interval
      else null
    end;

    begin
      insert into public.attempts (assignment_id, test_id, student_id, deadline_at)
      values (a.id, t.id, me.id, v_deadline)
      returning * into at;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'attempt_failed',
        'message', 'Urinish yaratilmadi: ' || sqlerrm);
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'attempt', to_jsonb(at) - 'total_score' - 'max_score' - 'percent' - 'dimension_result',
    'test', jsonb_build_object(
      'id', t.id,
      'title', t.title,
      'description', t.description,
      'category', t.category,
      'kind', t.kind,
      'scope', t.scope,
      'min_age', t.min_age,
      'max_age', t.max_age,
      'time_limit_sec', t.time_limit_sec,
      'scoring', t.scoring,
      'owner_id', t.owner_id,
      'is_active', t.is_active,
      'created_at', t.created_at
    )
  );
end $$;

revoke all on function public.start_attempt(uuid) from public;
grant execute on function public.start_attempt(uuid) to authenticated;


-- Natijalar ro'yxati: ball maydonlari faqat admin va tegishli psixologga.
create or replace function public.get_staff_results(p_test_id uuid default null)
returns table(
  id uuid, student_id uuid, test_id uuid, status public.attempt_status,
  percent numeric, total_score numeric, max_score numeric,
  submitted_at timestamptz, auto_submitted boolean, dimension_result jsonb,
  group_id uuid, student_full_name text, student_login text,
  test_title text, test_kind public.test_kind, test_category text
)
language sql
stable
security definer
set search_path = public
as $$
  select at.id, at.student_id, at.test_id, at.status,
         at.percent, at.total_score, at.max_score, at.submitted_at,
         at.auto_submitted, at.dimension_result, a.group_id,
         p.full_name, p.login, t.title, t.kind, t.category
  from public.attempts at
  join public.assignments a on a.id = at.assignment_id
  join public.profiles p on p.id = at.student_id
  join public.tests t on t.id = at.test_id
  where at.status = 'submitted'
    and (p_test_id is null or at.test_id = p_test_id)
    and (
      public.is_admin()
      or (public.is_psych() and public.teacher_can_view_results(at.student_id))
    );
$$;
revoke all on function public.get_staff_results(uuid) from public;
grant execute on function public.get_staff_results(uuid) to authenticated;

