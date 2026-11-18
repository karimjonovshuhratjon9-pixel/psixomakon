-- =============================================================================
-- PSIXOMAKON — boshlang'ich kutubxona testlari (ixtiyoriy, lekin tavsiya etiladi)
-- schema.sql dan KEYIN ishga tushiring. Admin huquqi bilan (SQL Editor) ishlaydi.
--
-- TAKRORLASH HIMOYASI: skriptni ikkinchi marta ishga tushirsangiz, testlar
-- dublikat bo'lib qolmaydi (sarlavha bo'yicha tekshiriladi).
-- =============================================================================

do $$
declare
  t uuid;
  q uuid;
begin
  -- Agar testlar allaqachon yuklangan bo'lsa — hech narsa qilmaymiz
  if exists (
    select 1 from public.tests
    where scope = 'library'
      and title in (
        'Stressni boshqarish: asosiy bilimlar',
        'Temperament yo''nalishini aniqlash (qisqa shakl)',
        'Stress darajasini baholash'
      )
  ) then
    raise notice 'Kutubxona testlari allaqachon mavjud — seed o''tkazib yuborildi.';
    return;
  end if;
  -- ---------------------------------------------------------------------------
  -- 1. Standart test (A/B/C/D)
  -- ---------------------------------------------------------------------------
  insert into public.tests (title, description, category, kind, scope, min_age, max_age, time_limit_sec, scoring)
  values (
    'Stressni boshqarish: asosiy bilimlar',
    'Stress tushunchasi, belgilari va uni boshqarish usullari bo''yicha qisqa bilim testi.',
    'Stress', 'standard', 'library', 14, 70, 600, '{"type":"correct"}'::jsonb
  ) returning id into t;

  insert into public.questions (test_id, position, text) values
    (t, 1, 'Stress — bu...');
  insert into public.options (question_id, position, text, score)
    select id, 1, 'Tanaga ta''sir etuvchi faqat jismoniy omil', 0 from public.questions where test_id = t and position = 1;
  insert into public.options (question_id, position, text, score)
    select id, 2, 'Tashqi talablarga organizmning moslashuv javobi', 1 from public.questions where test_id = t and position = 1;
  insert into public.options (question_id, position, text, score)
    select id, 3, 'Faqat ruhiy kasallik', 0 from public.questions where test_id = t and position = 1;
  insert into public.options (question_id, position, text, score)
    select id, 4, 'Dam olishning bir turi', 0 from public.questions where test_id = t and position = 1;

  insert into public.questions (test_id, position, text) values (t, 2, 'Qaysi holat surunkali stress belgisi hisoblanadi?');
  insert into public.options (question_id, position, text, score) select id, 1, 'Yaxshi uyqu', 0 from public.questions where test_id = t and position = 2;
  insert into public.options (question_id, position, text, score) select id, 2, 'Doimiy charchoq va uyqusizlik', 1 from public.questions where test_id = t and position = 2;
  insert into public.options (question_id, position, text, score) select id, 3, 'Ishonchning ortishi', 0 from public.questions where test_id = t and position = 2;
  insert into public.options (question_id, position, text, score) select id, 4, 'Ishtahaning kuchayishi', 0 from public.questions where test_id = t and position = 2;

  insert into public.questions (test_id, position, text) values (t, 3, 'Stress bilan kurashishning eng samarali usullaridan biri:');
  insert into public.options (question_id, position, text, score) select id, 1, 'Muammodan chetlashish', 0 from public.questions where test_id = t and position = 3;
  insert into public.options (question_id, position, text, score) select id, 2, 'Nafas mashqlari va jismoniy faollik', 1 from public.questions where test_id = t and position = 3;
  insert into public.options (question_id, position, text, score) select id, 3, 'Ko''proq kofe ichish', 0 from public.questions where test_id = t and position = 3;
  insert into public.options (question_id, position, text, score) select id, 4, 'Hissiyotlarni bostirish', 0 from public.questions where test_id = t and position = 3;

  -- ---------------------------------------------------------------------------
  -- 2. Psixologik test (dimension scoring) — temperament
  -- ---------------------------------------------------------------------------
  insert into public.tests (title, description, category, kind, scope, min_age, max_age, time_limit_sec, scoring)
  values (
    'Temperament yo''nalishini aniqlash (qisqa shakl)',
    'To''rtta asosiy temperament yo''nalishi bo''yicha o''z-o''zini baholash. Natija klinik tashxis emas, balki o''zini anglash uchun mo''ljallangan.',
    'Temperament', 'psych', 'library', 12, 80, null,
    '{"type":"dimensions","dimensions":[
      {"key":"sangvinik","label":"Sangvinik","description":"Faol, muloqotchan, tez qo''zg''aluvchan, ta''sirchan."},
      {"key":"xolerik","label":"Xolerik","description":"Shiddatli, tashabbuskor, kuchli emotsiyalar bilan ajralib turadi."},
      {"key":"flegmatik","label":"Flegmatik","description":"Sokin, barqaror, shoshilmaydigan, sabr-toqatli."},
      {"key":"melanxolik","label":"Melanxolik","description":"Nozik hissiyotli, chuqur o''ylaydigan, ehtiyotkor."}
    ]}'::jsonb
  ) returning id into t;

  insert into public.questions (test_id, position, text) values (t, 1, 'Yangi guruhga tushganingizda qanday his qilasiz?');
  insert into public.options (question_id, position, text, dim_scores) select id, 1, 'Tez tanishib ketaman, faol muloqot qilaman', '{"sangvinik":2,"xolerik":1}'::jsonb from public.questions where test_id = t and position = 1;
  insert into public.options (question_id, position, text, dim_scores) select id, 2, 'Tashabbusni o''zim olaman', '{"xolerik":2,"sangvinik":1}'::jsonb from public.questions where test_id = t and position = 1;
  insert into public.options (question_id, position, text, dim_scores) select id, 3, 'Kuzataman, keyin qo''shilaman', '{"flegmatik":2,"melanxolik":1}'::jsonb from public.questions where test_id = t and position = 1;
  insert into public.options (question_id, position, text, dim_scores) select id, 4, 'Noqulaylik sezaman, o''zimni chetga olaman', '{"melanxolik":2}'::jsonb from public.questions where test_id = t and position = 1;

  insert into public.questions (test_id, position, text) values (t, 2, 'Rejalaringiz to''satdan buzilsa, qanday munosabat bildirasiz?');
  insert into public.options (question_id, position, text, dim_scores) select id, 1, 'Tezda yangi rejaga moslashaman', '{"sangvinik":2}'::jsonb from public.questions where test_id = t and position = 2;
  insert into public.options (question_id, position, text, dim_scores) select id, 2, 'Jahlim chiqadi, faol harakat qilaman', '{"xolerik":2}'::jsonb from public.questions where test_id = t and position = 2;
  insert into public.options (question_id, position, text, dim_scores) select id, 3, 'Xotirjam qabul qilaman', '{"flegmatik":2}'::jsonb from public.questions where test_id = t and position = 2;
  insert into public.options (question_id, position, text, dim_scores) select id, 4, 'Xafa bo''laman, uzoq o''ylayman', '{"melanxolik":2}'::jsonb from public.questions where test_id = t and position = 2;

  insert into public.questions (test_id, position, text) values (t, 3, 'Muhim qarorni qanday qabul qilasiz?');
  insert into public.options (question_id, position, text, dim_scores) select id, 1, 'Tez, ko''proq sezgiga tayanib', '{"sangvinik":2,"xolerik":1}'::jsonb from public.questions where test_id = t and position = 3;
  insert into public.options (question_id, position, text, dim_scores) select id, 2, 'Dadil va qat''iy', '{"xolerik":2}'::jsonb from public.questions where test_id = t and position = 3;
  insert into public.options (question_id, position, text, dim_scores) select id, 3, 'Shoshilmasdan, hamma narsani tortib', '{"flegmatik":2,"melanxolik":1}'::jsonb from public.questions where test_id = t and position = 3;
  insert into public.options (question_id, position, text, dim_scores) select id, 4, 'Uzoq o''ylab, barcha xavflarni hisobga olib', '{"melanxolik":2}'::jsonb from public.questions where test_id = t and position = 3;

  insert into public.questions (test_id, position, text) values (t, 4, 'Bo''sh vaqtingizda nima qilishni afzal ko''rasiz?');
  insert into public.options (question_id, position, text, dim_scores) select id, 1, 'Do''stlar bilan vaqt o''tkazish', '{"sangvinik":2}'::jsonb from public.questions where test_id = t and position = 4;
  insert into public.options (question_id, position, text, dim_scores) select id, 2, 'Faol sport yoki musobaqa', '{"xolerik":2}'::jsonb from public.questions where test_id = t and position = 4;
  insert into public.options (question_id, position, text, dim_scores) select id, 3, 'Uyda tinch dam olish', '{"flegmatik":2}'::jsonb from public.questions where test_id = t and position = 4;
  insert into public.options (question_id, position, text, dim_scores) select id, 4, 'Kitob o''qish, o''ylash', '{"melanxolik":2,"flegmatik":1}'::jsonb from public.questions where test_id = t and position = 4;

  insert into public.questions (test_id, position, text) values (t, 5, 'Sizni tanqid qilishsa...');
  insert into public.options (question_id, position, text, dim_scores) select id, 1, 'Tez unutaman va davom etaman', '{"sangvinik":2}'::jsonb from public.questions where test_id = t and position = 5;
  insert into public.options (question_id, position, text, dim_scores) select id, 2, 'Bahslashaman, himoyalanaman', '{"xolerik":2}'::jsonb from public.questions where test_id = t and position = 5;
  insert into public.options (question_id, position, text, dim_scores) select id, 3, 'E''tiborga olmayman', '{"flegmatik":2}'::jsonb from public.questions where test_id = t and position = 5;
  insert into public.options (question_id, position, text, dim_scores) select id, 4, 'Uzoq vaqt ichimda saqlayman', '{"melanxolik":2}'::jsonb from public.questions where test_id = t and position = 5;

  -- ---------------------------------------------------------------------------
  -- 3. Psixologik test — stress darajasi
  -- ---------------------------------------------------------------------------
  insert into public.tests (title, description, category, kind, scope, min_age, max_age, time_limit_sec, scoring)
  values (
    'Stress darajasini baholash',
    'So''nggi ikki haftadagi holatingizga tayangan holda qisqa o''z-o''zini baholash. Natija klinik tashxis emas.',
    'Stress', 'psych', 'library', 14, 80, 480,
    '{"type":"dimensions","dimensions":[
      {"key":"stress","label":"Stress darajasi","description":"Kundalik hayotdagi stress darajangiz."},
      {"key":"coping","label":"Moslashuv resurslari","description":"Stress bilan kurashish resurslaringiz."}
    ]}'::jsonb
  ) returning id into t;

  insert into public.questions (test_id, position, text) values (t, 1, 'So''nggi vaqtda o''zingizni asabiy va tarang his qildingizmi?');
  insert into public.options (question_id, position, text, dim_scores) select id, 1, 'Deyarli hech qachon', '{"stress":0,"coping":2}'::jsonb from public.questions where test_id = t and position = 1;
  insert into public.options (question_id, position, text, dim_scores) select id, 2, 'Ba''zan', '{"stress":1,"coping":1}'::jsonb from public.questions where test_id = t and position = 1;
  insert into public.options (question_id, position, text, dim_scores) select id, 3, 'Ko''pincha', '{"stress":3}'::jsonb from public.questions where test_id = t and position = 1;
  insert into public.options (question_id, position, text, dim_scores) select id, 4, 'Deyarli har doim', '{"stress":4}'::jsonb from public.questions where test_id = t and position = 1;

  insert into public.questions (test_id, position, text) values (t, 2, 'Uyqu va ishtahangizda o''zgarishlar sezdingizmi?');
  insert into public.options (question_id, position, text, dim_scores) select id, 1, 'Yo''q, hammasi joyida', '{"stress":0,"coping":2}'::jsonb from public.questions where test_id = t and position = 2;
  insert into public.options (question_id, position, text, dim_scores) select id, 2, 'Bir oz', '{"stress":1,"coping":1}'::jsonb from public.questions where test_id = t and position = 2;
  insert into public.options (question_id, position, text, dim_scores) select id, 3, 'Sezilarli', '{"stress":3}'::jsonb from public.questions where test_id = t and position = 2;
  insert into public.options (question_id, position, text, dim_scores) select id, 4, 'Jiddiy', '{"stress":4}'::jsonb from public.questions where test_id = t and position = 2;

  insert into public.questions (test_id, position, text) values (t, 3, 'Qiynalganingizda kimdir yordamiga tayanishingiz mumkinmi?');
  insert into public.options (question_id, position, text, dim_scores) select id, 1, 'Ha, har doim', '{"coping":3}'::jsonb from public.questions where test_id = t and position = 3;
  insert into public.options (question_id, position, text, dim_scores) select id, 2, 'Ba''zan', '{"coping":2}'::jsonb from public.questions where test_id = t and position = 3;
  insert into public.options (question_id, position, text, dim_scores) select id, 3, 'Kamdan-kam', '{"stress":2,"coping":1}'::jsonb from public.questions where test_id = t and position = 3;
  insert into public.options (question_id, position, text, dim_scores) select id, 4, 'Yo''q', '{"stress":3}'::jsonb from public.questions where test_id = t and position = 3;

  insert into public.questions (test_id, position, text) values (t, 4, 'Dam olish uchun vaqt ajrata olasizmi?');
  insert into public.options (question_id, position, text, dim_scores) select id, 1, 'Muntazam ravishda', '{"coping":3}'::jsonb from public.questions where test_id = t and position = 4;
  insert into public.options (question_id, position, text, dim_scores) select id, 2, 'Ba''zan', '{"coping":2}'::jsonb from public.questions where test_id = t and position = 4;
  insert into public.options (question_id, position, text, dim_scores) select id, 3, 'Kamdan-kam', '{"stress":2,"coping":1}'::jsonb from public.questions where test_id = t and position = 4;
  insert into public.options (question_id, position, text, dim_scores) select id, 4, 'Deyarli hech qachon', '{"stress":4}'::jsonb from public.questions where test_id = t and position = 4;
end $$;
