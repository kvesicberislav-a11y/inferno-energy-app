-- Test u jednom bloku koji se na kraju PONIŠTAVA (raise) – ništa ne ostaje u bazi.
do $$
declare
  k1 uuid; k1_email text;
  k2 uuid;
  p uuid;
  rez text := '';
  u text;
begin
  select id, email into k1, k1_email from public.profili where uloga = 'klijent' order by kreirano limit 1;
  select id into k2 from public.profili where uloga = 'klijent' and id <> k1 order by kreirano limit 1;

  -- 1) pozivnica za trenera s ISTIM e-mailom -> postaje trener
  insert into public.pozivnice (ime, trener_email) values ('TEST', lower(k1_email)) returning id into p;
  update public.pozivnice set iskoristena_at = now(), iskoristio = k1 where id = p;
  select uloga::text into u from public.profili where id = k1;
  rez := rez || ' | isti e-mail -> ' || u || case when u = 'trener' then ' OK' else ' GRESKA' end;

  -- 2) pozivnica za trenera, ali registriran DRUGI e-mail -> ostaje klijent
  insert into public.pozivnice (ime, trener_email) values ('TEST', 'netko.drugi@primjer.hr') returning id into p;
  update public.pozivnice set iskoristena_at = now(), iskoristio = k2 where id = p;
  select uloga::text into u from public.profili where id = k2;
  rez := rez || ' | drugi e-mail -> ' || u || case when u = 'klijent' then ' OK' else ' GRESKA' end;

  -- 3) obicna pozivnica -> ostaje klijent
  update public.profili set uloga = 'klijent' where id = k1;
  insert into public.pozivnice (ime) values ('TEST') returning id into p;
  update public.pozivnice set iskoristena_at = now(), iskoristio = k1 where id = p;
  select uloga::text into u from public.profili where id = k1;
  rez := rez || ' | obicna pozivnica -> ' || u || case when u = 'klijent' then ' OK' else ' GRESKA' end;

  -- 4) klijent ne moze sam sebi upisati trener_email (nema prava na izmjenu pozivnica)
  perform set_config('request.jwt.claims', json_build_object('sub', k2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.pozivnice (ime, trener_email) values ('HACK', 'x@y.hr');
    rez := rez || ' | klijent pravi pozivnicu za trenera -> GRESKA uspjelo';
  exception when others then
    rez := rez || ' | klijent pravi pozivnicu za trenera -> odbijeno OK';
  end;
  execute 'reset role';

  raise exception 'REZULTAT:%', rez;
end $$;
