-- Test: trener potvrđuje vježbu kao gotovu, klijent ne može; kopija treninga je ne prenosi. Na kraju se sve PONIŠTAVA (raise).
do $$
declare
  trener uuid;
  k uuid;
  v uuid;
  t1 uuid;
  tv uuid;
  n integer;
  rez text := '';
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;
  select id into v from public.vjezbe where vlasnik_id is null order by naziv limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.dodaj_klijenta('TEST Vjezba Gotova');
  insert into public.treninzi (klijent_id, datum, naziv, iz_kalendara) values (k, public.danas_zagreb() - 1, 'T1', true) returning id into t1;
  insert into public.trening_vjezbe (trening_id, vjezba_id, serije, ponavljanja) values (t1, v, 3, '10') returning id into tv;

  -- 1) nova vježba nije gotova
  select count(*) into n from public.trening_vjezbe where id = tv and not zavrsena;
  rez := rez || format(E'\n%s nova vježba nije označena', case when n = 1 then 'OK' else 'GRESKA' end);

  -- 2) trener je označi kao gotovu
  update public.trening_vjezbe set zavrsena = true where id = tv;
  get diagnostics n = row_count;
  rez := rez || format(E'\n%s trener označi vježbu kao gotovu', case when n = 1 then 'OK' else 'GRESKA' end);

  -- 3) kopija treninga ne prenosi oznaku
  perform public.kopiraj_trening(k, public.danas_zagreb() - 1, public.danas_zagreb() + 1, false);
  select count(*) into n from public.trening_vjezbe x join public.treninzi t on t.id = x.trening_id
   where t.klijent_id = k and t.datum = public.danas_zagreb() + 1 and not x.zavrsena;
  rez := rez || format(E'\n%s kopija treninga nije označena', case when n = 1 then 'OK' else 'GRESKA ' || n end);

  -- 4) klijent ne može mijenjati oznaku
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.trening_vjezbe set zavrsena = false where id = tv;
  get diagnostics n = row_count;
  rez := rez || format(E'\n%s klijent ne mijenja oznaku', case when n = 0 then 'OK' else 'GRESKA' end);
  execute 'reset role';

  raise exception 'REZULTAT:%', rez;
end $$;
