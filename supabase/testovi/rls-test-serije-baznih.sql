-- Test: serije po seriji na baznim vježbama. Na kraju se sve PONIŠTAVA (raise).
do $$
declare
  trener uuid;
  k uuid;
  v uuid;
  n int;
  ok boolean;
  rez text := '';
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;
  select id into v from public.vjezbe where vlasnik_id is null order by naziv limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.dodaj_klijenta('TEST Bazne Serije');
  insert into public.bazne_vjezbe (klijent_id, vjezba_id) values (k, v);
  update public.bazne_vjezbe
     set serije_plan = '[{"ponavljanja":"12","kg":40},{"ponavljanja":"10","kg":45},{"ponavljanja":"8","kg":50}]',
         napomena = 'sjedalo lvl3'
   where klijent_id = k and vjezba_id = v;
  select count(*) into n from public.bazne_vjezbe
   where klijent_id = k and jsonb_array_length(serije_plan) = 3 and serije_plan->2->>'kg' = '50';
  rez := rez || format(E'\n%s trener upiše serije po seriji na baznoj vježbi', case when n = 1 then 'OK' else 'GRESKA' end);

  ok := false;
  begin
    update public.bazne_vjezbe
       set serije_plan = (select jsonb_agg(jsonb_build_object('ponavljanja', '1', 'kg', 1)) from generate_series(1, 21))
     where klijent_id = k;
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s više od 20 serija se odbija', case when ok then 'OK' else 'GRESKA' end);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.bazne_vjezbe where klijent_id = k and serije_plan is not null;
  rez := rez || format(E'\n%s klijent vidi svoje bazne serije', case when n = 1 then 'OK' else 'GRESKA' end);
  update public.bazne_vjezbe set serije_plan = null where klijent_id = k;
  execute 'reset role';
  select count(*) into n from public.bazne_vjezbe where klijent_id = k and serije_plan is not null;
  rez := rez || format(E'\n%s klijent NE mijenja bazne serije', case when n = 1 then 'OK' else 'GRESKA' end);

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'bazne_vjezbe' and column_name in ('kg', 'ponavljanja');
  rez := rez || format(E'\n%s stari stupci kg/ponavljanja uklonjeni', case when n = 0 then 'OK' else 'GRESKA' end);

  raise exception 'REZULTAT:%', rez;
end $$;
