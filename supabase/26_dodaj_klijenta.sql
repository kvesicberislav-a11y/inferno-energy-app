-- =====================================================================
-- DODAJ KLIJENTA: trener doda klijenta odmah (bez računa), pa mu može
-- odmah slagati termine i treninge. Pozivnicu šalje kasnije s kartice
-- klijenta – tada nastaje link (vezan uz ovaj profil, vidi 22_...).
-- =====================================================================

create or replace function public.dodaj_klijenta(p_ime text, p_nacin text default 'uzivo')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ime text := regexp_replace(btrim(coalesce(p_ime, '')), '\s+', ' ', 'g');
  novi uuid := gen_random_uuid();
begin
  if not public.je_trener() then
    raise exception 'Samo trener može dodati klijenta.';
  end if;
  if char_length(ime) < 2 or char_length(ime) > 100 then
    raise exception 'Upiši ime i prezime (2 do 100 znakova).';
  end if;
  if p_nacin not in ('uzivo', 'online') then
    raise exception 'Neispravan način rada.';
  end if;
  insert into public.profili (id, ime, uloga, nacin, registriran)
  values (novi, ime, 'klijent', p_nacin, false);
  return novi;
end;
$$;

revoke execute on function public.dodaj_klijenta(text, text) from public, anon;
grant execute on function public.dodaj_klijenta(text, text) to authenticated;
