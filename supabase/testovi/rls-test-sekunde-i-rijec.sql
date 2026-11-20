-- Test: serije u sekundama i opterećenje riječju. Na kraju se sve PONIŠTAVA (raise).
do $$
declare
  trener uuid;
  k uuid;
  v uuid;
  v2 uuid;
  t1 uuid;
  plan jsonb;
  n integer;
  r record;
  rez text := '';
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;
  select id into v from public.vjezbe where vlasnik_id is null order by naziv limit 1;
  select id into v2 from public.vjezbe where vlasnik_id is null order by naziv offset 1 limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.dodaj_klijenta('TEST Sekunde Rijec');
  insert into public.bazne_vjezbe (klijent_id, vjezba_id, serije_plan)
  values (k, v, '[{"ponavljanja":"60","kg":5,"sekunde":true}]');
  insert into public.bazne_vjezbe (klijent_id, vjezba_id) values (k, v2);
  insert into public.treninzi (klijent_id, datum, naziv, iz_kalendara) values (k, public.danas_zagreb() - 1, 'T1', true) returning id into t1;

  -- 1) trener sprema seriju u sekundama i seriju s riječju
  insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg, sekunde)
  values (k, t1, v, 1, 60, 7.5, true);
  insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg, rijec)
  values (k, t1, v2, 1, 10, 0, 'žuta guma');
  select count(*) into n from public.odradjene_serije where trening_id = t1 and ((sekunde and vjezba_id = v) or rijec = 'žuta guma');
  rez := rez || format(E'\n%s trener sprema sekunde i riječ', case when n = 2 then 'OK' else 'GRESKA ' || n end);

  -- 2) predugačka riječ se odbija
  begin
    insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg, rijec)
    values (k, t1, v2, 2, 10, 0, repeat('x', 41));
    rez := rez || E'\nGRESKA predugačka riječ prošla';
  exception when check_violation then
    rez := rez || E'\nOK predugačka riječ se odbija';
  end;

  -- 3) bazne u sekundama se osvježe težom serijom i zadrže sekunde
  select serije_plan into plan from public.bazne_vjezbe where klijent_id = k and vjezba_id = v;
  rez := rez || format(E'\n%s bazne zadrže sekunde', case when plan = '[{"ponavljanja":"60","kg":7.5,"sekunde":true}]'::jsonb then 'OK' else 'GRESKA ' || plan::text end);

  -- 4) prazna bazna dobije seriju s riječju
  select serije_plan into plan from public.bazne_vjezbe where klijent_id = k and vjezba_id = v2;
  rez := rez || format(E'\n%s prazna bazna dobije riječ', case when plan = '[{"ponavljanja":"10","kg":null,"rijec":"žuta guma"}]'::jsonb then 'OK' else 'GRESKA ' || coalesce(plan::text, 'null') end);

  -- 5) najveća / zadnja kilaža znaju za sekunde i riječ
  select * into r from public.kilaze_klijenta(k) where vjezba_id = v;
  rez := rez || format(E'\n%s max u sekundama', case when r.max_kg = 7.5 and r.max_sekunde and r.zadnja_sekunde then 'OK' else 'GRESKA' end);
  select * into r from public.kilaze_klijenta(k) where vjezba_id = v2;
  rez := rez || format(E'\n%s zadnja s riječju', case when r.max_kg is null and r.zadnja_rijec = 'žuta guma' and not r.max_sekunde then 'OK' else 'GRESKA' end);

  -- 6) napredak vraća sekunde i riječ
  select count(*) into n from public.napredak_vjezbi(k, public.danas_zagreb() - 7, public.danas_zagreb())
   where (vjezba_id = v and sekunde) or (vjezba_id = v2 and rijec = 'žuta guma');
  rez := rez || format(E'\n%s napredak zna sekunde i riječ', case when n = 2 then 'OK' else 'GRESKA ' || n end);

  -- 7) volumen ne broji sekunde (60 s × 7,5 kg), broji samo 8 × 20 kg
  insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg)
  select k, t1, id, 1, 8, 20 from public.vjezbe where vlasnik_id is null and id not in (v, v2) limit 1;
  select coalesce(sum(volumen), 0)::integer into n from public.tjedni_volumen(k, public.danas_zagreb() - 7, public.danas_zagreb());
  rez := rez || format(E'\n%s volumen bez sekundi', case when n = 160 then 'OK' else 'GRESKA ' || n end);

  -- 8) klijent vidi svoje serije sa sekundama i riječju
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.odradjene_serije where sekunde or rijec is not null;
  rez := rez || format(E'\n%s klijent vidi svoje', case when n = 2 then 'OK' else 'GRESKA ' || n end);
  execute 'reset role';

  raise exception 'REZULTAT:%', rez;
end $$;
