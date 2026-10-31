-- Test praćenih vježbi (trener bira, klijent samo čita svoje). Na kraju se sve PONIŠTAVA (raise).
do $$
declare
  trener uuid;
  k1 uuid;
  k2 uuid;
  v1 uuid;
  n int;
  ok boolean;
  rez text := '';
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;
  select id into k1 from public.profili where uloga = 'klijent' order by kreirano limit 1;
  select id into k2 from public.profili where uloga = 'klijent' and id <> k1 order by kreirano limit 1;
  select id into v1 from public.vjezbe where vlasnik_id is null order by naziv limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.pracene_vjezbe (klijent_id, vjezba_id) values (k1, v1), (k2, v1) on conflict do nothing;
  rez := rez || E'\nOK trener bira praćene vježbe';

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', k1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.pracene_vjezbe;
  rez := rez || format(E'\n%s klijent vidi samo svoje praćene', case when n = (select count(*) from public.pracene_vjezbe where klijent_id = k1) and n >= 1 then 'OK' else 'GRESKA' end);
  ok := false;
  begin
    insert into public.pracene_vjezbe (klijent_id, vjezba_id) values (k1, (select id from public.vjezbe where vlasnik_id is null order by naziv offset 1 limit 1));
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s klijent NE dodaje praćene', case when ok then 'OK' else 'GRESKA' end);
  delete from public.pracene_vjezbe where klijent_id = k1;
  get diagnostics n = row_count;
  rez := rez || format(E'\n%s klijent NE briše praćene', case when n = 0 then 'OK' else 'GRESKA' end);

  execute 'reset role';
  raise exception 'REZULTAT:%', rez;
end $$;
