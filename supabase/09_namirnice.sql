-- =====================================================================
-- NAMIRNICE: proizvodi pronađeni skeniranjem barkoda (iz Open Food Facts)
-- ili ručno upisani s deklaracije. Zajednička baza – raste sa svakim skeniranjem.
-- Vrijednosti su na 100 g proizvoda.
-- =====================================================================
create table public.namirnice (
  id                 uuid primary key default gen_random_uuid(),
  barkod             text unique check (barkod is null or barkod ~ '^[0-9]{6,14}$'),
  naziv              text not null check (char_length(naziv) between 1 and 120),
  marka              text not null default '' check (char_length(marka) <= 80),
  proteini_100       numeric(6,1) not null check (proteini_100 between 0 and 100),
  ugljikohidrati_100 numeric(6,1) not null check (ugljikohidrati_100 between 0 and 100),
  masti_100          numeric(6,1) not null check (masti_100 between 0 and 100),
  porcija_g          numeric(6,1) check (porcija_g is null or porcija_g between 1 and 2000),
  izvor              text not null default 'korisnik' check (izvor in ('off', 'korisnik')),
  dodao              uuid default auth.uid() references public.profili (id) on delete set null,
  kreirano           timestamptz not null default now(),
  azurirano          timestamptz not null default now()
);

create index namirnice_naziv on public.namirnice (lower(naziv));

alter table public.namirnice enable row level security;

-- Svi prijavljeni vide i dodaju proizvode; mijenja ih onaj tko je dodao ili trener
create policy "namirnice_citanje" on public.namirnice for select to authenticated using (true);
create policy "namirnice_unos" on public.namirnice for insert to authenticated
  with check (dodao = (select auth.uid()));
create policy "namirnice_izmjena" on public.namirnice for update to authenticated
  using (dodao = (select auth.uid()) or (select public.je_trener()))
  with check (dodao = (select auth.uid()) or (select public.je_trener()));
create policy "namirnice_brisanje" on public.namirnice for delete to authenticated
  using ((select public.je_trener()));
