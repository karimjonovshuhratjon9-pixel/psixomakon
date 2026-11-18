-- =============================================================================
-- PSIXOMAKON — seed dublikatlarini tozalash + takror tayinlashga qarshi himoya
--
-- QACHON KERAK:
--   `seed.sql` ni ikki marta ishga tushirgan bo'lsangiz (avval takrorlash
--   himoyasi yo'q edi) — kutubxonada bir xil sarlavhali testlar ikki nusxada
--   paydo bo'ladi.
--
-- NIMA QILADI:
--   1. Bir xil `title` bilan yaratilgan takror kutubxona testlaridan FAQAT
--      BITTASINI qoldiradi (eng eskisini), qolganlarini o'chiradi.
--   2. Qolgan testda `assignments` bo'lsa — u SАQLANADI (natijalar yo'qolmaydi):
--      bunday test o'chirilmaydi, faqat nomi takrorlanmasligi uchun
--      `is_active = false` qilib arxivlanadi va ogohlantirish q aytariladi.
--   3. Natija: takror nom endi yangi yaratilmaydi — seed.sql idempotent.
--
-- Idempotent: qayta ishga tushirish xavfsiz.
-- =============================================================================

do $$
declare
  rec            record;
  rec2           record;
  keep_id        uuid;
  has_assign     boolean;
  removed        int := 0;
  archived       int := 0;
begin
  -- 1. Qo'shni dublikat guruhlar bo'yicha eng eski testni "asosiy" deb belgilaymiz
  for rec in
    select scope, title, count(*) as cnt, min(created_at) as first_at
    from public.tests
    where scope = 'library'
    group by scope, title
    having count(*) > 1
  loop
    select id into keep_id
    from public.tests
    where scope = 'library' and title = rec.title
    order by created_at asc, id asc
    limit 1;

    -- 2. Boshqa nusxalarni tekshirib o'chirish
    for rec2 in
      select id from public.tests
      where scope = 'library' and title = rec.title and id <> keep_id
    loop
      select exists (select 1 from public.assignments a where a.test_id = rec2.id)
        into has_assign;

      if has_assign then
        -- Tayinlash/natijalar bor — o'chirmaymiz, faqat arxivlaymiz
        update public.tests set is_active = false where id = rec2.id;
        archived := archived + 1;
      else
        delete from public.tests where id = rec2.id;  -- questions/options CASCADE
        removed := removed + 1;
      end if;
    end loop;
  end loop;

  raise notice 'Seed tozalash: % ta dublikat o''chirildi, % ta arxivlandi.',
    removed, archived;
end $$;

-- -----------------------------------------------------------------------------
-- Natija tekshiruvi: bir xil sarlavhali kutubxona testlari qolmaganini ko'rish
-- -----------------------------------------------------------------------------
-- select title, count(*) from public.tests
-- where scope = 'library' group by title having count(*) > 1;
