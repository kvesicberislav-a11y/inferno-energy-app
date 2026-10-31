-- Test oznake „nije došao”. Na kraju se sve PONIŠTAVA (raise).
do $$
declare
  trener uuid;
  k uuid := gen_random_uuid();
  v1 uuid;
  t1 uuid;
  t2 uuid;
  n int;
  ok boolean;
  rez text := '';
  danas date := public.danas_zagreb();
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;
  select id into v1 from public.vjezbe where vlasnik_id is null order by naziv limit 1;
  insert into public.profili (id, ime, registriran) values (k, 'TEST Izostanak', false);
  insert into public.treninzi (klijent_id, datum, iz_kalendara, skupine) values (k, danas - 1, true, '{Prsa}') returning id into t1;
  insert into public.trening_vjezbe (trening_id, vjezba_id) values (t1, v1);

  -- trener označi izostanak (trening s planom) i izostanak bez plana
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.treninzi set nije_dosao = true where id = t1;
  get diagnostics n = row_count;
  rez := rez || format(E'\n%s trener označi „nije došao”', case when n = 1 then 'OK' else 'GRESKA' end);
  insert into public.treninzi (klijent_id, datum, iz_kalendara, nije_dosao) values (k, danas - 3, true, true) returning id into t2;
  rez := rez || format(E'\n%s trener označi izostanak i bez plana', case when t2 is not null then 'OK' else 'GRESKA' end);
  execute 'reset role';

  -- izostanak ne ulazi u zadnji trening
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.pregled_klijenata(p_klijent => k) where zadnji_trening is null;
  rez := rez || format(E'\n%s izostanak ne broji se kao trening', case when n = 1 then 'OK' else 'GRESKA' end);
  execute 'reset role';

  -- završen trening ne može biti izostanak
  ok := false;
  begin
    update public.treninzi set zavrsen = true where id = t1;
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s izostanak ne može biti i završen', case when ok then 'OK' else 'GRESKA' end);
  ok := false;
  begin
    insert into public.treninzi (klijent_id, datum, iz_kalendara, nije_dosao) values (k, danas - 5, false, true);
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s samo trening iz kalendara može biti izostanak', case when ok then 'OK' else 'GRESKA' end);

  -- klijent ne mijenja oznaku
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.treninzi set nije_dosao = false where id = t1;
  get diagnostics n = row_count;
  rez := rez || format(E'\n%s klijent NE mijenja oznaku', case when n = 0 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.treninzi where nije_dosao;
  rez := rez || format(E'\n%s klijent vidi svoje izostanke (2): %s', case when n = 2 then 'OK' else 'GRESKA' end, n);
  execute 'reset role';

  -- premješten trening više nije izostanak
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.premjesti_trening(k, danas - 1, danas + 2);
  select count(*) into n from public.treninzi where id = t1 and datum = danas + 2 and not nije_dosao;
  rez := rez || format(E'\n%s premješten trening više nije izostanak', case when n = 1 then 'OK' else 'GRESKA' end);
  execute 'reset role';

  raise exception 'REZULTAT:%', rez;
end $$;
