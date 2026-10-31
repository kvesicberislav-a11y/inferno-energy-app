-- =====================================================================
-- Napredak po vježbi: za svaki trening najteža serija (kg × ponavljanja) i broj serija.
-- security invoker: klijent vidi samo svoje, trener sve (RLS).
-- =====================================================================
create or replace function public.napredak_vjezbi(p_klijent uuid, p_od date, p_do date)
returns table (vjezba_id uuid, naziv text, misicna_skupina text, datum date, kg numeric, ponavljanja smallint, serija integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (s.vjezba_id, t.datum)
         s.vjezba_id, v.naziv, v.misicna_skupina, t.datum, s.kg, s.ponavljanja,
         (count(*) over (partition by s.vjezba_id, t.datum))::integer
    from public.odradjene_serije s
    join public.treninzi t on t.id = s.trening_id
    join public.vjezbe v on v.id = s.vjezba_id
   where s.klijent_id = p_klijent and t.datum between p_od and p_do
   order by s.vjezba_id, t.datum, s.kg desc, s.ponavljanja desc;
$$;

revoke execute on function public.napredak_vjezbi(uuid, date, date) from public, anon;
grant execute on function public.napredak_vjezbi(uuid, date, date) to authenticated;
