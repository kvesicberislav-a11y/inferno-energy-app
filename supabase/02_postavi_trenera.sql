-- =====================================================================
-- Pretvara vaš račun u TRENERA.
-- Prije pokretanja: u Supabaseu napravite svoj račun
-- (Authentication -> Users -> Add user -> Create new user).
--
-- Zamijenite dvije vrijednosti u navodnicima i kliknite Run:
--   'vas@email.com'  -> e-mail s kojim ste napravili račun
--   'Vaše Ime'       -> ime koje će pisati u aplikaciji
-- =====================================================================

update public.profili
set uloga = 'trener',
    ime   = 'Vaše Ime'
where email = 'vas@email.com';

-- Provjera: mora se pojaviti jedan red s ulogom "trener"
select email, ime, uloga from public.profili where uloga = 'trener';
