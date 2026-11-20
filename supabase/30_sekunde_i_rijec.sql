-- =====================================================================
-- Sekunde i riječ u serijama:
--   * serija se može mjeriti u sekundama umjesto ponavljanja (npr. plank 60 s × 5 kg)
--   * opterećenje može biti riječ umjesto kilaže (npr. zgibovi 10 × „žuta guma”)
-- U serije_plan (trening_vjezbe, bazne_vjezbe) to su neobavezni ključevi
--   "sekunde": true   i   "rijec": "žuta guma"   (tada je "kg" null).
-- Odrađene serije dobivaju stupce sekunde i rijec (ponavljanja = sekunde, kg = 0).
-- =====================================================================

alter table public.odradjene_serije
  add column if not exists sekunde boolean not null default false,
  add column if not exists rijec text check (rijec is null or char_length(rijec) between 1 and 40);

-- ---------------------------------------------------------------------
-- Bazne serije iz odrađenog: prenose se i sekunde i riječ.
create or replace function public.osvjezi_baznu_iz_treninga(p_klijent uuid, p_trening uuid, p_vjezba uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bazne_vjezbe;
  osnova jsonb;
  novo jsonb;
begin
  select * into b from public.bazne_vjezbe where klijent_id = p_klijent and vjezba_id = p_vjezba for update;
  if not found then
    return;
  end if;
  -- bazne kakve bi bile bez ovog treninga
  osnova := case when b.izvor_trening = p_trening then b.serije_prije else b.serije_plan end;

  select jsonb_agg(
           jsonb_build_object('ponavljanja', s.ponavljanja::text, 'kg', case when s.kg > 0 then s.kg end)
           || case when s.sekunde then '{"sekunde": true}'::jsonb else '{}'::jsonb end
           || case when s.rijec is not null then jsonb_build_object('rijec', s.rijec) else '{}'::jsonb end
           order by s.redni_broj)
    into novo
    from (
      select distinct on (redni_broj) redni_broj, ponavljanja, kg, sekunde, rijec
        from public.odradjene_serije
       where klijent_id = p_klijent and trening_id = p_trening and vjezba_id = p_vjezba
       order by redni_broj, kreirano desc
       limit 20
    ) s;

  if novo is not null and (osnova is null or public.najveca_kg_serija(novo) > public.najveca_kg_serija(osnova)) then
    update public.bazne_vjezbe
       set serije_plan = novo, izvor_trening = p_trening, serije_prije = osnova
     where klijent_id = p_klijent and vjezba_id = p_vjezba;
  elsif b.izvor_trening = p_trening then
    update public.bazne_vjezbe
       set serije_plan = osnova, izvor_trening = null, serije_prije = null
     where klijent_id = p_klijent and vjezba_id = p_vjezba;
  end if;
end;
$$;

revoke execute on function public.osvjezi_baznu_iz_treninga(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Najveća i zadnja kilaža: zna i je li serija bila u sekundama / s riječju.
drop function if exists public.kilaze_klijenta(uuid);
create function public.kilaze_klijenta(p_klijent uuid)
returns table (
  vjezba_id            uuid,
  max_kg               numeric,
  max_ponavljanja      smallint,
  max_serija           integer,
  max_datum            date,
  zadnja_kg            numeric,
  zadnja_ponavljanja   smallint,
  zadnji_datum         date,
  max_sekunde          boolean,
  zadnja_sekunde       boolean,
  zadnja_rijec         text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select s.vjezba_id, s.trening_id, s.kg, s.ponavljanja, s.sekunde, s.rijec, t.datum
      from public.odradjene_serije s
      join public.treninzi t on t.id = s.trening_id
     where s.klijent_id = p_klijent
  ),
  najveca as (
    select distinct on (vjezba_id) vjezba_id, trening_id, kg, ponavljanja, sekunde, datum
      from s
     where kg > 0
     order by vjezba_id, kg desc, ponavljanja desc, datum desc
  ),
  zadnja as (
    select distinct on (vjezba_id) vjezba_id, kg, ponavljanja, sekunde, rijec, datum
      from s
     order by vjezba_id, datum desc, kg desc, ponavljanja desc
  )
  select z.vjezba_id, n.kg, n.ponavljanja,
         case when n.trening_id is null then null
              else (select count(*)::integer from s x where x.trening_id = n.trening_id and x.vjezba_id = n.vjezba_id)
         end,
         n.datum, z.kg, z.ponavljanja, z.datum,
         coalesce(n.sekunde, false), z.sekunde, z.rijec
    from zadnja z
    left join najveca n on n.vjezba_id = z.vjezba_id;
$$;

revoke execute on function public.kilaze_klijenta(uuid) from public, anon;
grant execute on function public.kilaze_klijenta(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Napredak po vježbi: uz najtežu seriju i sekunde / riječ.
drop function if exists public.napredak_vjezbi(uuid, date, date);
create function public.napredak_vjezbi(p_klijent uuid, p_od date, p_do date)
returns table (
  vjezba_id uuid, naziv text, misicna_skupina text, datum date, kg numeric, ponavljanja smallint, serija integer,
  sekunde boolean, rijec text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (s.vjezba_id, t.datum)
         s.vjezba_id, v.naziv, v.misicna_skupina, t.datum, s.kg, s.ponavljanja,
         (count(*) over (partition by s.vjezba_id, t.datum))::integer,
         s.sekunde, s.rijec
    from public.odradjene_serije s
    join public.treninzi t on t.id = s.trening_id
    join public.vjezbe v on v.id = s.vjezba_id
   where s.klijent_id = p_klijent and t.datum between p_od and p_do
   order by s.vjezba_id, t.datum, s.kg desc, s.ponavljanja desc;
$$;

revoke execute on function public.napredak_vjezbi(uuid, date, date) from public, anon;
grant execute on function public.napredak_vjezbi(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Tjedni volumen (kg × ponavljanja): serije u sekundama se ne računaju.
create or replace function public.tjedni_volumen(p_klijent uuid, p_od date, p_do date)
returns table (tjedan date, volumen numeric, serija bigint, treninga bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select date_trunc('week', t.datum)::date,
         sum(case when s.sekunde then 0 else s.kg * s.ponavljanja end),
         count(s.id), count(distinct t.id)
  from public.treninzi t
  join public.odradjene_serije s on s.trening_id = t.id
  where t.klijent_id = p_klijent and t.datum between p_od and p_do
  group by 1
  order by 1;
$$;

revoke execute on function public.tjedni_volumen(uuid, date, date) from public, anon;
grant execute on function public.tjedni_volumen(uuid, date, date) to authenticated;
