-- =====================================================================
-- Kilaža na vježbama s dvije decimale (manji utezi: 1,25 / 3,75 kg).
-- Do sada numeric(6,1) je 3,75 spremao kao 3,8. Postojeće vrijednosti
-- ostaju iste; provjera 0–1000 kg ostaje.
-- (tjelesna težina i makronutrijenti ostaju s jednom decimalom)
-- =====================================================================

alter table public.odradjene_serije alter column kg type numeric(7,2);
alter table public.trening_vjezbe   alter column kg type numeric(7,2);
alter table public.plan_vjezbe      alter column kg type numeric(7,2);
