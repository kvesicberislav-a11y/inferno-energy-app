"use client";

import { useState } from "react";
import { Gumb, Kartica, Poruka, Ucitavanje } from "@/components/ui";
import { SlicicaVjezbe } from "@/components/vjezbe/VideoVjezbe";
import { danMjesec, danasZagreb, dodajDane, opisDana, ponedjeljak } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import {
  DANI,
  DANI_KRATKO,
  danUTjednu,
  nazivDana,
  opisCilja,
  poSkupinama,
  serijaZaMjesto,
  tjedanCiklusa,
  type PlanVjezba,
} from "@/lib/treninzi";
import { useTreningKlijenta } from "./useTreningKlijenta";
import { VjezbaUnos } from "./VjezbaUnos";

export function DanasnjiTrening({ klijentId }: { klijentId: string }) {
  const danas = danasZagreb();
  const danasBroj = danUTjednu(danas);
  const pon = ponedjeljak(danas);
  const { ucitano, plan, treninzi, zamjene, greska, osvjezi } = useTreningKlijenta(klijentId);
  const [odabraniDanId, setOdabraniDanId] = useState<string | null>(null);
  const [biranje, setBiranje] = useState(false);
  const [otvorena, setOtvorena] = useState<PlanVjezba | null>(null);
  const [zavrsava, setZavrsava] = useState(false);
  const [greskaRadnje, setGreskaRadnje] = useState<string | null>(null);

  const mojeVjezbeLink = (
    <Link href="/klijent/vjezbe" className="shrink-0 text-sm font-semibold text-vatra">
      Moje vježbe ›
    </Link>
  );

  if (!ucitano) return <Ucitavanje />;
  if (greska) return <Poruka tip="greska">{greska}</Poruka>;
  if (!plan) {
    return (
      <>
        <Kartica>
          <p className="text-lg font-semibold">Još nemaš plan treninga.</p>
          <p className="mt-1 text-tekst-2">Kad ti ga trener dodijeli, ovdje ćeš vidjeti današnji trening.</p>
        </Kartica>
        <div className="self-end">{mojeVjezbeLink}</div>
      </>
    );
  }

  // program se vrti u ciklusu: ovaj tjedan vrijede samo dani tog tjedna ciklusa
  const tjedan = tjedanCiklusa(plan, danas);
  const daniTjedna = plan.dani.filter((d) => d.tjedan === tjedan);
  const planDanas = daniTjedna.find((d) => d.dan_u_tjednu === danasBroj) ?? null;
  const dan = daniTjedna.find((d) => d.id === odabraniDanId) ?? planDanas;
  const trening = dan ? (treninzi.find((t) => t.datum === danas && t.plan_dan_id === dan.id) ?? null) : null;

  async function zavrsi() {
    if (!trening) return;
    setZavrsava(true);
    setGreskaRadnje(null);
    const { error } = await supabase()
      .from("treninzi")
      .update({ zavrsen: true, zavrseno_at: new Date().toISOString() })
      .eq("id", trening.id);
    setZavrsava(false);
    if (error) return setGreskaRadnje(prevediGresku(error.message));
    osvjezi();
  }

  const odabirTreninga = (
    <div className="flex flex-col gap-2">
      {daniTjedna.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => {
            setOdabraniDanId(d.id);
            setBiranje(false);
          }}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-rub bg-povrsina-2 px-4 py-3 text-left active:scale-[0.99]"
        >
          <span className="font-semibold">{nazivDana(d)}</span>
          <span className="text-sm text-tekst-2">
            {DANI[d.dan_u_tjednu - 1]} · {d.vjezbe.length} vježbi
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      {/* Tjedan u jednom redu */}
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, i) => {
          const datum = dodajDane(pon, i);
          const imaTrening = daniTjedna.some((d) => d.dan_u_tjednu === i + 1);
          const odraden = treninzi.some((t) => t.datum === datum && (t.zavrsen || t.serije.length > 0));
          const jeDanas = datum === danas;
          return (
            <div
              key={datum}
              className={`flex flex-col items-center gap-0.5 rounded-xl border py-2 ${
                jeDanas ? "border-vatra bg-vatra/10" : "border-rub bg-povrsina"
              }`}
            >
              <span className="text-xs text-tekst-2">{DANI_KRATKO[i]}</span>
              <span className="text-sm font-semibold tabular-nums">{danMjesec(datum).split(".")[0]}</span>
              <span className={`h-4 text-xs ${odraden ? "text-emerald-400" : "text-vatra"}`}>
                {odraden ? "✓" : imaTrening ? "●" : ""}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-tekst-2">
          {plan.naziv}
          {plan.ciklus_tjedana > 1 ? ` · ${tjedan}. tjedan` : ""} · {opisDana(danas)}
        </p>
        {mojeVjezbeLink}
      </div>

      {!dan ? (
        <Kartica className="flex flex-col gap-3">
          <p className="text-xl font-bold">Danas je dan odmora 😌</p>
          <p className="text-tekst-2">Želiš ipak trenirati? Odaberi trening:</p>
          {odabirTreninga}
        </Kartica>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-tekst-2">{dan.id === planDanas?.id ? "Današnji trening" : "Odabrani trening"}</p>
              <h2 className="text-2xl font-bold">{nazivDana(dan)}</h2>
            </div>
            {daniTjedna.length > 1 && (
              <button type="button" onClick={() => setBiranje((b) => !b)} className="pb-1 text-sm font-medium text-vatra">
                {biranje ? "Zatvori" : "Drugi trening"}
              </button>
            )}
          </div>

          {biranje && odabirTreninga}

          {dan.vjezbe.length === 0 ? (
            <Poruka>Trener još nije dodao vježbe za ovaj dan.</Poruka>
          ) : (
            <div className="flex flex-col gap-2">
              {poSkupinama(dan).flatMap(({ skupina, vjezbe }, g, skupine) => {
                const prije = skupine.slice(0, g).reduce((n, s) => n + s.vjezbe.length, 0);
                const naslov =
                  vjezbe.length > 0 && (dan.skupine.length > 0 || skupine.length > 1) ? (
                    <p key={`n-${skupina}`} className="pt-1 text-xs font-bold tracking-wide text-tekst-2 uppercase">
                      {skupina}
                    </p>
                  ) : null;
                return [naslov, ...vjezbe.map((pv, j) => karticaVjezbe(pv, prije + j))];
              })}
            </div>
          )}

          {greskaRadnje && <Poruka tip="greska">{greskaRadnje}</Poruka>}

          {trening?.zavrsen ? (
            <Poruka tip="uspjeh">Trening je završen. Bravo! 💪</Poruka>
          ) : trening ? (
            <Gumb onClick={zavrsi} disabled={zavrsava}>
              {zavrsava ? "…" : "Završi trening"}
            </Gumb>
          ) : (
            dan.vjezbe.length > 0 && (
              <p className="text-center text-sm text-tekst-2">
                Dodirni vježbu za video i upis odrađenih serija.
              </p>
            )
          )}
        </>
      )}

      {otvorena && dan && (
        <VjezbaUnos
          key={`${otvorena.id}|${zamjene[otvorena.id]?.id ?? ""}`}
          klijentId={klijentId}
          pv={otvorena}
          zamjena={zamjene[otvorena.id] ?? null}
          dan={dan}
          datum={danas}
          trening={trening}
          onPromjena={osvjezi}
          onZatvori={() => setOtvorena(null)}
        />
      )}
    </>
  );

  function karticaVjezbe(pv: PlanVjezba, i: number) {
    const zamjena = zamjene[pv.id] ?? null;
    const vjezba = zamjena ?? pv.vjezba;
    const odradeno = trening?.serije.filter((s) => serijaZaMjesto(s, pv, zamjena?.id ?? pv.vjezba_id)).length ?? 0;
    const gotovo = odradeno >= pv.serije;
    return (
      <button
        key={pv.id}
        type="button"
        onClick={() => setOtvorena(pv)}
        className={`flex w-full items-center gap-3 rounded-2xl border bg-povrsina p-3 text-left active:scale-[0.99] ${
          gotovo ? "border-emerald-500/40" : "border-rub"
        }`}
      >
        <SlicicaVjezbe slikaUrl={vjezba?.slika_url ?? null} youtubeUrl={vjezba?.youtube_url ?? null} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {i + 1}. {vjezba?.naziv ?? "Vježba"}
          </p>
          <p className="truncate text-sm text-tekst-2 tabular-nums">{opisCilja(zamjena ? { ...pv, kg: null } : pv)}</p>
          {zamjena && <p className="truncate text-xs text-amber-200">umjesto: {pv.vjezba?.naziv ?? "vježba iz plana"}</p>}
        </div>
        <span
          className={`shrink-0 rounded-xl px-2.5 py-1 text-sm font-semibold tabular-nums ${
            gotovo ? "bg-emerald-500/20 text-emerald-300" : "bg-povrsina-2 text-tekst-2"
          }`}
        >
          {gotovo ? "✓" : `${odradeno}/${pv.serije}`}
        </span>
      </button>
    );
  }
}
