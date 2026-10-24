-- =====================================================================
-- RASPORED: klijenti online / uživo, stalni tjedni termini s trenerom,
-- iznimke (otkazan ili pomaknut termin) i dodatni jednokratni termini
-- =====================================================================

-- ---------------------------------------------------------------------
-- Način rada s klijentom: uživo ili online (mijenja samo trener)
-- ---------------------------------------------------------------------
alter table public.profili
  add column nacin text not null default 'uzivo' check (nacin in ('uzivo', 'online'));

create or replace function public.postavi_nacin(p_klijent uuid, p_nacin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.je_trener() then
    raise exception 'Samo trener može promijeniti način rada.';
  end if;
  if p_nacin not in ('uzivo', 'online') then
    raise exception 'Neispravan način rada.';
  end if;
  update public.profili set nacin = p_nacin where id = p_klijent and uloga = 'klijent';
end;
$$;

revoke execute on function public.postavi_nacin(uuid, text) from public, anon;
grant execute on function public.postavi_nacin(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- STALNI TERMINI: "svaki ponedjeljak u 18:00, 60 min" (vrijeme po Zagrebu)
-- ---------------------------------------------------------------------
create table public.termini_pravila (
  id            uuid primary key default gen_random_uuid(),
  klijent_id    uuid not null references public.profili (id) on delete cascade,
  dan_u_tjednu  smallint not null check (dan_u_tjednu between 1 and 7), -- 1 = ponedjeljak
  vrijeme       time not null,
  trajanje_min  smallint not null default 60 check (trajanje_min between 15 and 240),
  od_datuma     date not null default public.danas_zagreb(),
  napomena      text not null default '' check (char_length(napomena) <= 200),
  kreirano      timestamptz not null default now()
);

create index termini_pravila_klijent on public.termini_pravila (klijent_id);

-- ---------------------------------------------------------------------
-- IZNIMKE: jedan termin otkazan ili pomaknut na drugi dan/sat
-- ---------------------------------------------------------------------
create table public.termini_iznimke (
  id            uuid primary key default gen_random_uuid(),
  pravilo_id    uuid not null references public.termini_pravila (id) on delete cascade,
  datum         date not null,               -- izvorni datum termina
  otkazan       boolean not null default false,
  novi_datum    date,
  novo_vrijeme  time,
  kreirano      timestamptz not null default now(),
  unique (pravilo_id, datum),
  check (otkazan or (novi_datum is not null and novo_vrijeme is not null))
);

-- ---------------------------------------------------------------------
-- DODATNI (jednokratni) TERMINI
-- ---------------------------------------------------------------------
create table public.termini_dodatni (
  id            uuid primary key default gen_random_uuid(),
  klijent_id    uuid not null references public.profili (id) on delete cascade,
  datum         date not null,
  vrijeme       time not null,
  trajanje_min  smallint not null default 60 check (trajanje_min between 15 and 240),
  napomena      text not null default '' check (char_length(napomena) <= 200),
  kreirano      timestamptz not null default now()
);

create index termini_dodatni_datum on public.termini_dodatni (datum);
create index termini_dodatni_klijent on public.termini_dodatni (klijent_id, datum);

-- ---------------------------------------------------------------------
-- ZAŠTITA: klijent vidi samo svoje termine, mijenja ih samo trener
-- ---------------------------------------------------------------------
alter table public.termini_pravila enable row level security;
alter table public.termini_iznimke enable row level security;
alter table public.termini_dodatni enable row level security;

create policy "pravila_citanje" on public.termini_pravila for select to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));
create policy "pravila_trener_unos" on public.termini_pravila for insert to authenticated
  with check ((select public.je_trener()));
create policy "pravila_trener_izmjena" on public.termini_pravila for update to authenticated
  using ((select public.je_trener())) with check ((select public.je_trener()));
create policy "pravila_trener_brisanje" on public.termini_pravila for delete to authenticated
  using ((select public.je_trener()));

create policy "iznimke_citanje" on public.termini_iznimke for select to authenticated
  using (
    (select public.je_trener())
    or exists (select 1 from public.termini_pravila p where p.id = pravilo_id and p.klijent_id = (select auth.uid()))
  );
create policy "iznimke_trener_unos" on public.termini_iznimke for insert to authenticated
  with check ((select public.je_trener()));
create policy "iznimke_trener_izmjena" on public.termini_iznimke for update to authenticated
  using ((select public.je_trener())) with check ((select public.je_trener()));
create policy "iznimke_trener_brisanje" on public.termini_iznimke for delete to authenticated
  using ((select public.je_trener()));

create policy "dodatni_citanje" on public.termini_dodatni for select to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));
create policy "dodatni_trener_unos" on public.termini_dodatni for insert to authenticated
  with check ((select public.je_trener()));
create policy "dodatni_trener_izmjena" on public.termini_dodatni for update to authenticated
  using ((select public.je_trener())) with check ((select public.je_trener()));
create policy "dodatni_trener_brisanje" on public.termini_dodatni for delete to authenticated
  using ((select public.je_trener()));

-- ---------------------------------------------------------------------
-- PREGLED KLIJENATA dobiva i način rada (online / uživo)
-- ---------------------------------------------------------------------
drop function public.pregled_klijenata();

create function public.pregled_klijenata()
returns table (
  id                uuid,
  ime               text,
  email             text,
  kreirano          timestamptz,
  nacin             text,
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
    p.nacin,
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
