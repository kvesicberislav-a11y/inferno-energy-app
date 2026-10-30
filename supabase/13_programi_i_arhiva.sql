-- =====================================================================
-- PROGRAMI PO KLIJENTU (ciklusi od 1–4 tjedna, mišićne skupine po danu),
-- BAZNE VJEŽBE KLIJENTA, NAJVEĆA KILAŽA i ARHIVA KLIJENATA
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Program pripada jednom klijentu i vrti se u ciklusu od 1–4 tjedna.
--    pocetak = ponedjeljak 1. tjedna ciklusa.
-- ---------------------------------------------------------------------
alter table public.planovi
  add column klijent_id uuid references public.profili (id) on delete cascade,
  add column ciklus_tjedana smallint not null default 1 check (ciklus_tjedana between 1 and 4),
  add column pocetak date not null
    default public.danas_zagreb() - (extract(isodow from public.danas_zagreb())::int - 1)
    check (extract(isodow from pocetak) = 1);

create index planovi_klijent on public.planovi (klijent_id);

-- Dan programa: tjedan u ciklusu i mišićne skupine koje se taj dan rade (redom)
alter table public.plan_dani
  add column tjedan smallint not null default 1 check (tjedan between 1 and 4),
  add column skupine text[] not null default '{}' check (cardinality(skupine) <= 13);

alter table public.plan_dani drop constraint plan_dani_plan_id_dan_u_tjednu_key;
alter table public.plan_dani add constraint plan_dani_mjesto unique (plan_id, tjedan, dan_u_tjednu);

-- ---------------------------------------------------------------------
-- 2) Bazne vježbe klijenta (one koje preferira; od njih trener slaže program)
-- ---------------------------------------------------------------------
create table public.bazne_vjezbe (
  klijent_id  uuid not null references public.profili (id) on delete cascade,
  vjezba_id   uuid not null references public.vjezbe (id) on delete cascade,
  kreirano    timestamptz not null default now(),
  primary key (klijent_id, vjezba_id)
);

create index bazne_vjezbe_vjezba on public.bazne_vjezbe (vjezba_id);

alter table public.bazne_vjezbe enable row level security;

create policy "bazne_citanje" on public.bazne_vjezbe for select to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));
create policy "bazne_trener_unos" on public.bazne_vjezbe for insert to authenticated
  with check ((select public.je_trener()));
create policy "bazne_trener_brisanje" on public.bazne_vjezbe for delete to authenticated
  using ((select public.je_trener()));

-- ---------------------------------------------------------------------
-- 3) Najveća i zadnja kilaža klijenta po vježbi (za slaganje programa)
-- ---------------------------------------------------------------------
create or replace function public.kilaze_klijenta(p_klijent uuid)
returns table (
  vjezba_id            uuid,
  max_kg               numeric,
  max_ponavljanja      smallint,
  max_datum            date,
  zadnja_kg            numeric,
  zadnja_ponavljanja   smallint,
  zadnji_datum         date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select s.vjezba_id, s.kg, s.ponavljanja, t.datum
      from public.odradjene_serije s
      join public.treninzi t on t.id = s.trening_id
     where s.klijent_id = p_klijent
  ),
  najveca as (
    select distinct on (vjezba_id) vjezba_id, kg, ponavljanja, datum
      from s
     where kg > 0
     order by vjezba_id, kg desc, ponavljanja desc, datum desc
  ),
  zadnja as (
    select distinct on (vjezba_id) vjezba_id, kg, ponavljanja, datum
      from s
     order by vjezba_id, datum desc, kg desc, ponavljanja desc
  )
  select z.vjezba_id, n.kg, n.ponavljanja, n.datum, z.kg, z.ponavljanja, z.datum
    from zadnja z
    left join najveca n on n.vjezba_id = z.vjezba_id;
$$;

revoke execute on function public.kilaze_klijenta(uuid) from public, anon;
grant execute on function public.kilaze_klijenta(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Kopiranje: jedan tjedan ciklusa u drugi, ili cijeli program drugom klijentu
-- ---------------------------------------------------------------------
create or replace function public.kopiraj_tjedan(p_plan uuid, p_iz smallint, p_u smallint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d record;
  novi uuid;
begin
  if not public.je_trener() then
    raise exception 'Samo trener može uređivati program.';
  end if;
  if p_iz = p_u then
    return;
  end if;
  delete from public.plan_dani where plan_id = p_plan and tjedan = p_u;
  for d in select * from public.plan_dani where plan_id = p_plan and tjedan = p_iz loop
    insert into public.plan_dani (plan_id, tjedan, dan_u_tjednu, naziv, skupine)
    values (p_plan, p_u, d.dan_u_tjednu, d.naziv, d.skupine)
    returning id into novi;
    insert into public.plan_vjezbe (plan_dan_id, vjezba_id, redoslijed, serije, ponavljanja, kg, napomena)
    select novi, vjezba_id, redoslijed, serije, ponavljanja, kg, napomena
      from public.plan_vjezbe where plan_dan_id = d.id;
  end loop;
end;
$$;

revoke execute on function public.kopiraj_tjedan(uuid, smallint, smallint) from public, anon;
grant execute on function public.kopiraj_tjedan(uuid, smallint, smallint) to authenticated;

-- Novi program klijenta: prazan (p_izvor null) ili kopija drugog programa.
-- Dosadašnji program klijenta prestaje vrijediti (ostaje u povijesti).
create or replace function public.novi_program(p_klijent uuid, p_naziv text, p_izvor uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  izvor public.planovi;
  plan uuid;
  d record;
  novi uuid;
begin
  if not public.je_trener() then
    raise exception 'Samo trener može napraviti program.';
  end if;
  if not exists (select 1 from public.profili where id = p_klijent and uloga = 'klijent') then
    raise exception 'Klijent nije pronađen.';
  end if;
  if p_izvor is not null then
    select * into izvor from public.planovi where id = p_izvor;
    if not found then
      raise exception 'Program za kopiranje nije pronađen.';
    end if;
  end if;

  insert into public.planovi (naziv, klijent_id, ciklus_tjedana)
  values (left(coalesce(nullif(trim(p_naziv), ''), 'Program'), 80), p_klijent, coalesce(izvor.ciklus_tjedana, 1))
  returning id into plan;

  if p_izvor is not null then
    for d in select * from public.plan_dani where plan_id = p_izvor loop
      insert into public.plan_dani (plan_id, tjedan, dan_u_tjednu, naziv, skupine)
      values (plan, d.tjedan, d.dan_u_tjednu, d.naziv, d.skupine)
      returning id into novi;
      insert into public.plan_vjezbe (plan_dan_id, vjezba_id, redoslijed, serije, ponavljanja, kg, napomena)
      select novi, vjezba_id, redoslijed, serije, ponavljanja, kg, napomena
        from public.plan_vjezbe where plan_dan_id = d.id;
    end loop;
  end if;

  perform public.dodijeli_plan(p_klijent, plan);
  return plan;
end;
$$;

revoke execute on function public.novi_program(uuid, text, uuid) from public, anon;
grant execute on function public.novi_program(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5) ARHIVA KLIJENATA: arhivirani klijent ne može u aplikaciju (aktivan = false),
--    stalni termini mu završavaju, budući dodatni se brišu. Svi podaci ostaju.
-- ---------------------------------------------------------------------
alter table public.profili add column arhivirano timestamptz;

create or replace function public.arhiviraj_klijenta(p_klijent uuid, p_arhiviraj boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  danas date := public.danas_zagreb();
begin
  if not public.je_trener() then
    raise exception 'Samo trener može arhivirati klijenta.';
  end if;
  if not exists (select 1 from public.profili where id = p_klijent and uloga = 'klijent') then
    raise exception 'Klijent nije pronađen.';
  end if;

  if p_arhiviraj then
    update public.profili set aktivan = false, arhivirano = now() where id = p_klijent;
    -- stalni termini: oni koji još nisu počeli brišu se, ostali završavaju jučer (prošli ostaju)
    delete from public.termini_pravila where klijent_id = p_klijent and od_datuma >= danas;
    update public.termini_pravila set do_datuma = danas - 1
     where klijent_id = p_klijent and (do_datuma is null or do_datuma >= danas);
    delete from public.termini_dodatni where klijent_id = p_klijent and datum >= danas;
  else
    update public.profili set aktivan = true, arhivirano = null where id = p_klijent;
  end if;
end;
$$;

revoke execute on function public.arhiviraj_klijenta(uuid, boolean) from public, anon;
grant execute on function public.arhiviraj_klijenta(uuid, boolean) to authenticated;

-- Pregled klijenata dobiva i stanje arhive
drop function public.pregled_klijenata(uuid);

create function public.pregled_klijenata(p_klijent uuid default null)
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
  kcal_cilj         integer,
  aktivan           boolean,
  arhivirano        timestamptz
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
      order by c.vrijedi_od desc limit 1),
    p.aktivan,
    p.arhivirano
  from public.profili p
  left join lateral (
    select m.tezina_kg, m.datum from public.mjerenja m
     where m.klijent_id = p.id and m.tezina_kg is not null
     order by m.datum desc limit 1
  ) t on true
  where p.uloga = 'klijent' and (p_klijent is null or p.id = p_klijent)
  order by p.ime;
$$;

revoke execute on function public.pregled_klijenata(uuid) from public, anon;
grant execute on function public.pregled_klijenata(uuid) to authenticated;

-- Dnevna provjera broji samo aktivne klijente
create or replace function public.stanje_sustava()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'baza_bajtova', pg_database_size(current_database()),
    'datoteke_bajtova', (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o),
    'broj_datoteka', (select count(*) from storage.objects),
    'klijenata', (select count(*) from public.profili where uloga = 'klijent' and aktivan),
    'uredjaji_trenera', (
      select coalesce(json_agg(json_build_object('endpoint', u.endpoint, 'p256dh', u.p256dh, 'auth', u.auth)), '[]'::json)
        from public.push_pretplate u
        join public.profili p on p.id = u.korisnik_id
       where p.uloga = 'trener' and p.aktivan
    )
  );
$$;

revoke execute on function public.stanje_sustava() from public, anon, authenticated;
grant execute on function public.stanje_sustava() to service_role;

-- Popis razgovora zna je li klijent u arhivi (arhivirani se ne broje u grupne poruke)
drop function public.razgovori();

create function public.razgovori()
returns table (
  klijent_id         uuid,
  ime                text,
  email              text,
  nacin              text,
  zadnja_poruka      text,
  zadnja_od_trenera  boolean,
  zadnje_vrijeme     timestamptz,
  neprocitano        integer,
  aktivan            boolean
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
    p.nacin,
    z.tekst,
    z.od_trenera,
    z.kreirano,
    (select count(*)::integer from public.poruke n
      where n.klijent_id = p.id and not n.od_trenera and n.procitano is null),
    p.aktivan
  from public.profili p
  left join lateral (
    select x.tekst, x.od_trenera, x.kreirano from public.poruke x
     where x.klijent_id = p.id
     order by x.kreirano desc
     limit 1
  ) z on true
  where p.uloga = 'klijent'
  order by z.kreirano desc nulls last, p.ime;
$$;

revoke execute on function public.razgovori() from public, anon;
grant execute on function public.razgovori() to authenticated;
