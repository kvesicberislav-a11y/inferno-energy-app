-- =====================================================================
-- 1) Boja klijenta u kalendaru: trajni redni broj (1, 2, 3 …) po redu registracije.
--    Ne mijenja se kad netko ode u arhivu ili dođe novi klijent.
-- 2) Najbolji rezultat: broj serija je prazan (ne 0) kad nema serije s kilažom.
-- =====================================================================

alter table public.profili add column boja smallint;

-- boje dobivaju samo klijenti (treneri se ne prikazuju u kalendaru)
with redom as (
  select id, row_number() over (order by kreirano, id) as n from public.profili where uloga = 'klijent'
)
update public.profili p set boja = redom.n from redom where redom.id = p.id;
update public.profili set boja = null where uloga = 'trener';

create or replace function public.dodijeli_boju()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.boja is null then
    new.boja := coalesce((select max(boja) from public.profili where uloga = 'klijent'), 0) + 1;
  end if;
  return new;
end;
$$;

create trigger profil_boja before insert on public.profili
  for each row execute function public.dodijeli_boju();

-- -----------------------------------------------------------------------
create or replace function public.kilaze_klijenta(p_klijent uuid)
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
         case when n.trening_id is null then null
              else (select count(*)::integer from s x where x.trening_id = n.trening_id and x.vjezba_id = n.vjezba_id)
         end,
         n.datum, z.kg, z.ponavljanja, z.datum
    from zadnja z
    left join najveca n on n.vjezba_id = z.vjezba_id;
$$;
