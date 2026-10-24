-- =====================================================================
-- KORAK 2: makronutrijenti – ciljevi (postavlja trener) i obroci (unosi klijent)
-- =====================================================================

-- Današnji datum po zagrebačkom vremenu
create or replace function public.danas_zagreb()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Zagreb')::date;
$$;

-- ---------------------------------------------------------------------
-- CILJEVI: dnevni cilj klijenta. Novi cilj vrijedi od datuma "vrijedi_od",
-- stari se čuvaju da grafovi mogu uspoređivati s ciljem koji je tada vrijedio.
-- ---------------------------------------------------------------------
create table public.ciljevi_makroa (
  id              uuid primary key default gen_random_uuid(),
  klijent_id      uuid not null references public.profili (id) on delete cascade,
  vrijedi_od      date not null default public.danas_zagreb(),
  kcal            integer not null check (kcal between 0 and 10000),
  proteini        numeric(6,1) not null check (proteini between 0 and 1000),
  ugljikohidrati  numeric(6,1) not null check (ugljikohidrati between 0 and 1000),
  masti           numeric(6,1) not null check (masti between 0 and 1000),
  postavio        uuid default auth.uid() references public.profili (id) on delete set null,
  kreirano        timestamptz not null default now(),
  unique (klijent_id, vrijedi_od)
);

create index ciljevi_makroa_klijent_datum on public.ciljevi_makroa (klijent_id, vrijedi_od desc);

-- ---------------------------------------------------------------------
-- OBROCI: klijent unosi naziv i grame, kalorije računa baza (4/4/9)
-- ---------------------------------------------------------------------
create table public.obroci (
  id              uuid primary key default gen_random_uuid(),
  klijent_id      uuid not null default auth.uid() references public.profili (id) on delete cascade,
  datum           date not null default public.danas_zagreb(),
  naziv           text not null check (char_length(naziv) between 1 and 60),
  proteini        numeric(6,1) not null default 0 check (proteini between 0 and 1000),
  ugljikohidrati  numeric(6,1) not null default 0 check (ugljikohidrati between 0 and 1000),
  masti           numeric(6,1) not null default 0 check (masti between 0 and 1000),
  kcal            numeric(7,1) generated always as (proteini * 4 + ugljikohidrati * 4 + masti * 9) stored,
  kreirano        timestamptz not null default now()
);

create index obroci_klijent_datum on public.obroci (klijent_id, datum);

-- ---------------------------------------------------------------------
-- ZAŠTITA PODATAKA
-- ---------------------------------------------------------------------
alter table public.ciljevi_makroa enable row level security;
alter table public.obroci         enable row level security;

-- Ciljevi: klijent vidi svoje, trener vidi i mijenja sve
create policy "ciljevi_citanje"
  on public.ciljevi_makroa for select
  to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));

create policy "ciljevi_trener_izrada"
  on public.ciljevi_makroa for insert
  to authenticated
  with check ((select public.je_trener()));

create policy "ciljevi_trener_izmjena"
  on public.ciljevi_makroa for update
  to authenticated
  using ((select public.je_trener()))
  with check ((select public.je_trener()));

create policy "ciljevi_trener_brisanje"
  on public.ciljevi_makroa for delete
  to authenticated
  using ((select public.je_trener()));

-- Obroci: klijent upravlja samo svojima, trener ih samo čita
create policy "obroci_citanje"
  on public.obroci for select
  to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));

create policy "obroci_klijent_unos"
  on public.obroci for insert
  to authenticated
  with check (klijent_id = (select auth.uid()));

create policy "obroci_klijent_izmjena"
  on public.obroci for update
  to authenticated
  using (klijent_id = (select auth.uid()))
  with check (klijent_id = (select auth.uid()));

create policy "obroci_klijent_brisanje"
  on public.obroci for delete
  to authenticated
  using (klijent_id = (select auth.uid()));
