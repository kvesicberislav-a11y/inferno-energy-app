-- =====================================================================
-- Mišićna skupina "Noge" preimenovana je u "Kvadriceps".
-- Pokreće se TEK PRI OBJAVI (dotad aplikacija stare zapise samo prikazuje
-- pod novim imenom, a prava verzija i dalje radi s "Noge").
-- =====================================================================

update public.vjezbe set misicna_skupina = 'Kvadriceps' where misicna_skupina = 'Noge';
update public.treninzi set skupine = array_replace(skupine, 'Noge', 'Kvadriceps') where 'Noge' = any (skupine);
update public.plan_dani set skupine = array_replace(skupine, 'Noge', 'Kvadriceps') where 'Noge' = any (skupine);
