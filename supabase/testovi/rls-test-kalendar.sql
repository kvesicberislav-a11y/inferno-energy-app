-- Test treninga iz kalendara (trener programira i upisuje, klijent samo gleda).
-- Sve je u jednom bloku koji se na kraju PONIŠTAVA (raise) – ništa ne ostaje u bazi.
do $$
declare
  trener uuid;
  k1 uuid;
  k2 uuid;
  v1 uuid;
  v2 uuid;
  d1 date := public.danas_zagreb() + 400; -- daleko u budućnosti, da se ne sudari s pravim treninzima
  t1 uuid;
  t2 uuid;
  plan uuid;
  dan uuid;
  tp uuid;
  n int;
  b boolean;
  ok boolean;
  rez text := '';
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;
  select id into k1 from public.profili where uloga = 'klijent' order by kreirano limit 1;
  select id into k2 from public.profili where uloga = 'klijent' and id <> k1 order by kreirano limit 1;
  select id into v1 from public.vjezbe where vlasnik_id is null order by naziv limit 1;
  select id into v2 from public.vjezbe where vlasnik_id is null order by naziv offset 1 limit 1;

  -- ===== TRENER =====
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.treninzi (klijent_id, datum, naziv, skupine, iz_kalendara) values (k1, d1, 'Prsa', '{Prsa}', true) returning id into t1;
  insert into public.trening_vjezbe (trening_id, vjezba_id, serije, ponavljanja, kg) values (t1, v1, 4, '8', 60), (t1, v2, 3, '10', null);
  rez := rez || E'\nOK trener slaže trening klijentu za datum';

  ok := false;
  begin
    insert into public.treninzi (klijent_id, datum, naziv, iz_kalendara) values (k1, d1, 'Dupli', true);
  exception when unique_violation then ok := true;
  end;
  rez := rez || format(E'\n%s samo jedan trening iz kalendara po klijentu i danu', case when ok then 'OK' else 'GRESKA' end);

  insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg)
  values (k1, t1, v1, 1, 8, 60), (k1, t1, v1, 2, 7, 60);
  rez := rez || E'\nOK trener upisuje odrađene serije';

  ok := false;
  begin
    insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg) values (k2, t1, v1, 3, 8, 60);
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s serija mora pripadati klijentu tog treninga', case when ok then 'OK' else 'GRESKA' end);

  select max_serija = 2 and max_kg = 60 into b from public.kilaze_klijenta(k1) where vjezba_id = v1;
  rez := rez || format(E'\n%s najbolji rezultat zna broj serija', case when b then 'OK' else 'GRESKA' end);

  n := public.kopiraj_trening(k1, d1, d1 + 7);
  select count(*) into n from public.trening_vjezbe tv join public.treninzi t on t.id = tv.trening_id
   where t.klijent_id = k1 and t.datum = d1 + 7 and t.iz_kalendara;
  rez := rez || format(E'\n%s kopiranje treninga na sljedeći tjedan', case when n = 2 then 'OK' else 'GRESKA ' || n end);

  select public.premjesti_trening(k1, d1 + 7, d1 + 8) into b;
  select count(*) into n from public.treninzi where klijent_id = k1 and datum = d1 + 8 and iz_kalendara;
  rez := rez || format(E'\n%s trening ide s pomaknutim terminom', case when b and n = 1 then 'OK' else 'GRESKA' end);

  perform public.ukloni_trening_termina(k1, d1 + 8);
  select count(*) into n from public.treninzi where klijent_id = k1 and datum = d1 + 8;
  rez := rez || format(E'\n%s obrisan termin briše prazan trening', case when n = 0 then 'OK' else 'GRESKA' end);
  perform public.ukloni_trening_termina(k1, d1);
  select count(*) into n from public.treninzi where id = t1;
  rez := rez || format(E'\n%s trening s upisanim serijama ostaje', case when n = 1 then 'OK' else 'GRESKA' end);

  insert into public.treninzi (klijent_id, datum, naziv, iz_kalendara) values (k2, d1, 'K2', true) returning id into t2;
  insert into public.trening_vjezbe (trening_id, vjezba_id) values (t2, v2);

  -- program za online način (klijent sam upisuje)
  plan := public.novi_program(k1, 'Online test');
  insert into public.plan_dani (plan_id, tjedan, dan_u_tjednu) values (plan, 1, 1) returning id into dan;

  -- ===== KLIJENT 1 =====
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', k1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.trening_vjezbe where trening_id = t1;
  rez := rez || format(E'\n%s klijent vidi svoj trening iz kalendara', case when n = 2 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.trening_vjezbe where trening_id = t2;
  rez := rez || format(E'\n%s klijent NE vidi tuđi trening', case when n = 0 then 'OK' else 'GRESKA' end);

  ok := false;
  begin
    insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg) values (k1, t1, v1, 5, 8, 60);
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s klijent NE upisuje serije u trening iz kalendara', case when ok then 'OK' else 'GRESKA' end);

  update public.odradjene_serije set kg = 999 where trening_id = t1;
  get diagnostics n = row_count;
  rez := rez || format(E'\n%s klijent NE mijenja serije koje je upisao trener', case when n = 0 then 'OK' else 'GRESKA' end);
  delete from public.odradjene_serije where trening_id = t1;
  get diagnostics n = row_count;
  rez := rez || format(E'\n%s klijent NE briše serije iz kalendara', case when n = 0 then 'OK' else 'GRESKA' end);

  update public.treninzi set zavrsen = true where id = t1;
  get diagnostics n = row_count;
  rez := rez || format(E'\n%s klijent NE mijenja trening iz kalendara', case when n = 0 then 'OK' else 'GRESKA' end);

  ok := false;
  begin
    insert into public.trening_vjezbe (trening_id, vjezba_id) values (t1, (select id from public.vjezbe where vlasnik_id is null order by naziv offset 2 limit 1));
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s klijent NE dodaje vježbe u trening', case when ok then 'OK' else 'GRESKA' end);

  ok := false;
  begin
    insert into public.treninzi (klijent_id, datum, naziv) values (k1, d1 + 1, 'Sam');
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s klijent NE pravi trening bez programa', case when ok then 'OK' else 'GRESKA' end);

  insert into public.treninzi (klijent_id, datum, plan_dan_id, naziv) values (k1, d1, dan, 'Program') returning id into tp;
  insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg) values (k1, tp, v1, 1, 10, 50);
  rez := rez || E'\nOK online: klijent i dalje sam upisuje svoj program';

  ok := false;
  begin
    perform public.kopiraj_trening(k1, d1, d1 + 14);
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s klijent NE kopira treninge', case when ok then 'OK' else 'GRESKA' end);

  -- ===== TRENER briše dan iz online programa (stari trening ostaje, bez sudara s kalendarom) =====
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  ok := true;
  begin
    delete from public.plan_dani where id = dan;
  exception when others then ok := false;
  end;
  select count(*) into n from public.treninzi where id = tp and plan_dan_id is null and not iz_kalendara;
  rez := rez || format(E'
%s brisanje dana programa ne smeta kalendaru', case when ok and n = 1 then 'OK' else 'GRESKA' end);

  execute 'reset role';
  raise exception 'REZULTAT:%', rez;
end $$;
