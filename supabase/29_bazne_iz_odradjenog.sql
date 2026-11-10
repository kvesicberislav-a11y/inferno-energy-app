-- =====================================================================
-- Bazne serije se same osvježavaju iz odrađenog:
-- kad trener na treningu upiše (potvrdi ✓) serije s VEĆOM kilažom nego što
-- piše u baznim serijama te vježbe, bazne postaju serije s tog treninga.
-- Lakši trening ih ne dira. Ako se serije s tog treninga poprave ili ponište,
-- bazne se izračunaju iznova, a ako više nisu veće – vraćaju se prijašnje.
--   izvor_trening = trening iz kojeg su trenutne bazne serije (null = upisao trener)
--   serije_prije  = bazne serije prije tog treninga (za vraćanje)
-- =====================================================================

alter table public.bazne_vjezbe
  add column if not exists izvor_trening uuid,
  add column if not exists serije_prije jsonb
  check (
    serije_prije is null
    or (jsonb_typeof(serije_prije) = 'array' and jsonb_array_length(serije_prije) between 1 and 20)
  );

-- najveća kilaža u popisu serija ([{"ponavljanja": "10", "kg": 40}, …]); bez kilaže = 0
create or replace function public.najveca_kg_serija(p jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(max(nullif(e->>'kg', '')::numeric), 0)
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) e;
$$;

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

  select jsonb_agg(jsonb_build_object('ponavljanja', s.ponavljanja::text, 'kg', case when s.kg > 0 then s.kg end) order by s.redni_broj)
    into novo
    from (
      select distinct on (redni_broj) redni_broj, ponavljanja, kg
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

create or replace function public.serije_osvjezi_baznu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.osvjezi_baznu_iz_treninga(old.klijent_id, old.trening_id, old.vjezba_id);
  elsif tg_op = 'INSERT' then
    perform public.osvjezi_baznu_iz_treninga(new.klijent_id, new.trening_id, new.vjezba_id);
  else
    if (old.klijent_id, old.trening_id, old.vjezba_id) is distinct from (new.klijent_id, new.trening_id, new.vjezba_id) then
      perform public.osvjezi_baznu_iz_treninga(old.klijent_id, old.trening_id, old.vjezba_id);
    end if;
    perform public.osvjezi_baznu_iz_treninga(new.klijent_id, new.trening_id, new.vjezba_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.serije_osvjezi_baznu() from public, anon, authenticated;

drop trigger if exists odradjene_serije_bazne on public.odradjene_serije;
create trigger odradjene_serije_bazne
  after insert or update or delete on public.odradjene_serije
  for each row execute function public.serije_osvjezi_baznu();
