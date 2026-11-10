-- Test: serije po seriji u treningu, polazna kilaža i stalna napomena na baznim vježbama.
-- Na kraju se sve PONIŠTAVA (raise).
do $$
declare
  trener uuid;
  k uuid;
  k2 uuid;
  v uuid;
  t uuid;
  n int;
  ok boolean;
  tekst text;
  rez text := '';
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;
  select id into v from public.vjezbe where vlasnik_id is null order by naziv limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.dodaj_klijenta('TEST Serije Klijent');
  k2 := public.dodaj_klijenta('TEST Drugi Klijent');

  -- trener: bazna vježba s kilažom, ponavljanjima i napomenom (upsert kao u aplikaciji)
  insert into public.bazne_vjezbe (klijent_id, vjezba_id) values (k, v);
  insert into public.bazne_vjezbe (klijent_id, vjezba_id, napomena) values (k, v, 'sjedalo lvl3')
    on conflict (klijent_id, vjezba_id) do update set napomena = excluded.napomena;
  update public.bazne_vjezbe set serije_plan = '[{"ponavljanja":"10","kg":60}]' where klijent_id = k and vjezba_id = v;
  select count(*) into n from public.bazne_vjezbe
   where klijent_id = k and vjezba_id = v and serije_plan->0->>'kg' = '60' and napomena = 'sjedalo lvl3';
  rez := rez || format(E'\n%s trener upiše polaznu kilažu i stalnu napomenu', case when n = 1 then 'OK' else 'GRESKA' end);
  insert into public.bazne_vjezbe (klijent_id, vjezba_id, napomena) values (k2, v, 'drugi');

  -- trener: trening s rasporedom po serijama
  insert into public.treninzi (klijent_id, datum, naziv, skupine, iz_kalendara)
  values (k, public.danas_zagreb() + 1, 'Test', '{Prsa}', true) returning id into t;
  insert into public.trening_vjezbe (trening_id, vjezba_id, serije, ponavljanja, kg, serije_plan)
  values (t, v, 3, '12', 50,
          '[{"ponavljanja":"12","kg":40},{"ponavljanja":"10","kg":45},{"ponavljanja":"8","kg":50}]');
  select count(*) into n from public.trening_vjezbe where trening_id = t and jsonb_array_length(serije_plan) = 3;
  rez := rez || format(E'\n%s trening sprema serije po seriji', case when n = 1 then 'OK' else 'GRESKA' end);

  ok := false;
  begin
    update public.trening_vjezbe
       set serije_plan = (select jsonb_agg(jsonb_build_object('ponavljanja', '1', 'kg', 1)) from generate_series(1, 21))
     where trening_id = t;
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s više od 20 serija se odbija', case when ok then 'OK' else 'GRESKA' end);

  -- kopiranje prenosi raspored po serijama
  n := public.kopiraj_trening(k, public.danas_zagreb() + 1, public.danas_zagreb() + 2);
  select count(*) into n from public.trening_vjezbe tv join public.treninzi tr on tr.id = tv.trening_id
   where tr.klijent_id = k and tr.datum = public.danas_zagreb() + 2 and tv.serije_plan->1->>'kg' = '45';
  rez := rez || format(E'\n%s kopiranje treninga prenosi serije po seriji', case when n = 1 then 'OK' else 'GRESKA' end);
  execute 'reset role';

  -- klijent: vidi svoju napomenu, ne vidi tuđu, ne može mijenjati
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select napomena into tekst from public.bazne_vjezbe where klijent_id = k and vjezba_id = v;
  rez := rez || format(E'\n%s klijent vidi svoju stalnu napomenu', case when tekst = 'sjedalo lvl3' then 'OK' else 'GRESKA' end);
  select count(*) into n from public.bazne_vjezbe where klijent_id = k2;
  rez := rez || format(E'\n%s klijent NE vidi tuđe napomene', case when n = 0 then 'OK' else 'GRESKA' end);
  update public.bazne_vjezbe set napomena = 'hakiran', serije_plan = null where klijent_id = k;
  execute 'reset role';
  select count(*) into n from public.bazne_vjezbe where klijent_id = k and napomena = 'sjedalo lvl3' and serije_plan is not null;
  rez := rez || format(E'\n%s klijent NE mijenja napomenu ni kilažu', case when n = 1 then 'OK' else 'GRESKA' end);

  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.trening_vjezbe where trening_id = t and serije_plan is not null;
  rez := rez || format(E'\n%s klijent vidi plan po serijama svog treninga', case when n = 1 then 'OK' else 'GRESKA' end);
  update public.trening_vjezbe set serije_plan = null where trening_id = t;
  execute 'reset role';
  select count(*) into n from public.trening_vjezbe where trening_id = t and serije_plan is not null;
  rez := rez || format(E'\n%s klijent NE mijenja plan po serijama', case when n = 1 then 'OK' else 'GRESKA' end);

  raise exception 'REZULTAT:%', rez;
end $$;
