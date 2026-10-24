-- =====================================================================
-- KORAK 1: profili, uloge (trener / klijent) i pozivnice
-- Pokreće se JEDNOM u Supabase -> SQL Editor -> Run.
-- =====================================================================

-- Uloge korisnika
create type public.uloga as enum ('trener', 'klijent');

-- ---------------------------------------------------------------------
-- PROFILI: jedan red za svakog korisnika (nastaje automatski)
-- ---------------------------------------------------------------------
create table public.profili (
  id        uuid primary key references auth.users (id) on delete cascade,
  email     text not null default '',
  ime       text not null default '',
  uloga     public.uloga not null default 'klijent',
  aktivan   boolean not null default true,
  kreirano  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- POZIVNICE: trener napravi pozivnicu, klijent se registrira preko linka
-- ---------------------------------------------------------------------
create table public.pozivnice (
  id              uuid primary key default gen_random_uuid(),
  kod             uuid not null unique default gen_random_uuid(),
  ime             text not null check (char_length(ime) between 1 and 100),
  kreirao         uuid default auth.uid() references public.profili (id) on delete set null,
  kreirano        timestamptz not null default now(),
  vrijedi_do      timestamptz not null default now() + interval '14 days',
  iskoristena_at  timestamptz,
  iskoristio      uuid references public.profili (id) on delete set null
);

-- ---------------------------------------------------------------------
-- Pomoćna funkcija: je li prijavljeni korisnik trener?
-- ---------------------------------------------------------------------
create or replace function public.je_trener()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profili
    where id = auth.uid() and uloga = 'trener' and aktivan
  );
$$;

-- ---------------------------------------------------------------------
-- Automatski napravi profil kad nastane novi korisnik (uvijek kao klijent)
-- ---------------------------------------------------------------------
create or replace function public.novi_korisnik()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profili (id, email, ime)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'ime', '')
  );
  return new;
end;
$$;

revoke execute on function public.novi_korisnik() from public, anon, authenticated;

create trigger na_novog_korisnika
  after insert on auth.users
  for each row execute function public.novi_korisnik();

-- ---------------------------------------------------------------------
-- Provjera pozivnice prije registracije (vraća ime ili ništa)
-- ---------------------------------------------------------------------
create or replace function public.provjeri_pozivnicu(p_kod uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ime from public.pozivnice
  where kod = p_kod
    and iskoristena_at is null
    and vrijedi_do > now();
$$;

revoke execute on function public.provjeri_pozivnicu(uuid) from public;
grant execute on function public.provjeri_pozivnicu(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- ZAŠTITA PODATAKA (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.profili   enable row level security;
alter table public.pozivnice enable row level security;

-- Profil: svatko vidi svoj, trener vidi sve
create policy "profili_citanje"
  on public.profili for select
  to authenticated
  using (id = (select auth.uid()) or (select public.je_trener()));

-- Pozivnice: samo trener (čitanje, izrada, brisanje)
create policy "pozivnice_trener_citanje"
  on public.pozivnice for select
  to authenticated
  using ((select public.je_trener()));

create policy "pozivnice_trener_izrada"
  on public.pozivnice for insert
  to authenticated
  with check ((select public.je_trener()));

create policy "pozivnice_trener_brisanje"
  on public.pozivnice for delete
  to authenticated
  using ((select public.je_trener()));
