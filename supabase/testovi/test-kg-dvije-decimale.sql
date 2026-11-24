-- Test: 3,75 kg se sprema točno (serija, plan treninga, bazna vježba iz serije). Na kraju se sve PONIŠTAVA (raise).
do $$
declare
  trener uuid;
  k uuid;
  v uuid;
  t1 uuid;
  tv uuid;
  x numeric;
  rez text := '';
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;
  select id into v from public.vjezbe where vlasnik_id is null order by naziv limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.dodaj_klijenta('TEST Kg Decimale');
  insert into public.treninzi (klijent_id, datum, naziv, iz_kalendara) values (k, public.danas_zagreb() - 1, 'T1', true) returning id into t1;

  -- 1) plan vježbe u treningu
  insert into public.trening_vjezbe (trening_id, vjezba_id, serije, ponavljanja, kg) values (t1, v, 3, '10', 3.75) returning id into tv;
  select kg into x from public.trening_vjezbe where id = tv;
  rez := rez || format(E'\n%s trening_vjezbe.kg = %s', case when x = 3.75 then 'OK' else 'GRESKA' end, x);

  -- 2) odrađena serija
  insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, plan_vjezba_id, redni_broj, ponavljanja, kg)
  values (k, t1, v, null, 1, 10, 1.25);
  select kg into x from public.odradjene_serije where trening_id = t1 and redni_broj = 1;
  rez := rez || format(E'\n%s odradjene_serije.kg = %s', case when x = 1.25 then 'OK' else 'GRESKA' end, x);

  -- 3) najveća kilaža klijenta (funkcija) vraća 1,25
  select max_kg into x from public.kilaze_klijenta(k) where vjezba_id = v;
  rez := rez || format(E'\n%s kilaze_klijenta.max_kg = %s', case when x = 1.25 then 'OK' else 'GRESKA' end, x);

  -- 4) provjera granica i dalje radi
  begin
    insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, plan_vjezba_id, redni_broj, ponavljanja, kg)
    values (k, t1, v, null, 2, 10, 1000.5);
    rez := rez || E'\nGRESKA kg iznad 1000 prošao';
  exception when check_violation then
    rez := rez || E'\nOK kg iznad 1000 odbijen';
  end;

  execute 'reset role';
  raise exception 'REZULTAT:%', rez;
end $$;
