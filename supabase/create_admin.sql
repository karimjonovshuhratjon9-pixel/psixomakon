-- =============================================================================
-- PSIXOMAKON — birinchi BOSH ADMINni yaratish
--
-- Bu SQL fayl Supabase Dashboard → Authentication → Users orqali yaratilgan
-- (yoki siz ro'yxatdan o'tkazgan) foydalanuvchiga 'admin' rolini beradi.
--
-- QADAMLAR:
--   0. schema.sql ishga tushirilgan bo'lsin.
--   1. Supabase Dashboard → Authentication → Users → "Add user" →
--      email: admin@psyxomakon.uz, password: (kuchli parol), "Auto Confirm User" ✓
--   2. Quyidagi blokda emailni o'zgartirib, SQL Editor da ishga tushiring.
-- =============================================================================

update public.profiles
set role = 'admin',
    is_blocked = false,
    full_name = coalesce(nullif(full_name, ''), 'Bosh administrator')
where id = (select id from auth.users where email = 'admin@psyxomakon.uz');

-- Tekshirish:
select p.id, u.email, p.role, p.full_name, p.is_blocked
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin';
