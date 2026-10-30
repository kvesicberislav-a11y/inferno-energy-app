-- =====================================================================
-- Trening iz kalendara dobiva vlastitu oznaku (iz_kalendara) umjesto
-- „plan_dan_id je prazan” – brisanje dana iz programa (online) postavi
-- plan_dan_id na null, pa se stari treninzi ne smiju pomiješati s kalendarom.
-- Također: trenerovo planiranje se ne broji kao klijentova aktivnost.
-- =====================================================================

alter table public.treninzi add column iz_kalendara boolean not null default false;

drop index public.treninzi_iz_kalendara;
create unique index treninzi_iz_kalendara on public.treninzi (klijent_id, datum) where iz_kalendara;

-- Klijent: samo svoji treninzi iz programa (ne oni iz kalendara)
drop policy "treninzi_klijent_unos" on public.treninzi;
drop policy "treninzi_klijent_izmjena" on public.treninzi;
drop policy "treninzi_klijent_brisanje" on public.treninzi;

create policy "treninzi_klijent_unos" on public.treninzi for insert to authenticated
  with check (
    klijent_id = (select auth.uid()) and not iz_kalendara
    and plan_dan_id is not null and public.ima_pristup_danu(plan_dan_id)
  );
create policy "treninzi_klijent_izmjena" on public.treninzi for update to authenticated
  using (klijent_id = (select auth.uid()) and not iz_kalendara)
  with check (
    klijent_id = (select auth.uid()) and not iz_kalendara
    and (plan_dan_id is null or public.ima_pristup_danu(plan_dan_id))
  );
create policy "treninzi_klijent_brisanje" on public.treninzi for delete to authenticated
  using (klijent_id = (select auth.uid()) and not iz_kalendara);

drop policy "serije_klijent_unos" on public.odradjene_serije;
drop policy "serije_klijent_izmjena" on public.odradjene_serije;
drop policy "serije_klijent_brisanje" on public.odradjene_serije;

create policy "serije_klijent_unos" on public.odradjene_serije for insert to authenticated
  with check (
    klijent_id = (select auth.uid())
    and exists (
      select 1 from public.treninzi t
       where t.id = trening_id and t.klijent_id = (select auth.uid()) and not t.iz_kalendara
    )
    and exists (select 1 from public.vjezbe v where v.id = vjezba_id)
  );
create policy "serije_klijent_izmjena" on public.odradjene_serije for update to authenticated
  using (
    klijent_id = (select auth.uid())
    and exists (select 1 from public.treninzi t where t.id = trening_id and not t.iz_kalendara)
  )
  with check (
    klijent_id = (select auth.uid())
    and exists (
      select 1 from public.treninzi t
       where t.id = trening_id and t.klijent_id = (select auth.uid()) and not t.iz_kalendara
    )
    and exists (select 1 from public.vjezbe v where v.id = vjezba_id)
  );
create policy "serije_klijent_brisanje" on public.odradjene_serije for delete to authenticated
  using (
    klijent_id = (select auth.uid())
    and exists (select 1 from public.treninzi t where t.id = trening_id and not t.iz_kalendara)
  );

-- Kopiranje, pomicanje i brisanje rade samo s treninzima iz kalendara
create or replace function public.kopiraj_trening(p_klijent uuid, p_iz date, p_u date, p_zamijeni boolean default false)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  izvor public.treninzi;
  cilj uuid;
  n integer;
begin
  if not public.je_trener() then
    raise exception 'Samo trener može kopirati trening.';
  end if;
  select * into izvor from public.treninzi where klijent_id = p_klijent and datum = p_iz and iz_kalendara;
  if not found or not exists (select 1 from public.trening_vjezbe where trening_id = izvor.id) then
    return 0;
  end if;

  select id into cilj from public.treninzi where klijent_id = p_klijent and datum = p_u and iz_kalendara;
  if cilj is not null then
    if exists (select 1 from public.trening_vjezbe where trening_id = cilj) then
      if not p_zamijeni then
        return 0;
      end if;
      delete from public.trening_vjezbe where trening_id = cilj;
    end if;
    update public.treninzi set skupine = izvor.skupine, naziv = izvor.naziv where id = cilj;
  else
    insert into public.treninzi (klijent_id, datum, naziv, skupine, iz_kalendara)
    values (p_klijent, p_u, izvor.naziv, izvor.skupine, true)
    returning id into cilj;
  end if;

  insert into public.trening_vjezbe (trening_id, vjezba_id, redoslijed, serije, ponavljanja, kg, napomena)
  select cilj, vjezba_id, redoslijed, serije, ponavljanja, kg, napomena
    from public.trening_vjezbe where trening_id = izvor.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.premjesti_trening(p_klijent uuid, p_iz date, p_u date)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.je_trener() then
    raise exception 'Samo trener može premjestiti trening.';
  end if;
  if p_iz = p_u then
    return true;
  end if;
  if not exists (select 1 from public.treninzi where klijent_id = p_klijent and datum = p_iz and iz_kalendara) then
    return true; -- nema plana koji bi se micao
  end if;
  if exists (select 1 from public.treninzi where klijent_id = p_klijent and datum = p_u and iz_kalendara) then
    return false;
  end if;
  update public.treninzi set datum = p_u where klijent_id = p_klijent and datum = p_iz and iz_kalendara;
  return true;
end;
$$;

create or replace function public.ukloni_trening_termina(p_klijent uuid, p_datum date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.je_trener() then
    raise exception 'Samo trener može obrisati trening.';
  end if;
  delete from public.treninzi t
   where t.klijent_id = p_klijent and t.datum = p_datum and t.iz_kalendara
     and not exists (select 1 from public.odradjene_serije s where s.trening_id = t.id);
end;
$$;

-- Pregled klijenata: trenerovo planiranje nije klijentova aktivnost; zadnji trening = stvarno odrađen
create or replace function public.pregled_klijenata(p_klijent uuid default null)
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
      (select max(t.kreirano) from public.treninzi t where t.klijent_id = p.id and not t.iz_kalendara),
      (select max(sl.kreirano) from public.slike_napretka sl where sl.klijent_id = p.id)
    ),
    (select max(o.datum) from public.obroci o where o.klijent_id = p.id),
    (select max(t.datum) from public.treninzi t
      where t.klijent_id = p.id and t.datum <= public.danas_zagreb()
        and (t.zavrsen or exists (select 1 from public.odradjene_serije s where s.trening_id = t.id))),
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
