-- Test programa po klijentu, baznih vježbi, kilaža i arhive.
-- Sve je u jednom bloku koji se na kraju PONIŠTAVA (raise) – ništa ne ostaje u bazi.
do $$
declare
  trener uuid;
  k1 uuid;
  k2 uuid;
  v1 uuid;
  v2 uuid;
  plan uuid;
  plan2 uuid;
  dan uuid;
  tr uuid;
  n int;
  x numeric;
  b boolean;
  rez text := '';
  ok boolean;
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;
  select id into k1 from public.profili where uloga = 'klijent' order by kreirano limit 1;
  select id into k2 from public.profili where uloga = 'klijent' and id <> k1 order by kreirano limit 1;
  select id into v1 from public.vjezbe where vlasnik_id is null order by naziv limit 1;
  select id into v2 from public.vjezbe where vlasnik_id is null order by naziv offset 1 limit 1;

  -- ===== TRENER =====
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  plan := public.novi_program(k1, 'Test program');
  select count(*) into n from public.dodjele_planova where klijent_id = k1 and plan_id = plan and do_datuma is null;
  rez := rez || format(E'\n%s trener radi program klijentu', case when n = 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.planovi where id = plan and klijent_id = k1
     and extract(isodow from pocetak) = 1 and ciklus_tjedana = 1;
  rez := rez || format(E'\n%s program pripada klijentu, počinje u ponedjeljak', case when n = 1 then 'OK' else 'GRESKA' end);

  update public.planovi set ciklus_tjedana = 2 where id = plan;
  insert into public.plan_dani (plan_id, tjedan, dan_u_tjednu, skupine) values (plan, 1, 1, '{Prsa,Triceps}') returning id into dan;
  insert into public.plan_vjezbe (plan_dan_id, vjezba_id, serije, ponavljanja, kg) values (dan, v1, 4, '8', 60);
  perform public.kopiraj_tjedan(plan, 1::smallint, 2::smallint);
  select count(*) into n from public.plan_dani d join public.plan_vjezbe v on v.plan_dan_id = d.id
   where d.plan_id = plan and d.tjedan = 2 and d.skupine = '{Prsa,Triceps}' and v.kg = 60;
  rez := rez || format(E'\n%s kopiranje tjedna 1 u tjedan 2', case when n = 1 then 'OK' else 'GRESKA' end);

  plan2 := public.novi_program(k2, 'Kopija', plan);
  select count(*) into n from public.plan_dani where plan_id = plan2;
  rez := rez || format(E'\n%s kopiranje programa drugom klijentu', case when n = 2 then 'OK' else 'GRESKA' end);

  insert into public.bazne_vjezbe (klijent_id, vjezba_id) values (k1, v1), (k1, v2), (k2, v2);
  rez := rez || E'\nOK trener dodaje bazne vježbe';

  -- serije za kilaže (kao da ih je klijent upisao)
  execute 'reset role';
  insert into public.treninzi (klijent_id, datum, plan_dan_id, naziv) values (k1, public.danas_zagreb() - 3, dan, 'T') returning id into tr;
  insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg)
  values (k1, tr, v1, 1, 5, 80), (k1, tr, v1, 2, 8, 70);
  execute 'set local role authenticated';
  select max_kg into x from public.kilaze_klijenta(k1) where vjezba_id = v1;
  rez := rez || format(E'\n%s trener vidi najveću kilažu klijenta (80)', case when x = 80 then 'OK' else 'GRESKA ' || coalesce(x::text, 'null') end);

  -- ===== KLIJENT 1 =====
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', k1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.planovi where id = plan;
  rez := rez || format(E'\n%s klijent vidi svoj program', case when n = 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.planovi where id = plan2;
  rez := rez || format(E'\n%s klijent NE vidi tuđi program', case when n = 0 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.bazne_vjezbe;
  rez := rez || format(E'\n%s klijent vidi samo svoje bazne vježbe', case when n = 2 then 'OK' else 'GRESKA ' || n end);
  select count(*) into n from public.kilaze_klijenta(k2);
  rez := rez || format(E'\n%s klijent NE vidi tuđe kilaže', case when n = 0 then 'OK' else 'GRESKA' end);

  begin
    insert into public.bazne_vjezbe (klijent_id, vjezba_id) values (k1, (select id from public.vjezbe where vlasnik_id is null order by naziv offset 2 limit 1));
    rez := rez || E'\nGRESKA klijent dodao baznu vježbu';
  exception when others then
    rez := rez || E'\nOK klijent NE dodaje bazne vježbe';
  end;
  delete from public.bazne_vjezbe where klijent_id = k1;
  get diagnostics n = row_count;
  rez := rez || format(E'\n%s klijent NE briše bazne vježbe', case when n = 0 then 'OK' else 'GRESKA' end);

  ok := false;
  begin
    perform public.novi_program(k1, 'Hack');
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s klijent NE radi program', case when ok then 'OK' else 'GRESKA' end);

  ok := false;
  begin
    perform public.kopiraj_tjedan(plan, 1::smallint, 2::smallint);
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s klijent NE kopira tjedan', case when ok then 'OK' else 'GRESKA' end);

  ok := false;
  begin
    perform public.arhiviraj_klijenta(k2, true);
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s klijent NE arhivira', case when ok then 'OK' else 'GRESKA' end);

  ok := false;
  begin
    update public.profili set aktivan = true where id = k1;
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s klijent NE mijenja svoje stanje arhive', case when ok then 'OK' else 'GRESKA' end);

  -- ===== ARHIVA (trener) =====
  execute 'reset role';
  insert into public.termini_pravila (klijent_id, dan_u_tjednu, vrijeme, od_datuma) values (k1, 2, '18:00', public.danas_zagreb() - 30);
  insert into public.termini_pravila (klijent_id, dan_u_tjednu, vrijeme, od_datuma) values (k1, 4, '18:00', public.danas_zagreb() + 7);
  insert into public.termini_dodatni (klijent_id, datum, vrijeme) values (k1, public.danas_zagreb() + 2, '10:00');
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  perform public.arhiviraj_klijenta(k1, true);
  select not aktivan and arhivirano is not null into b from public.profili where id = k1;
  rez := rez || format(E'\n%s arhiviran klijent je neaktivan', case when b then 'OK' else 'GRESKA' end);
  select count(*) into n from public.termini_pravila where klijent_id = k1 and (do_datuma is null or do_datuma >= public.danas_zagreb());
  rez := rez || format(E'\n%s arhiviranom završavaju stalni termini', case when n = 0 then 'OK' else 'GRESKA ' || n end);
  select count(*) into n from public.termini_pravila where klijent_id = k1 and od_datuma = public.danas_zagreb() - 30;
  rez := rez || format(E'\n%s prošli termini ostaju u povijesti', case when n >= 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.termini_dodatni where klijent_id = k1 and datum >= public.danas_zagreb();
  rez := rez || format(E'\n%s budući dodatni termini se brišu', case when n = 0 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.pregled_klijenata(k1) where not aktivan;
  rez := rez || format(E'\n%s pregled klijenata pokazuje arhivu', case when n = 1 then 'OK' else 'GRESKA' end);

  perform public.arhiviraj_klijenta(k1, false);
  select aktivan and arhivirano is null into b from public.profili where id = k1;
  rez := rez || format(E'\n%s vraćanje iz arhive', case when b then 'OK' else 'GRESKA' end);
  select count(*) into n from public.dodjele_planova where klijent_id = k1 and plan_id = plan and do_datuma is null;
  rez := rez || format(E'\n%s program ostaje nakon arhive', case when n = 1 then 'OK' else 'GRESKA' end);

  execute 'reset role';
  raise exception 'REZULTAT:%', rez;
end $$;
