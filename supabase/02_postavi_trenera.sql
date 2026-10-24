-- =====================================================================
-- Pretvara vaš račun u TRENERA.
-- Prije pokretanja: u Supabaseu napravite svoj račun
-- (Authentication -> Users -> Add user -> Create new user).
--
-- Zamijenite e-mail u navodnicima i kliknite Run.
-- =====================================================================

-- Profil za korisnike napravljene prije skripte 01 (inače ih ne bi bilo)
insert into public.profili (id, email, ime)
select id, coalesce(email, ''), coalesce(raw_user_meta_data ->> 'ime', '')
from auth.users
on conflict (id) do nothing;

update public.profili
set uloga = 'trener'
where email = 'vas@email.com';

-- Provjera: uz vaš e-mail mora pisati "trener"
select email, uloga from public.profili;
