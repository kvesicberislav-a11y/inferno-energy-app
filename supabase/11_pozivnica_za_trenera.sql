-- =====================================================================
-- POZIVNICA ZA TRENERA: novi korisnik odmah postaje trener (administrator),
-- ali samo ako se registrira točno s e-mailom zapisanim u pozivnici.
-- Obične pozivnice (bez e-maila) i dalje stvaraju klijente.
-- =====================================================================

alter table public.pozivnice
  add column if not exists trener_email text
    check (trener_email is null or (trener_email = lower(trener_email) and char_length(trener_email) <= 200));

-- Registracija (/api/registracija) nakon stvaranja računa upisuje "iskoristio".
create or replace function public.pozivnica_za_trenera()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.trener_email is not null and new.iskoristio is not null and old.iskoristio is null then
    update public.profili
       set uloga = 'trener'
     where id = new.iskoristio
       and lower(email) = new.trener_email;
  end if;
  return new;
end;
$$;

revoke execute on function public.pozivnica_za_trenera() from public, anon, authenticated;

drop trigger if exists na_iskoristenu_pozivnicu on public.pozivnice;
create trigger na_iskoristenu_pozivnicu
  after update of iskoristio on public.pozivnice
  for each row execute function public.pozivnica_za_trenera();

-- Primjer (pokreće se posebno, za svakog novog trenera):
-- insert into public.pozivnice (ime, trener_email) values ('Ime Prezime', 'njegov@email.com') returning kod;
