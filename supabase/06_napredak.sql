-- =====================================================================
-- KORAK 4: osobni podaci, mjerenja, slike napretka i statistika
-- =====================================================================

-- ---------------------------------------------------------------------
-- OSOBNI PODACI (za BMI, % masti, bazalni metabolizam)
-- Klijent ih mijenja sam, trener ih može ispraviti. Ostala polja profila
-- (uloga, e-mail…) ostaju zaključana.
-- ---------------------------------------------------------------------
alter table public.profili
  add column visina_cm numeric(4,1) check (visina_cm is null or visina_cm between 100 and 250),
  add column spol text check (spol is null or spol in ('m', 'z')),
  add column godina_rodenja smallint check (godina_rodenja is null or godina_rodenja between 1920 and 2020);

revoke update on public.profili from authenticated, anon;
grant update (visina_cm, spol, godina_rodenja) on public.profili to authenticated;

create policy "profili_osobni_podaci" on public.profili for update to authenticated
  using (id = (select auth.uid()) or (select public.je_trener()))
  with check (id = (select auth.uid()) or (select public.je_trener()));

-- ---------------------------------------------------------------------
-- MJERENJA (jedan unos po danu; sve mjere su neobavezne)
-- ---------------------------------------------------------------------
create table public.mjerenja (
  id          uuid primary key default gen_random_uuid(),
  klijent_id  uuid not null default auth.uid() references public.profili (id) on delete cascade,
  datum       date not null default public.danas_zagreb(),
  tezina_kg   numeric(5,1) check (tezina_kg is null or tezina_kg between 20 and 400),
  vrat_cm     numeric(5,1) check (vrat_cm is null or vrat_cm between 15 and 100),
  struk_cm    numeric(5,1) check (struk_cm is null or struk_cm between 30 and 250),
  bokovi_cm   numeric(5,1) check (bokovi_cm is null or bokovi_cm between 30 and 250),
  prsa_cm     numeric(5,1) check (prsa_cm is null or prsa_cm between 30 and 250),
  ruka_cm     numeric(5,1) check (ruka_cm is null or ruka_cm between 10 and 100),
  bedro_cm    numeric(5,1) check (bedro_cm is null or bedro_cm between 15 and 150),
  kreirano    timestamptz not null default now(),
  unique (klijent_id, datum),
  check (coalesce(tezina_kg, vrat_cm, struk_cm, bokovi_cm, prsa_cm, ruka_cm, bedro_cm) is not null)
);

create index mjerenja_klijent_datum on public.mjerenja (klijent_id, datum);

alter table public.mjerenja enable row level security;

create policy "mjerenja_citanje" on public.mjerenja for select to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));
create policy "mjerenja_klijent_unos" on public.mjerenja for insert to authenticated
  with check (klijent_id = (select auth.uid()));
create policy "mjerenja_klijent_izmjena" on public.mjerenja for update to authenticated
  using (klijent_id = (select auth.uid())) with check (klijent_id = (select auth.uid()));
create policy "mjerenja_klijent_brisanje" on public.mjerenja for delete to authenticated
  using (klijent_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- SLIKE NAPRETKA (privatne: vide ih samo klijent i trener)
-- Jedan set (sprijeda / bočno / straga) svaka 2 tjedna – provjerava baza.
-- ---------------------------------------------------------------------
create table public.slike_napretka (
  id          uuid primary key default gen_random_uuid(),
  klijent_id  uuid not null default auth.uid() references public.profili (id) on delete cascade,
  datum       date not null default public.danas_zagreb(),
  poza        text not null check (poza in ('sprijeda', 'bocno', 'straga')),
  putanja     text not null unique check (char_length(putanja) <= 200),
  kreirano    timestamptz not null default now(),
  unique (klijent_id, datum, poza)
);

create index slike_klijent_datum on public.slike_napretka (klijent_id, datum desc);

-- Smije li klijent danas dodati slike? (zadnji drugi set mora biti stariji od 14 dana)
create or replace function public.moze_dodati_slike(p_klijent uuid, p_datum date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.slike_napretka
    where klijent_id = p_klijent
      and datum <> p_datum
      and datum > p_datum - 14
  );
$$;

alter table public.slike_napretka enable row level security;

create policy "slike_citanje" on public.slike_napretka for select to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));
create policy "slike_klijent_unos" on public.slike_napretka for insert to authenticated
  with check (
    klijent_id = (select auth.uid())
    and datum = public.danas_zagreb()
    and split_part(putanja, '/', 1) = (select auth.uid())::text
    and public.moze_dodati_slike((select auth.uid()), datum)
  );
create policy "slike_brisanje" on public.slike_napretka for delete to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));

-- Privatno spremište; datoteka se smije učitati samo ako za nju postoji
-- dopušteni zapis u slike_napretka (tako se poštuje pravilo od 14 dana).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('napredak', 'napredak', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "napredak_citanje" on storage.objects for select to authenticated
  using (
    bucket_id = 'napredak'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.je_trener()))
  );
create policy "napredak_unos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'napredak'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.slike_napretka s
      where s.putanja = name and s.klijent_id = (select auth.uid())
    )
  );
create policy "napredak_brisanje" on storage.objects for delete to authenticated
  using (
    bucket_id = 'napredak'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.je_trener()))
  );

-- ---------------------------------------------------------------------
-- STATISTIKA (zbrojevi u bazi; zaštita vrijedi jer se izvršava kao korisnik)
-- ---------------------------------------------------------------------
create or replace function public.dnevni_makroi(p_klijent uuid, p_od date, p_do date)
returns table (datum date, kcal numeric, proteini numeric, ugljikohidrati numeric, masti numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.datum, sum(o.kcal), sum(o.proteini), sum(o.ugljikohidrati), sum(o.masti)
  from public.obroci o
  where o.klijent_id = p_klijent and o.datum between p_od and p_do
  group by o.datum
  order by o.datum;
$$;

create or replace function public.tjedni_volumen(p_klijent uuid, p_od date, p_do date)
returns table (tjedan date, volumen numeric, serija bigint, treninga bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select date_trunc('week', t.datum)::date, sum(s.kg * s.ponavljanja), count(s.id), count(distinct t.id)
  from public.treninzi t
  join public.odradjene_serije s on s.trening_id = t.id
  where t.klijent_id = p_klijent and t.datum between p_od and p_do
  group by 1
  order by 1;
$$;

revoke execute on function public.dnevni_makroi(uuid, date, date) from public, anon;
revoke execute on function public.tjedni_volumen(uuid, date, date) from public, anon;
grant execute on function public.dnevni_makroi(uuid, date, date) to authenticated;
grant execute on function public.tjedni_volumen(uuid, date, date) to authenticated;
