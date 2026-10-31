-- =====================================================================
-- PRIPREMLJENI PODACI UZ POZIVNICU
-- Klijent koji još nema račun: uz njegovu pozivnicu spremimo povijest
-- treninga, bazne vježbe i termine. Kad se registrira preko te pozivnice,
-- baza mu sve sama prebaci. Podatke upisuje samo administrator (SQL),
-- trener ih smije pročitati; brisanjem pozivnice brišu se i oni.
-- =====================================================================

create table public.pripremljeni_podaci (
  pozivnica_id  uuid primary key references public.pozivnice (id) on delete cascade,
  -- [{datum, vjezbe: [{vjezba_id, redoslijed, serije, ponavljanja, kg, odradeno: [{redni, ponavljanja, kg}]}]}]
  treninzi      jsonb not null default '[]' check (jsonb_typeof(treninzi) = 'array'),
  -- stalni termini: [{dan_u_tjednu, vrijeme, trajanje_min, od_datuma?}]
  termini       jsonb not null default '[]' check (jsonb_typeof(termini) = 'array'),
  -- jednokratni termini: [{datum, vrijeme, trajanje_min}]
  dodatni       jsonb not null default '[]' check (jsonb_typeof(dodatni) = 'array'),
  bazne         uuid[] not null default '{}',
  napomena      text not null default '' check (char_length(napomena) <= 500),
  prenesen_at   timestamptz,
  greska        text check (greska is null or char_length(greska) <= 500),
  kreirano      timestamptz not null default now()
);

alter table public.pripremljeni_podaci enable row level security;

create policy "pripremljeno_trener_citanje" on public.pripremljeni_podaci for select to authenticated
  using ((select public.je_trener()));

-- ---------------------------------------------------------------------
-- Prijenos na klijenta (poziva ga okidač pri registraciji; administrator
-- ga može pokrenuti i ručno). Vraća broj prenesenih treninga.
-- ---------------------------------------------------------------------
create or replace function public.prenesi_pripremljene_podatke(p_pozivnica uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  pp public.pripremljeni_podaci;
  k uuid;
  t jsonb;
  v jsonb;
  tid uuid;
  kad timestamptz;
  danas date := public.danas_zagreb();
  broj int := 0;
begin
  select * into pp from public.pripremljeni_podaci where pozivnica_id = p_pozivnica for update;
  if not found or pp.prenesen_at is not null then
    return 0;
  end if;

  select po.iskoristio into k
    from public.pozivnice po
    join public.profili pr on pr.id = po.iskoristio and pr.uloga = 'klijent'
   where po.id = p_pozivnica;
  if k is null then
    return 0;
  end if;

  -- povijest treninga (kao da ih je trener upisao iz rasporeda)
  for t in select * from jsonb_array_elements(pp.treninzi) loop
    kad := ((t->>'datum') || ' 19:00')::timestamp at time zone 'Europe/Zagreb';
    tid := null;
    insert into public.treninzi (klijent_id, datum, naziv, zavrsen, zavrseno_at, iz_kalendara, kreirano)
    values (k, (t->>'datum')::date, 'Trening', true, kad, true, kad)
    on conflict (klijent_id, datum) where iz_kalendara do nothing
    returning id into tid;
    continue when tid is null;
    broj := broj + 1;

    for v in select * from jsonb_array_elements(t->'vjezbe') loop
      continue when not exists (select 1 from public.vjezbe where id = (v->>'vjezba_id')::uuid);
      insert into public.trening_vjezbe (trening_id, vjezba_id, redoslijed, serije, ponavljanja, kg)
      values (tid, (v->>'vjezba_id')::uuid, (v->>'redoslijed')::int, (v->>'serije')::smallint,
              v->>'ponavljanja', (v->>'kg')::numeric)
      on conflict (trening_id, vjezba_id) do nothing;
      insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg, kreirano)
      select k, tid, (v->>'vjezba_id')::uuid, (x->>'redni')::smallint, (x->>'ponavljanja')::smallint, (x->>'kg')::numeric, kad
        from jsonb_array_elements(v->'odradeno') x
      on conflict do nothing;
    end loop;

    -- mišićne skupine treninga redom kako idu vježbe
    update public.treninzi tr
       set skupine = s.skupine, naziv = left(array_to_string(s.skupine, ' · '), 60)
      from (
        select array_agg(skupina order by prvi) as skupine
          from (select v2.misicna_skupina as skupina, min(tv.redoslijed) as prvi
                  from public.trening_vjezbe tv join public.vjezbe v2 on v2.id = tv.vjezba_id
                 where tv.trening_id = tid group by v2.misicna_skupina) g
      ) s
     where tr.id = tid and s.skupine is not null;
  end loop;

  insert into public.bazne_vjezbe (klijent_id, vjezba_id)
  select k, b from unnest(pp.bazne) b
   where exists (select 1 from public.vjezbe where id = b)
  on conflict do nothing;

  -- stalni termini vrijede od dana registracije (ili od zadanog datuma, ako je kasniji)
  insert into public.termini_pravila (klijent_id, dan_u_tjednu, vrijeme, trajanje_min, od_datuma)
  select k, (x->>'dan_u_tjednu')::smallint, (x->>'vrijeme')::time, (x->>'trajanje_min')::smallint,
         greatest(danas, coalesce((x->>'od_datuma')::date, danas))
    from jsonb_array_elements(pp.termini) x;

  -- jednokratni termini, samo oni koji još nisu prošli
  insert into public.termini_dodatni (klijent_id, datum, vrijeme, trajanje_min)
  select k, (x->>'datum')::date, (x->>'vrijeme')::time, (x->>'trajanje_min')::smallint
    from jsonb_array_elements(pp.dodatni) x
   where (x->>'datum')::date >= danas;

  update public.pripremljeni_podaci set prenesen_at = now(), greska = null where pozivnica_id = p_pozivnica;
  return broj;
end;
$$;

revoke execute on function public.prenesi_pripremljene_podatke(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Okidač: registracija (/api/registracija) upisuje "iskoristio" u pozivnicu.
-- Ako prijenos ne uspije, registracija ipak prolazi, a greška ostaje zapisana.
-- ---------------------------------------------------------------------
create or replace function public.na_registraciju_prenesi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.iskoristio is not null and old.iskoristio is null then
    begin
      perform public.prenesi_pripremljene_podatke(new.id);
    exception when others then
      update public.pripremljeni_podaci set greska = left(sqlerrm, 500) where pozivnica_id = new.id;
      raise warning 'Prijenos pripremljenih podataka nije uspio: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

revoke execute on function public.na_registraciju_prenesi() from public, anon, authenticated;

drop trigger if exists na_registraciju_prenesi on public.pozivnice;
create trigger na_registraciju_prenesi
  after update of iskoristio on public.pozivnice
  for each row execute function public.na_registraciju_prenesi();
