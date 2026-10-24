"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Gumb, Kartica, Polje, PoljeTeksta, Poruka, Ucitavanje } from "@/components/ui";
import { OdabirVjezbe } from "@/components/vjezbe/OdabirVjezbe";
import { SlicicaVjezbe } from "@/components/vjezbe/VideoVjezbe";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import {
  DANI,
  SELECT_PLANA,
  jeGreskaVeze,
  opisCilja,
  uPlan,
  type Plan,
  type PlanDan,
  type PlanVjezba,
  type Vjezba,
} from "@/lib/treninzi";
import { PlanVjezbaForma, type PodaciPlanVjezbe } from "./PlanVjezbaForma";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ucitano = { id: string; plan: Plan | null; greska: string | null };
type FormaVjezbe = { dan: PlanDan; vjezba: Vjezba; postojeca: PlanVjezba | null };

export function UredivacPlana() {
  const id = useSearchParams().get("id") ?? "";
  const ispravan = UUID.test(id);
  const router = useRouter();
  const [ucitano, setUcitano] = useState<Ucitano | null>(null);
  const [verzija, setVerzija] = useState(0);
  const [odabirZaDan, setOdabirZaDan] = useState<PlanDan | null>(null);
  const [forma, setForma] = useState<FormaVjezbe | null>(null);
  const [uredivanjeNaziva, setUredivanjeNaziva] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  useEffect(() => {
    if (!ispravan) return;
    let aktivno = true;
    supabase()
      .from("planovi")
      .select(SELECT_PLANA)
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!aktivno) return;
        setUcitano({
          id,
          plan: data ? uPlan(data) : null,
          greska: error ? prevediGresku(error.message) : null,
        });
      });
    return () => {
      aktivno = false;
    };
  }, [id, ispravan, verzija]);

  const osvjezi = () => setVerzija((v) => v + 1);

  const natrag = (
    <Link href="/trener/planovi" className="self-start py-2 text-base font-medium text-vatra">
      ‹ Planovi
    </Link>
  );

  if (ispravan && ucitano?.id !== id) return <Ucitavanje />;
  const plan = ispravan ? ucitano?.plan : null;
  if (!plan) {
    return (
      <>
        {natrag}
        <Poruka tip="greska">{ucitano?.greska ?? "Plan nije pronađen."}</Poruka>
      </>
    );
  }

  async function izvrsi(radnja: PromiseLike<{ error: { message: string } | null }>) {
    setGreska(null);
    const { error } = await radnja;
    if (error) {
      setGreska(prevediGresku(error.message));
      return prevediGresku(error.message);
    }
    osvjezi();
    return null;
  }

  const sb = supabase();

  async function dodajDan(danUTjednu: number) {
    await izvrsi(sb.from("plan_dani").insert({ plan_id: plan!.id, dan_u_tjednu: danUTjednu }));
  }

  async function ukloniDan(dan: PlanDan) {
    if (!window.confirm(`Ukloniti ${DANI[dan.dan_u_tjednu - 1].toLowerCase()} iz plana (s vježbama)?`)) return;
    await izvrsi(sb.from("plan_dani").delete().eq("id", dan.id));
  }

  async function spremiVjezbu(f: FormaVjezbe, p: PodaciPlanVjezbe) {
    const g = f.postojeca
      ? await izvrsi(sb.from("plan_vjezbe").update(p).eq("id", f.postojeca.id))
      : await izvrsi(
          sb.from("plan_vjezbe").insert({
            ...p,
            plan_dan_id: f.dan.id,
            vjezba_id: f.vjezba.id,
            redoslijed: f.dan.vjezbe.reduce((m, v) => Math.max(m, v.redoslijed), -1) + 1,
          }),
        );
    if (!g) setForma(null);
    return g;
  }

  async function ukloniVjezbu(pv: PlanVjezba) {
    const g = await izvrsi(sb.from("plan_vjezbe").delete().eq("id", pv.id));
    if (!g) setForma(null);
    return g;
  }

  async function pomakni(dan: PlanDan, indeks: number, smjer: -1 | 1) {
    const novi = [...dan.vjezbe];
    const cilj = indeks + smjer;
    if (cilj < 0 || cilj >= novi.length) return;
    [novi[indeks], novi[cilj]] = [novi[cilj], novi[indeks]];
    setGreska(null);
    const rezultati = await Promise.all(
      novi.map((v, i) => sb.from("plan_vjezbe").update({ redoslijed: i }).eq("id", v.id)),
    );
    const prva = rezultati.find((r) => r.error);
    if (prva?.error) setGreska(prevediGresku(prva.error.message));
    osvjezi();
  }

  async function arhiviraj() {
    await izvrsi(sb.from("planovi").update({ arhiviran: !plan!.arhiviran }).eq("id", plan!.id));
  }

  async function obrisiPlan() {
    if (!window.confirm(`Obrisati plan „${plan!.naziv}”? Ovo se ne može vratiti.`)) return;
    setGreska(null);
    const { error } = await sb.from("planovi").delete().eq("id", plan!.id);
    if (error) {
      return setGreska(
        jeGreskaVeze(error.message)
          ? "Plan je (bio) dodijeljen klijentu, pa se ne može obrisati. Možeš ga arhivirati."
          : prevediGresku(error.message),
      );
    }
    router.replace("/trener/planovi");
  }

  return (
    <>
      {natrag}

      {uredivanjeNaziva ? (
        <NazivPlanaForma
          plan={plan}
          onGotovo={() => {
            setUredivanjeNaziva(false);
            osvjezi();
          }}
          onOdustani={() => setUredivanjeNaziva(false)}
        />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{plan.naziv}</h1>
            {plan.opis && <p className="mt-1 whitespace-pre-line text-tekst-2">{plan.opis}</p>}
            {plan.arhiviran && <p className="mt-1 text-sm text-amber-300">Arhiviran</p>}
          </div>
          <Gumb varijanta="sporedni" malen onClick={() => setUredivanjeNaziva(true)}>
            Uredi
          </Gumb>
        </div>
      )}

      {greska && <Poruka tip="greska">{greska}</Poruka>}

      <div className="flex flex-col gap-3">
        {DANI.map((imeDana, i) => {
          const brojDana = i + 1;
          const dan = plan.dani.find((d) => d.dan_u_tjednu === brojDana);
          if (!dan) {
            return (
              <div
                key={brojDana}
                className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-rub px-4 py-3"
              >
                <span className="text-tekst-2">
                  <strong className="font-semibold text-tekst">{imeDana}</strong> · odmor
                </span>
                <Gumb varijanta="sporedni" malen onClick={() => dodajDan(brojDana)}>
                  + Trening
                </Gumb>
              </div>
            );
          }
          return (
            <Kartica key={brojDana} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-lg font-bold">{imeDana}</span>
                <button type="button" onClick={() => ukloniDan(dan)} className="text-sm text-red-300">
                  Ukloni dan
                </button>
              </div>
              <NazivDana dan={dan} onGreska={setGreska} />

              {dan.vjezbe.length === 0 ? (
                <p className="text-sm text-tekst-2">Još nema vježbi za ovaj dan.</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {dan.vjezbe.map((pv, j) => (
                    <li key={pv.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => pv.vjezba && setForma({ dan, vjezba: pv.vjezba, postojeca: pv })}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-rub bg-povrsina-2 p-2.5 text-left active:scale-[0.99]"
                      >
                        <SlicicaVjezbe
                          slikaUrl={pv.vjezba?.slika_url ?? null}
                          youtubeUrl={pv.vjezba?.youtube_url ?? null}
                          className="h-11 w-11"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {j + 1}. {pv.vjezba?.naziv ?? "Vježba"}
                          </p>
                          <p className="truncate text-sm text-tekst-2 tabular-nums">
                            {opisCilja(pv)}
                            {pv.napomena ? ` · ${pv.napomena}` : ""}
                          </p>
                        </div>
                      </button>
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          aria-label="Pomakni gore"
                          disabled={j === 0}
                          onClick={() => pomakni(dan, j, -1)}
                          className="flex h-8 w-9 items-center justify-center rounded-lg bg-povrsina-2 text-tekst-2 disabled:opacity-25"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          aria-label="Pomakni dolje"
                          disabled={j === dan.vjezbe.length - 1}
                          onClick={() => pomakni(dan, j, 1)}
                          className="flex h-8 w-9 items-center justify-center rounded-lg bg-povrsina-2 text-tekst-2 disabled:opacity-25"
                        >
                          ▼
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              <Gumb varijanta="sporedni" onClick={() => setOdabirZaDan(dan)}>
                + Dodaj vježbu
              </Gumb>
            </Kartica>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-rub pt-5">
        <Gumb varijanta="sporedni" onClick={arhiviraj}>
          {plan.arhiviran ? "Vrati iz arhive" : "Arhiviraj plan"}
        </Gumb>
        <Gumb varijanta="opasni" onClick={obrisiPlan}>
          Obriši plan
        </Gumb>
      </div>

      {odabirZaDan && (
        <OdabirVjezbe
          onZatvori={() => setOdabirZaDan(null)}
          onOdabir={(v) => {
            setForma({ dan: odabirZaDan, vjezba: v, postojeca: null });
            setOdabirZaDan(null);
          }}
        />
      )}

      {forma && (
        <PlanVjezbaForma
          vjezba={forma.vjezba}
          pocetno={forma.postojeca}
          onZatvori={() => setForma(null)}
          onSpremi={(p) => spremiVjezbu(forma, p)}
          onUkloni={forma.postojeca ? () => ukloniVjezbu(forma.postojeca!) : undefined}
        />
      )}
    </>
  );
}

/** Naziv dana (npr. „Noge”) – sprema se kad polje izgubi fokus. */
function NazivDana({ dan, onGreska }: { dan: PlanDan; onGreska: (g: string | null) => void }) {
  const [naziv, setNaziv] = useState(dan.naziv);
  const [spremljeno, setSpremljeno] = useState(dan.naziv);

  async function spremi() {
    const novi = naziv.trim().slice(0, 60);
    if (novi === spremljeno) return;
    const { error } = await supabase().from("plan_dani").update({ naziv: novi }).eq("id", dan.id);
    if (error) onGreska(prevediGresku(error.message));
    else setSpremljeno(novi);
  }

  return (
    <input
      aria-label="Naziv treninga"
      placeholder="Naziv treninga, npr. Noge ili Gornji dio"
      maxLength={60}
      value={naziv}
      onChange={(e) => setNaziv(e.target.value)}
      onBlur={spremi}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
    />
  );
}

function NazivPlanaForma({
  plan,
  onGotovo,
  onOdustani,
}: {
  plan: Plan;
  onGotovo: () => void;
  onOdustani: () => void;
}) {
  const [naziv, setNaziv] = useState(plan.naziv);
  const [opis, setOpis] = useState(plan.opis);
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);

  async function spremi(e: FormEvent) {
    e.preventDefault();
    if (!naziv.trim()) return setGreska("Upiši naziv plana.");
    setSalje(true);
    const { error } = await supabase()
      .from("planovi")
      .update({ naziv: naziv.trim().slice(0, 80), opis: opis.trim().slice(0, 1000) })
      .eq("id", plan.id);
    setSalje(false);
    if (error) return setGreska(prevediGresku(error.message));
    onGotovo();
  }

  return (
    <Kartica>
      <form onSubmit={spremi} className="flex flex-col gap-4">
        <Polje
          id="plan-naziv"
          oznaka="Naziv plana"
          maxLength={80}
          value={naziv}
          onChange={(e) => setNaziv(e.target.value)}
        />
        <PoljeTeksta
          id="plan-opis"
          oznaka="Opis (neobavezno)"
          rows={3}
          maxLength={1000}
          value={opis}
          onChange={(e) => setOpis(e.target.value)}
        />
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <div className="grid grid-cols-2 gap-3">
          <Gumb type="button" varijanta="sporedni" onClick={onOdustani}>
            Odustani
          </Gumb>
          <Gumb type="submit" disabled={salje}>
            {salje ? "…" : "Spremi"}
          </Gumb>
        </div>
      </form>
    </Kartica>
  );
}
