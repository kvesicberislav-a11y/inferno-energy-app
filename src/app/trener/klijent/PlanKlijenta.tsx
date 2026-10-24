"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ploca } from "@/components/Ploca";
import { Gumb, Kartica, Poruka } from "@/components/ui";
import { puniDatum } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";

type Dodjela = { planId: string; naziv: string; od: string } | null;
type TreningSazetak = { id: string; datum: string; naziv: string; zavrsen: boolean; serija: number };
type Podaci = { klijentId: string; dodjela: Dodjela; treninzi: TreningSazetak[] };

async function dohvati(klijentId: string): Promise<Podaci> {
  const sb = supabase();
  const [d, t] = await Promise.all([
    sb
      .from("dodjele_planova")
      .select("plan_id, od_datuma, plan:planovi(naziv)")
      .eq("klijent_id", klijentId)
      .is("do_datuma", null)
      .maybeSingle(),
    sb
      .from("treninzi")
      .select("id, datum, naziv, zavrsen, odradjene_serije(count)")
      .eq("klijent_id", klijentId)
      .order("datum", { ascending: false })
      .limit(5),
  ]);
  const plan = d.data?.plan as { naziv?: string } | { naziv?: string }[] | null | undefined;
  const nazivPlana = Array.isArray(plan) ? plan[0]?.naziv : plan?.naziv;
  return {
    klijentId,
    dodjela: d.data
      ? { planId: String(d.data.plan_id), naziv: String(nazivPlana ?? "Plan"), od: String(d.data.od_datuma) }
      : null,
    treninzi: (t.data ?? []).map((r) => ({
      id: String(r.id),
      datum: String(r.datum),
      naziv: String(r.naziv ?? ""),
      zavrsen: Boolean(r.zavrsen),
      serija: Number((r.odradjene_serije as { count: number }[] | null)?.[0]?.count ?? 0),
    })),
  };
}

/** Trener dodjeljuje plan treninga klijentu i vidi zadnje treninge. */
export function PlanKlijenta({ klijentId }: { klijentId: string }) {
  const [podaci, setPodaci] = useState<Podaci | null>(null);
  const [verzija, setVerzija] = useState(0);
  const [odabir, setOdabir] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  useEffect(() => {
    let aktivno = true;
    dohvati(klijentId).then((r) => {
      if (aktivno) setPodaci(r);
    });
    return () => {
      aktivno = false;
    };
  }, [klijentId, verzija]);

  async function dodijeli(planId: string | null) {
    setGreska(null);
    const { error } = await supabase().rpc("dodijeli_plan", { p_klijent: klijentId, p_plan: planId });
    if (error) return setGreska(prevediGresku(error.message));
    setOdabir(false);
    setVerzija((v) => v + 1);
  }

  const spremno = podaci?.klijentId === klijentId;
  const dodjela = spremno ? podaci.dodjela : null;

  return (
    <>
      <Kartica className="flex flex-col gap-3">
        <p className="text-sm font-medium text-tekst-2">Plan treninga</p>
        {!spremno ? (
          <p className="text-tekst-2">Učitavam…</p>
        ) : dodjela ? (
          <>
            <Link href={`/trener/plan?id=${dodjela.planId}`} className="text-xl font-bold text-tekst">
              {dodjela.naziv} <span className="text-tekst-2">›</span>
            </Link>
            <p className="text-sm text-tekst-2">Dodijeljen {puniDatum(dodjela.od)}</p>
          </>
        ) : (
          <p className="text-lg font-semibold">Plan još nije dodijeljen.</p>
        )}
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <div className={`grid gap-3 ${dodjela ? "grid-cols-2" : "grid-cols-1"}`}>
          <Gumb varijanta={dodjela ? "sporedni" : "glavni"} onClick={() => setOdabir(true)}>
            {dodjela ? "Promijeni" : "Dodijeli plan"}
          </Gumb>
          {dodjela && (
            <Gumb
              varijanta="opasni"
              onClick={() => {
                if (window.confirm("Ukloniti plan ovom klijentu?")) dodijeli(null);
              }}
            >
              Ukloni
            </Gumb>
          )}
        </div>

        {spremno && podaci.treninzi.length > 0 && (
          <div className="mt-2 flex flex-col gap-2 border-t border-rub pt-3">
            <p className="text-sm font-medium text-tekst-2">Zadnji treninzi</p>
            {podaci.treninzi.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {puniDatum(t.datum)} · {t.naziv || "Trening"}
                </span>
                <span className={t.zavrsen ? "text-emerald-300" : "text-tekst-2"}>
                  {t.serija} serija {t.zavrsen ? "✓" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </Kartica>

      {odabir && (
        <OdabirPlana
          trenutni={dodjela?.planId ?? null}
          onOdabir={dodijeli}
          onZatvori={() => setOdabir(false)}
        />
      )}
    </>
  );
}

function OdabirPlana({
  trenutni,
  onOdabir,
  onZatvori,
}: {
  trenutni: string | null;
  onOdabir: (id: string) => void;
  onZatvori: () => void;
}) {
  const [planovi, setPlanovi] = useState<{ id: string; naziv: string; dana: number }[] | null>(null);

  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("planovi")
      .select("id, naziv, plan_dani(id)")
      .eq("arhiviran", false)
      .order("naziv")
      .then(({ data }) => {
        if (!aktivno) return;
        setPlanovi(
          (data ?? []).map((p) => ({
            id: String(p.id),
            naziv: String(p.naziv),
            dana: (p.plan_dani as unknown[] | null)?.length ?? 0,
          })),
        );
      });
    return () => {
      aktivno = false;
    };
  }, []);

  return (
    <Ploca naslov="Odaberi plan" onZatvori={onZatvori}>
      {planovi === null ? (
        <p className="text-tekst-2">Učitavam…</p>
      ) : planovi.length === 0 ? (
        <Poruka>
          Još nema planova.{" "}
          <Link href="/trener/planovi" className="font-semibold text-vatra">
            Napravi plan
          </Link>
        </Poruka>
      ) : (
        <div className="flex flex-col gap-2">
          {planovi.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={p.id === trenutni}
              onClick={() => onOdabir(p.id)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-rub bg-povrsina-2 p-4 text-left active:scale-[0.99] disabled:opacity-50"
            >
              <div>
                <p className="font-semibold">{p.naziv}</p>
                <p className="text-sm text-tekst-2">
                  {p.dana} {p.dana === 1 ? "dan" : "dana"} tjedno
                </p>
              </div>
              {p.id === trenutni && <span className="text-sm text-tekst-2">trenutni</span>}
            </button>
          ))}
        </div>
      )}
    </Ploca>
  );
}
