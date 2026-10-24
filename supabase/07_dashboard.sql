-- =====================================================================
-- KORAK 5: trenerski pregled – bilješke trenera i sažetak svih klijenata
-- =====================================================================

-- ---------------------------------------------------------------------
-- BILJEŠKE TRENERA (vidi ih samo trener, klijent nikad)
-- ---------------------------------------------------------------------
create table public.biljeske_trenera (
  id          uuid primary key default gen_random_uuid(),
  klijent_id  uuid not null references public.profili (id) on delete cascade,
  tekst       text not null check (char_length(tekst) between 1 and 5000),
  autor       uuid default auth.uid() references public.profili (id) on delete set null,
  kreirano    timestamptz not null default now(),
  azurirano   timestamptz not null default now()
);

create index biljeske_klijent on public.biljeske_trenera (klijent_id, kreirano desc);

alter table public.biljeske_trenera enable row level security;

create policy "biljeske_trener_citanje" on public.biljeske_trenera for select to authenticated
  using ((select public.je_trener()));
create policy "biljeske_trener_unos" on public.biljeske_trenera for insert to authenticated
  with check ((select public.je_trener()));
create policy "biljeske_trener_izmjena" on public.biljeske_trenera for update to authenticated
  using ((select public.je_trener())) with check ((select public.je_trener()));
create policy "biljeske_trener_brisanje" on public.biljeske_trenera for delete to authenticated
  using ((select public.je_trener()));

-- ---------------------------------------------------------------------
-- PREGLED KLIJENATA: jedan red po klijentu sa zadnjom aktivnošću i ključnim brojkama.
-- Izvršava se kao korisnik (security invoker), pa zaštita podataka vrijedi:
-- trener vidi sve klijente, klijent samo sebe.
-- ---------------------------------------------------------------------
create or replace function public.pregled_klijenata()
returns table (
  id                uuid,
  ime               text,
  email             text,
  kreirano          timestamptz,
  zadnja_aktivnost  timestamptz,
  zadnji_obrok      date,
  zadnji_trening    date,
  zadnja_tezina     numeric,
  datum_tezine      date,
  plan              text,
  kcal_danas        numeric,
  kcal_cilj         integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.ime,
    p.email,
    p.kreirano,
    greatest(
      (select max(o.kreirano) from public.obroci o where o.klijent_id = p.id),
      (select max(m.kreirano) from public.mjerenja m where m.klijent_id = p.id),
      (select max(s.kreirano) from public.odradjene_serije s where s.klijent_id = p.id),
      (select max(t.kreirano) from public.treninzi t where t.klijent_id = p.id),
      (select max(sl.kreirano) from public.slike_napretka sl where sl.klijent_id = p.id)
    ),
    (select max(o.datum) from public.obroci o where o.klijent_id = p.id),
    (select max(t.datum) from public.treninzi t where t.klijent_id = p.id),
    t.tezina_kg,
    t.datum,
    (select pl.naziv
       from public.dodjele_planova d
       join public.planovi pl on pl.id = d.plan_id
      where d.klijent_id = p.id and d.do_datuma is null
      limit 1),
    (select sum(o.kcal) from public.obroci o
      where o.klijent_id = p.id and o.datum = public.danas_zagreb()),
    (select c.kcal from public.ciljevi_makroa c
      where c.klijent_id = p.id and c.vrijedi_od <= public.danas_zagreb()
      order by c.vrijedi_od desc limit 1)
  from public.profili p
  left join lateral (
    select m.tezina_kg, m.datum from public.mjerenja m
     where m.klijent_id = p.id and m.tezina_kg is not null
     order by m.datum desc limit 1
  ) t on true
  where p.uloga = 'klijent'
  order by p.ime;
$$;

revoke execute on function public.pregled_klijenata() from public, anon;
grant execute on function public.pregled_klijenata() to authenticated;

-- Brže traženje zadnje aktivnosti
create index if not exists obroci_klijent_kreirano on public.obroci (klijent_id, kreirano desc);
create index if not exists treninzi_klijent_kreirano on public.treninzi (klijent_id, kreirano desc);
