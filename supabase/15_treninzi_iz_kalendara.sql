-- =====================================================================
-- TRENINZI IZ KALENDARA (klijenti uživo): trener za svaki termin (klijent + datum)
-- slaže mišićne skupine i vježbe, a na treningu sam upisuje odrađene serije.
-- Klijent te treninge samo gleda. Program po ciklusima ostaje za online klijente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Trening iz kalendara = red u treninzi bez plan_dan_id (jedan po klijentu i danu)
-- ---------------------------------------------------------------------
alter table public.treninzi
  add column skupine text[] not null default '{}' check (cardinality(skupine) <= 13);

create unique index treninzi_iz_kalendara on public.treninzi (klijent_id, datum) where plan_dan_id is null;

-- Planirane vježbe tog treninga (serije × ponavljanja × kg)
create table public.trening_vjezbe (
  id           uuid primary key default gen_random_uuid(),
  trening_id   uuid not null references public.treninzi (id) on delete cascade,
  vjezba_id    uuid not null references public.vjezbe (id) on delete restrict,
  redoslijed   integer not null default 0,
  serije       smallint not null default 3 check (serije between 1 and 20),
  ponavljanja  text not null default '10' check (char_length(ponavljanja) between 1 and 20),
  kg           numeric(6,1) check (kg is null or kg between 0 and 1000),
  napomena     text not null default '' check (char_length(napomena) <= 300),
  unique (trening_id, vjezba_id)
);

create index trening_vjezbe_vjezba on public.trening_vjezbe (vjezba_id);

alter table public.trening_vjezbe enable row level security;

create policy "trening_vjezbe_citanje" on public.trening_vjezbe for select to authenticated
  using (
    (select public.je_trener())
    or exists (select 1 from public.treninzi t where t.id = trening_id and t.klijent_id = (select auth.uid()))
  );
create policy "trening_vjezbe_trener_unos" on public.trening_vjezbe for insert to authenticated
  with check ((select public.je_trener()));
create policy "trening_vjezbe_trener_izmjena" on public.trening_vjezbe for update to authenticated
  using ((select public.je_trener())) with check ((select public.je_trener()));
create policy "trening_vjezbe_trener_brisanje" on public.trening_vjezbe for delete to authenticated
  using ((select public.je_trener()));

-- ---------------------------------------------------------------------
-- 2) Tko smije upisivati:
--    - klijent samo svoje treninge iz programa (online), ne one iz kalendara
--    - trener treninge i serije svih klijenata
-- ---------------------------------------------------------------------
drop policy "treninzi_klijent_unos" on public.treninzi;
drop policy "treninzi_klijent_izmjena" on public.treninzi;
drop policy "treninzi_klijent_brisanje" on public.treninzi;

create policy "treninzi_klijent_unos" on public.treninzi for insert to authenticated
  with check (klijent_id = (select auth.uid()) and plan_dan_id is not null and public.ima_pristup_danu(plan_dan_id));
create policy "treninzi_klijent_izmjena" on public.treninzi for update to authenticated
  using (klijent_id = (select auth.uid()) and plan_dan_id is not null)
  with check (klijent_id = (select auth.uid()) and plan_dan_id is not null and public.ima_pristup_danu(plan_dan_id));
create policy "treninzi_klijent_brisanje" on public.treninzi for delete to authenticated
  using (klijent_id = (select auth.uid()) and plan_dan_id is not null);

create policy "treninzi_trener_unos" on public.treninzi for insert to authenticated
  with check ((select public.je_trener()));
create policy "treninzi_trener_izmjena" on public.treninzi for update to authenticated
  using ((select public.je_trener())) with check ((select public.je_trener()));
create policy "treninzi_trener_brisanje" on public.treninzi for delete to authenticated
  using ((select public.je_trener()));

drop policy "serije_klijent_unos" on public.odradjene_serije;
drop policy "serije_klijent_izmjena" on public.odradjene_serije;
drop policy "serije_klijent_brisanje" on public.odradjene_serije;

create policy "serije_klijent_unos" on public.odradjene_serije for insert to authenticated
  with check (
    klijent_id = (select auth.uid())
    and exists (
      select 1 from public.treninzi t
       where t.id = trening_id and t.klijent_id = (select auth.uid()) and t.plan_dan_id is not null
    )
    and exists (select 1 from public.vjezbe v where v.id = vjezba_id)
  );
create policy "serije_klijent_izmjena" on public.odradjene_serije for update to authenticated
  using (
    klijent_id = (select auth.uid())
    and exists (select 1 from public.treninzi t where t.id = trening_id and t.plan_dan_id is not null)
  )
  with check (
    klijent_id = (select auth.uid())
    and exists (
      select 1 from public.treninzi t
       where t.id = trening_id and t.klijent_id = (select auth.uid()) and t.plan_dan_id is not null
    )
    and exists (select 1 from public.vjezbe v where v.id = vjezba_id)
  );
create policy "serije_klijent_brisanje" on public.odradjene_serije for delete to authenticated
  using (
    klijent_id = (select auth.uid())
    and exists (select 1 from public.treninzi t where t.id = trening_id and t.plan_dan_id is not null)
  );

create policy "serije_trener_unos" on public.odradjene_serije for insert to authenticated
  with check (
    (select public.je_trener())
    and exists (select 1 from public.treninzi t where t.id = trening_id and t.klijent_id = odradjene_serije.klijent_id)
  );
create policy "serije_trener_izmjena" on public.odradjene_serije for update to authenticated
  using ((select public.je_trener()))
  with check (
    (select public.je_trener())
    and exists (select 1 from public.treninzi t where t.id = trening_id and t.klijent_id = odradjene_serije.klijent_id)
  );
create policy "serije_trener_brisanje" on public.odradjene_serije for delete to authenticated
  using ((select public.je_trener()));

-- ---------------------------------------------------------------------
-- 3) Najbolji rezultat: uz najveću kilažu i broj serija na tom treningu
-- ---------------------------------------------------------------------
drop function public.kilaze_klijenta(uuid);

create function public.kilaze_klijenta(p_klijent uuid)
returns table (
  vjezba_id            uuid,
  max_kg               numeric,
  max_ponavljanja      smallint,
  max_serija           integer,
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
    select s.vjezba_id, s.trening_id, s.kg, s.ponavljanja, t.datum
      from public.odradjene_serije s
      join public.treninzi t on t.id = s.trening_id
     where s.klijent_id = p_klijent
  ),
  najveca as (
    select distinct on (vjezba_id) vjezba_id, trening_id, kg, ponavljanja, datum
      from s
     where kg > 0
     order by vjezba_id, kg desc, ponavljanja desc, datum desc
  ),
  zadnja as (
    select distinct on (vjezba_id) vjezba_id, kg, ponavljanja, datum
      from s
     order by vjezba_id, datum desc, kg desc, ponavljanja desc
  )
  select z.vjezba_id, n.kg, n.ponavljanja,
         (select count(*)::integer from s x where x.trening_id = n.trening_id and x.vjezba_id = n.vjezba_id),
         n.datum, z.kg, z.ponavljanja, z.datum
    from zadnja z
    left join najveca n on n.vjezba_id = z.vjezba_id;
$$;

revoke execute on function public.kilaze_klijenta(uuid) from public, anon;
grant execute on function public.kilaze_klijenta(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Kopiranje treninga (npr. s prošlog tjedna), pomicanje i brisanje s terminom
-- ---------------------------------------------------------------------
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
  select * into izvor from public.treninzi where klijent_id = p_klijent and datum = p_iz and plan_dan_id is null;
  if not found or not exists (select 1 from public.trening_vjezbe where trening_id = izvor.id) then
    return 0;
  end if;

  select id into cilj from public.treninzi where klijent_id = p_klijent and datum = p_u and plan_dan_id is null;
  if cilj is not null then
    if exists (select 1 from public.trening_vjezbe where trening_id = cilj) then
      if not p_zamijeni then
        return 0;
      end if;
      delete from public.trening_vjezbe where trening_id = cilj;
    end if;
    update public.treninzi set skupine = izvor.skupine, naziv = izvor.naziv where id = cilj;
  else
    insert into public.treninzi (klijent_id, datum, naziv, skupine)
    values (p_klijent, p_u, izvor.naziv, izvor.skupine)
    returning id into cilj;
  end if;

  insert into public.trening_vjezbe (trening_id, vjezba_id, redoslijed, serije, ponavljanja, kg, napomena)
  select cilj, vjezba_id, redoslijed, serije, ponavljanja, kg, napomena
    from public.trening_vjezbe where trening_id = izvor.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.kopiraj_trening(uuid, date, date, boolean) from public, anon;
grant execute on function public.kopiraj_trening(uuid, date, date, boolean) to authenticated;

-- Termin pomaknut na drugi dan: trening ide s njim (ako taj dan već nema trening)
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
  if exists (select 1 from public.treninzi where klijent_id = p_klijent and datum = p_u and plan_dan_id is null) then
    return false;
  end if;
  update public.treninzi set datum = p_u where klijent_id = p_klijent and datum = p_iz and plan_dan_id is null;
  return found;
end;
$$;

revoke execute on function public.premjesti_trening(uuid, date, date) from public, anon;
grant execute on function public.premjesti_trening(uuid, date, date) to authenticated;

-- Obrisan termin: briše se i njegov trening, ako na njemu još ništa nije upisano
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
   where t.klijent_id = p_klijent and t.datum = p_datum and t.plan_dan_id is null
     and not exists (select 1 from public.odradjene_serije s where s.trening_id = t.id);
end;
$$;

revoke execute on function public.ukloni_trening_termina(uuid, date) from public, anon;
grant execute on function public.ukloni_trening_termina(uuid, date) to authenticated;
