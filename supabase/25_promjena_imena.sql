-- =====================================================================
-- PROMJENA IMENA KLIJENTA: trener ispravi ime ili doda prezime.
-- Ime se mijenja na profilu (pa se vidi svugdje), a ako klijent još nema
-- račun, i na njegovoj otvorenoj pozivnici – da obrazac za registraciju
-- ponudi novo ime. Klijent sam ne mijenja ime (vidi 06_napredak.sql).
-- =====================================================================

create or replace function public.promijeni_ime_klijenta(p_klijent uuid, p_ime text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  novo text := regexp_replace(btrim(coalesce(p_ime, '')), '\s+', ' ', 'g');
begin
  if not public.je_trener() then
    raise exception 'Samo trener može promijeniti ime klijenta.';
  end if;
  if char_length(novo) < 2 or char_length(novo) > 100 then
    raise exception 'Upiši ime i prezime (2 do 100 znakova).';
  end if;
  update public.profili set ime = novo where id = p_klijent and uloga = 'klijent';
  if not found then
    raise exception 'Klijent nije pronađen.';
  end if;
  update public.pozivnice set ime = novo where profil_id = p_klijent and iskoristena_at is null;
  return novo;
end;
$$;

revoke execute on function public.promijeni_ime_klijenta(uuid, text) from public, anon;
grant execute on function public.promijeni_ime_klijenta(uuid, text) to authenticated;
