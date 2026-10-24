"use client";

import { useState } from "react";
import { LinijskiGraf, StupciGraf, TablicaPodataka, type Tocka } from "@/components/grafovi/Grafovi";
import { kompaktno } from "@/components/grafovi/osi";
import { Cip, Kartica, Poruka, Ucitavanje } from "@/components/ui";
import { brojDana, danMjesec, danasZagreb, datumZagreb, dodajDane, ponedjeljak } from "@/lib/datum";
import { ciljZaDan, formatG, formatKcal } from "@/lib/makroi";
import { MJERE, format1, type KljucMjere, type Mjerenje } from "@/lib/tijelo";
import { danUTjednu } from "@/lib/treninzi";
import { useStatistika, type DanMakroa, type Statistika } from "./useStatistika";

const RAZDOBLJA = [
  { dana: 30, oznaka: "30 dana" },
  { dana: 90, oznaka: "90 dana" },
  { dana: 180, oznaka: "6 mjeseci" },
] as const;

const MAKROI = [
  { kljuc: "kcal", oznaka: "Kalorije", jedinica: "kcal", format: formatKcal },
  { kljuc: "proteini", oznaka: "Proteini", jedinica: "g", format: (n: number) => formatG(Math.round(n)) },
  { kljuc: "ugljikohidrati", oznaka: "UH", jedinica: "g", format: (n: number) => formatG(Math.round(n)) },
  { kljuc: "masti", oznaka: "Masti", jedinica: "g", format: (n: number) => formatG(Math.round(n)) },
] as const;
type KljucMakroa = (typeof MAKROI)[number]["kljuc"];

function dani(od: string, doDana: string) {
  const n = brojDana(od, doDana);
  return Array.from({ length: Math.max(0, n) }, (_, i) => dodajDane(od, i));
}

function tjedni(od: string, doDana: string) {
  const rez: string[] = [];
  for (let t = ponedjeljak(od); t <= doDana; t = dodajDane(t, 7)) rez.push(t);
  return rez;
}

export function GrafoviNapretka({
  klijentId,
  mjerenja,
  kreirano,
}: {
  klijentId: string;
  mjerenja: Mjerenje[];
  kreirano: string;
}) {
  const danas = danasZagreb();
  const [dana, setDana] = useState<number>(30);
  const [mjera, setMjera] = useState<KljucMjere>("tezina_kg");
  const [makro, setMakro] = useState<KljucMakroa>("kcal");
  const od = dodajDane(danas, -(dana - 1));
  const { statistika, osvjezava } = useStatistika(klijentId, od, danas);

  const mjeraInfo = MJERE.find((m) => m.kljuc === mjera)!;
  const tockeMjere: Tocka[] = mjerenja
    .filter((m) => m.datum >= od && m[mjera] !== null)
    .map((m) => ({ kljuc: m.datum, oznaka: danMjesec(m.datum), vrijednost: m[mjera] }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-tekst-2">Razdoblje:</span>
        {RAZDOBLJA.map((r) => (
          <Cip key={r.dana} aktivan={dana === r.dana} onClick={() => setDana(r.dana)}>
            {r.oznaka}
          </Cip>
        ))}
      </div>

      {/* Mjere kroz vrijeme */}
      <Kartica className="flex flex-col gap-3">
        <div>
          <h3 className="text-lg font-semibold">{mjeraInfo.oznaka} kroz vrijeme</h3>
          <p className="text-sm text-tekst-2">
            {tockeMjere.length
              ? `zadnje: ${format1(tockeMjere[tockeMjere.length - 1].vrijednost!)} ${mjeraInfo.jedinica}`
              : "nema mjerenja u ovom razdoblju"}
          </p>
        </div>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {MJERE.map((m) => (
            <Cip key={m.kljuc} aktivan={mjera === m.kljuc} onClick={() => setMjera(m.kljuc)}>
              {m.oznaka}
            </Cip>
          ))}
        </div>
        {tockeMjere.length >= 2 ? (
          <>
            <LinijskiGraf
              tocke={tockeMjere}
              format={format1}
              jedinica={mjeraInfo.jedinica}
              opis={`${mjeraInfo.oznaka} kroz vrijeme`}
            />
            <TablicaPodataka
              zaglavlje={["Datum", `${mjeraInfo.oznaka} (${mjeraInfo.jedinica})`]}
              redovi={[...tockeMjere].reverse().map((t) => [t.oznaka, format1(t.vrijednost!)])}
            />
          </>
        ) : (
          <Poruka>Za graf trebaju barem 2 mjerenja u odabranom razdoblju.</Poruka>
        )}
      </Kartica>

      {statistika === null ? (
        <Ucitavanje />
      ) : (
        <div className={`flex flex-col gap-3 transition-opacity ${osvjezava ? "opacity-50" : ""}`}>
          {statistika.greska && <Poruka tip="greska">{statistika.greska}</Poruka>}
          <GrafPrehrane statistika={statistika} od={od} danas={danas} dana={dana} makro={makro} setMakro={setMakro} />
          <GrafVolumena statistika={statistika} od={od} danas={danas} />
          <Pridrzavanje statistika={statistika} od={od} danas={danas} kreirano={kreirano} />
        </div>
      )}
    </div>
  );
}

function GrafPrehrane({
  statistika,
  od,
  danas,
  dana,
  makro,
  setMakro,
}: {
  statistika: Statistika;
  od: string;
  danas: string;
  dana: number;
  makro: KljucMakroa;
  setMakro: (k: KljucMakroa) => void;
}) {
  const info = MAKROI.find((m) => m.kljuc === makro)!;
  const poDanu = new Map(statistika.makroi.map((d) => [d.datum, d]));
  const tjedno = dana > 60;

  const tocke: Tocka[] = tjedno
    ? tjedni(od, danas).map((t) => {
        const daniTjedna = dani(t < od ? od : t, dodajDane(t, 6) > danas ? danas : dodajDane(t, 6));
        const sUnosom = daniTjedna.map((d) => poDanu.get(d)).filter((d): d is DanMakroa => d !== undefined);
        const prosjek = sUnosom.length ? sUnosom.reduce((s, d) => s + d[makro], 0) / sUnosom.length : null;
        const cilj = ciljZaDan(statistika.ciljevi, daniTjedna[daniTjedna.length - 1] ?? t);
        return { kljuc: t, oznaka: danMjesec(t), vrijednost: prosjek, cilj: cilj ? cilj[makro] : null };
      })
    : dani(od, danas).map((d) => {
        const cilj = ciljZaDan(statistika.ciljevi, d);
        return {
          kljuc: d,
          oznaka: danMjesec(d),
          vrijednost: poDanu.get(d)?.[makro] ?? null,
          cilj: cilj ? cilj[makro] : null,
        };
      });

  const sVrijednoscu = tocke.filter((t) => t.vrijednost !== null);
  const prosjek = sVrijednoscu.length
    ? sVrijednoscu.reduce((s, t) => s + (t.vrijednost ?? 0), 0) / sVrijednoscu.length
    : null;
  const zadnjiCilj = [...tocke].reverse().find((t) => t.cilj)?.cilj ?? null;

  return (
    <Kartica className="flex flex-col gap-3">
      <div>
        <h3 className="text-lg font-semibold">Prehrana {tjedno ? "(tjedni prosjek)" : "po danu"}</h3>
        <p className="text-sm text-tekst-2">
          {prosjek !== null
            ? `prosjek ${info.format(prosjek)} ${info.jedinica}${zadnjiCilj ? ` · cilj ${info.format(zadnjiCilj)} ${info.jedinica}` : ""}`
            : "nema unosa u ovom razdoblju"}
        </p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {MAKROI.map((m) => (
          <Cip key={m.kljuc} aktivan={makro === m.kljuc} onClick={() => setMakro(m.kljuc)}>
            {m.oznaka}
          </Cip>
        ))}
      </div>
      <StupciGraf tocke={tocke} format={info.format} jedinica={info.jedinica} opis={`${info.oznaka} po danu u odnosu na cilj`} />
      <TablicaPodataka
        zaglavlje={[tjedno ? "Tjedan od" : "Datum", `${info.oznaka} (${info.jedinica})`, "Cilj"]}
        redovi={[...tocke]
          .reverse()
          .map((t) => [t.oznaka, t.vrijednost !== null ? info.format(t.vrijednost) : "—", t.cilj ? info.format(t.cilj) : "—"])}
      />
    </Kartica>
  );
}

function GrafVolumena({ statistika, od, danas }: { statistika: Statistika; od: string; danas: string }) {
  const poTjednu = new Map(statistika.volumen.map((v) => [v.tjedan, v]));
  const tocke: Tocka[] = tjedni(od, danas).map((t) => ({
    kljuc: t,
    oznaka: danMjesec(t),
    vrijednost: poTjednu.get(t)?.volumen ?? null,
  }));
  const ukupno = statistika.volumen.reduce((s, v) => s + v.volumen, 0);

  return (
    <Kartica className="flex flex-col gap-3">
      <div>
        <h3 className="text-lg font-semibold">Volumen treninga po tjednu</h3>
        <p className="text-sm text-tekst-2">kg × ponavljanja · ukupno {kompaktno(ukupno)} kg</p>
      </div>
      {statistika.volumen.length === 0 ? (
        <Poruka>Još nema odrađenih serija u ovom razdoblju.</Poruka>
      ) : (
        <>
          <StupciGraf
            tocke={tocke}
            format={(n) => Math.round(n).toLocaleString("hr-HR")}
            jedinica="kg"
            opis="Volumen treninga po tjednu"
          />
          <TablicaPodataka
            zaglavlje={["Tjedan od", "Volumen (kg)", "Serija", "Treninga"]}
            redovi={[...tocke].reverse().map((t) => {
              const v = poTjednu.get(t.kljuc);
              return [
                t.oznaka,
                v ? Math.round(v.volumen).toLocaleString("hr-HR") : "—",
                v ? String(v.serija) : "—",
                v ? String(v.treninga) : "—",
              ];
            })}
          />
        </>
      )}
    </Kartica>
  );
}

function Mjerac({ oznaka, posto, opis }: { oznaka: string; posto: number | null; opis: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-rub bg-povrsina-2 p-3">
      <span className="text-xs font-medium text-tekst-2">{oznaka}</span>
      <span className="text-3xl font-bold">{posto !== null ? `${Math.round(posto)} %` : "—"}</span>
      <div className="h-2 overflow-hidden rounded-full bg-rub">
        <div className="h-full rounded-full bg-vatra" style={{ width: `${Math.min(100, posto ?? 0)}%` }} />
      </div>
      <span className="text-xs text-tekst-2">{opis}</span>
    </div>
  );
}

function Pridrzavanje({
  statistika,
  od,
  danas,
  kreirano,
}: {
  statistika: Statistika;
  od: string;
  danas: string;
  kreirano: string;
}) {
  const pocetak = [od, datumZagreb(kreirano)].sort()[1];
  const razdoblje = pocetak <= danas ? dani(pocetak, danas) : [];

  const daniSObrokom = new Set(statistika.makroi.map((d) => d.datum));
  const sUnosom = razdoblje.filter((d) => daniSObrokom.has(d)).length;
  const prehrana = razdoblje.length ? (sUnosom / razdoblje.length) * 100 : null;

  const planirani = razdoblje.filter((d) =>
    statistika.dodjele.some(
      (dj) => dj.od <= d && (dj.do === null || dj.do > d) && dj.daniUTjednu.includes(danUTjednu(d)),
    ),
  ).length;
  const odradeni = new Set(statistika.treninzi.filter((t) => t.odraden && t.datum >= pocetak).map((t) => t.datum)).size;
  const treninzi = planirani ? Math.min(100, (odradeni / planirani) * 100) : null;

  return (
    <Kartica className="flex flex-col gap-3">
      <div>
        <h3 className="text-lg font-semibold">Pridržavanje</h3>
        <p className="text-sm text-tekst-2">
          od {danMjesec(pocetak)} do danas ({razdoblje.length} dana)
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Mjerac oznaka="Unos prehrane" posto={prehrana} opis={`${sUnosom} od ${razdoblje.length} dana`} />
        <Mjerac
          oznaka="Odrađeni treninzi"
          posto={treninzi}
          opis={planirani ? `${Math.min(odradeni, planirani)} od ${planirani} planiranih` : "nema plana u razdoblju"}
        />
      </div>
    </Kartica>
  );
}
