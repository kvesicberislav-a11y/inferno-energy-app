-- =====================================================================
-- Bazne vježbe: umjesto jedne polazne kilaže × ponavljanja trener upisuje
-- svaku seriju posebno (kao u treningu iz kalendara): koliko serija i za
-- svaku ponavljanja × kg. To se nudi kad slaže trening.
-- Oblik: [{"ponavljanja": "12", "kg": 40}, {"ponavljanja": "10", "kg": 45}, …]
-- (stupci kg i ponavljanja iz 27_… ostaju prazni od početka pa se brišu)
-- =====================================================================

alter table public.bazne_vjezbe
  add column if not exists serije_plan jsonb
  check (
    serije_plan is null
    or (jsonb_typeof(serije_plan) = 'array' and jsonb_array_length(serije_plan) between 1 and 20)
  );

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'bazne_vjezbe' and column_name = 'kg'
  ) then
    -- ako je ipak nešto upisano, prebaci kao jednu seriju
    execute $u$
      update public.bazne_vjezbe
         set serije_plan = jsonb_build_array(jsonb_build_object('ponavljanja', coalesce(ponavljanja::text, '10'), 'kg', kg))
       where serije_plan is null and (kg is not null or ponavljanja is not null)
    $u$;
  end if;
end $$;

alter table public.bazne_vjezbe
  drop column if exists kg,
  drop column if exists ponavljanja;
