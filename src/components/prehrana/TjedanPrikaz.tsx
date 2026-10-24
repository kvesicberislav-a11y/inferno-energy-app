"use client";

import { useState } from "react";
import { Kartica, Poruka, Ucitavanje } from "@/components/ui";
import { danMjesec, danasZagreb, dodajDane, kratkiDan, ponedjeljak } from "@/lib/datum";
import { ciljZaDan, formatG, formatKcal, zbroj } from "@/lib/makroi";
import { usePrehrana } from "./usePrehrana";

export function TjedanPrikaz({
  klijentId,
  odaberiDan,
}: {
  klijentId: string;
  odaberiDan: (dan: string) => void;
}) {
  const danas = danasZagreb();
  const [pon, setPon] = useState(() => ponedjeljak(danasZagreb()));
  const ned = dodajDane(pon, 6);
  const { obroci, ciljevi, greska } = usePrehrana(klijentId, pon, ned);
  const dani = Array.from({ length: 7 }, (_, i) => dodajDane(pon, i));

  const naslov = (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        aria-label="Prethodni tjedan"
        onClick={() => setPon(dodajDane(pon, -7))}
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rub bg-povrsina text-2xl text-tekst-2 active:scale-95"
      >
        ‹
      </button>
      <div className="flex flex-col items-center">
        <span className="text-lg font-bold">
          {pon === ponedjeljak(danas) ? "Ovaj tjedan" : "Tjedan"}
        </span>
        <span className="text-sm text-tekst-2">
          {danMjesec(pon)} – {danMjesec(ned)}
        </span>
      </div>
      <button
        type="button"
        aria-label="Sljedeći tjedan"
        onClick={() => setPon(dodajDane(pon, 7))}
        disabled={dodajDane(pon, 7) > danas}
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rub bg-povrsina text-2xl text-tekst-2 active:scale-95 disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );

  if (obroci === null || ciljevi === null) {
    return (
      <>
        {naslov}
        {greska ? <Poruka tip="greska">{greska}</Poruka> : <Ucitavanje />}
      </>
    );
  }

  const poDanu = dani.map((dan) => {
    const obrociDana = obroci.filter((o) => o.datum === dan);
    return {
      dan,
      buduci: dan > danas,
      imaUnos: obrociDana.length > 0,
      ukupno: zbroj(obrociDana),
      cilj: ciljZaDan(ciljevi, dan),
    };
  });
  const sUnosom = poDanu.filter((d) => d.imaUnos);
  const proteklih = poDanu.filter((d) => !d.buduci).length;
  const prosjek = (kljuc: "kcal" | "proteini" | "ugljikohidrati" | "masti") =>
    sUnosom.length ? sUnosom.reduce((s, d) => s + d.ukupno[kljuc], 0) / sUnosom.length : 0;

  return (
    <>
      {naslov}
      {greska && <Poruka tip="greska">{greska}</Poruka>}

      <Kartica className="flex flex-col gap-2">
        <p className="text-sm text-tekst-2">Prosjek po danu (dani s unosom)</p>
        {sUnosom.length === 0 ? (
          <p className="text-lg font-semibold">Ovaj tjedan još nema unosa.</p>
        ) : (
          <>
            <p className="text-3xl font-bold tabular-nums">
              {formatKcal(prosjek("kcal"))} <span className="text-base font-medium text-tekst-2">kcal</span>
            </p>
            <p className="text-sm tabular-nums text-tekst-2">
              P {formatG(Math.round(prosjek("proteini")))} · UH{" "}
              {formatG(Math.round(prosjek("ugljikohidrati")))} · M {formatG(Math.round(prosjek("masti")))} g
            </p>
          </>
        )}
        <p className="text-sm text-tekst-2">
          Unos u {sUnosom.length} od {proteklih} dana
        </p>
      </Kartica>

      <div className="flex flex-col gap-2">
        {poDanu.map((d) => {
          const ciljKcal = d.cilj?.kcal ?? 0;
          const posto = ciljKcal > 0 ? Math.min(100, (d.ukupno.kcal / ciljKcal) * 100) : 0;
          const preko = ciljKcal > 0 && d.ukupno.kcal > ciljKcal;
          return (
            <button
              key={d.dan}
              type="button"
              disabled={d.buduci}
              onClick={() => odaberiDan(d.dan)}
              className={`flex w-full flex-col gap-2 rounded-2xl border bg-povrsina px-4 py-3 text-left active:scale-[0.99] disabled:opacity-40 ${
                d.dan === danas ? "border-vatra/60" : "border-rub"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">
                  {kratkiDan(d.dan)} <span className="font-normal text-tekst-2">{danMjesec(d.dan)}</span>
                </span>
                <span className="tabular-nums">
                  {d.imaUnos ? (
                    <>
                      <strong>{formatKcal(d.ukupno.kcal)}</strong>
                      {ciljKcal > 0 && <span className="text-tekst-2"> / {formatKcal(ciljKcal)}</span>} kcal
                    </>
                  ) : (
                    <span className="text-tekst-2">{d.buduci ? "" : "bez unosa"}</span>
                  )}
                </span>
              </div>
              {ciljKcal > 0 && (
                <div className="h-2 overflow-hidden rounded-full bg-povrsina-2">
                  <div
                    className={`h-full rounded-full bg-linear-to-r ${
                      preko ? "from-red-500 to-red-600" : "from-vatra to-vatra-2"
                    }`}
                    style={{ width: `${posto}%` }}
                  />
                </div>
              )}
              {d.imaUnos && (
                <span className="text-xs tabular-nums text-tekst-2">
                  P {formatG(Math.round(d.ukupno.proteini))} · UH {formatG(Math.round(d.ukupno.ugljikohidrati))} · M{" "}
                  {formatG(Math.round(d.ukupno.masti))} g
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
