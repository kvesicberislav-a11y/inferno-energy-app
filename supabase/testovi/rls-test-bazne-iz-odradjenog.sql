-- Test: bazne serije se same osvježe kad na treningu digne više kila. Na kraju se sve PONIŠTAVA (raise).
do $$
declare
  trener uuid;
  k uuid;
  v uuid;
  v2 uuid;
  t1 uuid;
  t2 uuid;
  t3 uuid;
  plan jsonb;
  izvor uuid;
  rez text := '';
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;
  select id into v from public.vjezbe where vlasnik_id is null order by naziv limit 1;
  select id into v2 from public.vjezbe where vlasnik_id is null order by naziv offset 1 limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.dodaj_klijenta('TEST Bazne Odradjeno');
  insert into public.bazne_vjezbe (klijent_id, vjezba_id, serije_plan)
  values (k, v, '[{"ponavljanja":"10","kg":40},{"ponavljanja":"10","kg":40}]');
  insert into public.bazne_vjezbe (klijent_id, vjezba_id) values (k, v2);

  insert into public.treninzi (klijent_id, datum, naziv, iz_kalendara) values (k, public.danas_zagreb() - 3, 'T1', true) returning id into t1;
  insert into public.treninzi (klijent_id, datum, naziv, iz_kalendara) values (k, public.danas_zagreb() - 2, 'T2', true) returning id into t2;
  insert into public.treninzi (klijent_id, datum, naziv, iz_kalendara) values (k, public.danas_zagreb() - 1, 'T3', true) returning id into t3;

  -- 1) teža serija → bazne postaju serije s treninga
  insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg) values (k, t1, v, 1, 10, 45);
  select serije_plan, izvor_trening into plan, izvor from public.bazne_vjezbe where klijent_id = k and vjezba_id = v;
  rez := rez || format(E'\n%s teža serija zamijeni bazne', case when plan = '[{"ponavljanja":"10","kg":45}]'::jsonb and izvor = t1 then 'OK' else 'GRESKA ' || plan::text end);

  -- 2) druga serija istog treninga se doda
  insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg) values (k, t1, v, 2, 8, 45);
  select serije_plan into plan from public.bazne_vjezbe where klijent_id = k and vjezba_id = v;
  rez := rez || format(E'\n%s i ostale serije tog treninga uđu u bazne', case when jsonb_array_length(plan) = 2 and plan->1->>'ponavljanja' = '8' then 'OK' else 'GRESKA ' || plan::text end);

  -- 3) lakši trening ne dira bazne
  insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg) values (k, t2, v, 1, 12, 30);
  select serije_plan, izvor_trening into plan, izvor from public.bazne_vjezbe where klijent_id = k and vjezba_id = v;
  rez := rez || format(E'\n%s lakši trening ne mijenja bazne', case when izvor = t1 and (plan->0->>'kg')::numeric = 45 then 'OK' else 'GRESKA ' || plan::text end);

  -- 4) ispravak serije na izvornom treningu (45 → 35): više nije teže → vrate se prijašnje
  update public.odradjene_serije set kg = 35 where trening_id = t1 and vjezba_id = v;
  select serije_plan, izvor_trening into plan, izvor from public.bazne_vjezbe where klijent_id = k and vjezba_id = v;
  rez := rez || format(E'\n%s ispravak na lakše vrati prijašnje bazne', case when izvor is null and plan = '[{"ponavljanja":"10","kg":40},{"ponavljanja":"10","kg":40}]'::jsonb then 'OK' else 'GRESKA ' || plan::text end);

  -- 5) opet teže, pa poništi (obriši) sve serije tog treninga → vrate se prijašnje
  update public.odradjene_serije set kg = 50 where trening_id = t1 and vjezba_id = v;
  select serije_plan into plan from public.bazne_vjezbe where klijent_id = k and vjezba_id = v;
  rez := rez || format(E'\n%s ispravak na teže opet postavi bazne', case when (plan->0->>'kg')::numeric = 50 then 'OK' else 'GRESKA ' || plan::text end);
  delete from public.odradjene_serije where trening_id = t1 and vjezba_id = v;
  select serije_plan, izvor_trening into plan, izvor from public.bazne_vjezbe where klijent_id = k and vjezba_id = v;
  rez := rez || format(E'\n%s poništene serije vrate prijašnje bazne', case when izvor is null and (plan->0->>'kg')::numeric = 40 then 'OK' else 'GRESKA ' || plan::text end);

  -- 6) bazna bez upisanih serija dobije prve odrađene; brisanje treninga ih vrati na prazno
  insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg) values (k, t3, v2, 1, 15, 0);
  select serije_plan into plan from public.bazne_vjezbe where klijent_id = k and vjezba_id = v2;
  rez := rez || format(E'\n%s prazna bazna dobije prve odrađene serije', case when plan = '[{"ponavljanja":"15","kg":null}]'::jsonb then 'OK' else 'GRESKA ' || coalesce(plan::text, 'null') end);
  delete from public.treninzi where id = t3;
  select serije_plan into plan from public.bazne_vjezbe where klijent_id = k and vjezba_id = v2;
  rez := rez || format(E'\n%s brisanje treninga vrati bazne', case when plan is null then 'OK' else 'GRESKA ' || plan::text end);

  -- 7) vježba koja nije bazna se ne dodaje sama
  insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg)
  select k, t2, id, 1, 10, 20 from public.vjezbe where vlasnik_id is null and id not in (v, v2) limit 1;
  rez := rez || format(E'\n%s nebazna vježba ne postaje bazna', case when (select count(*) from public.bazne_vjezbe where klijent_id = k) = 2 then 'OK' else 'GRESKA' end);

  -- 8) klijent ne može sam pozvati funkciju
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.osvjezi_baznu_iz_treninga(k, t1, v);
    rez := rez || E'\nGRESKA klijent smije pozvati osvježavanje';
  exception when others then
    rez := rez || E'\nOK klijent ne smije pozvati osvježavanje';
  end;
  execute 'reset role';

  raise exception 'REZULTAT:%', rez;
end $$;
