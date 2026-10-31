-- =====================================================================
-- NIJE DOŠAO: trener označi da klijent nije došao na trening iz kalendara.
-- Termin ostaje u kalendaru, plan ostaje spremljen, a u statistiku ide samo
-- ono što je upisano u „Trening (upis)”. Označava samo trener (klijent ne
-- smije mijenjati treninge iz kalendara – vidi 16_oznaka_iz_kalendara.sql).
-- =====================================================================

alter table public.treninzi add column if not exists nije_dosao boolean not null default false;
alter table public.treninzi drop constraint if exists treninzi_nije_dosao_check;
alter table public.treninzi
  add constraint treninzi_nije_dosao_check check (not nije_dosao or (iz_kalendara and not zavrsen));

-- Premješten trening (termin pomaknut na drugi dan) više nije izostanak.
create or replace function public.premjesti_trening(p_klijent uuid, p_iz date, p_u date)
returns boolean
language plpgsql
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
  update public.treninzi set datum = p_u, nije_dosao = false
   where klijent_id = p_klijent and datum = p_iz and iz_kalendara;
  return true;
end;
$$;
