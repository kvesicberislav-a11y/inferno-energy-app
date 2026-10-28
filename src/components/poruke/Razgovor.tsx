"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Kartica, Poruka as Obavijest, Ucitavanje } from "@/components/ui";
import { datumZagreb, vrijemeZagreb } from "@/lib/datum";
import {
  dohvatiPoruke,
  opisDanaPoruke,
  oznaciProcitano,
  posaljiPoruku,
  uPoruku,
  type Poruka,
} from "@/lib/poruke";
import { supabase } from "@/lib/supabase/client";

type Stanje = { klijentId: string; poruke: Poruka[]; greska: string | null };

/** Dodaje nove i osvježava postojeće poruke (po id-u), poredane po vremenu. */
function spoji(stare: Poruka[], nove: Poruka[]) {
  const mapa = new Map(stare.map((p) => [p.id, p]));
  for (const p of nove) mapa.set(p.id, p);
  return [...mapa.values()].sort((a, b) => a.kreirano.localeCompare(b.kreirano));
}

/** Dopisivanje klijenta i trenera (jedan razgovor po klijentu). */
export function Razgovor({ klijentId, jaSamTrener }: { klijentId: string; jaSamTrener: boolean }) {
  const [stanje, setStanje] = useState<Stanje | null>(null);
  const [tekst, setTekst] = useState("");
  const [salje, setSalje] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const dno = useRef<HTMLDivElement>(null);
  const polje = useRef<HTMLTextAreaElement>(null);

  // Učitaj razgovor, a nove poruke primaj odmah (bez osvježavanja stranice)
  useEffect(() => {
    let aktivno = true;
    const ucitaj = () =>
      dohvatiPoruke(klijentId).then((r) => {
        if (aktivno) setStanje((s) => ({ klijentId, poruke: s?.klijentId === klijentId ? spoji(s.poruke, r.poruke) : r.poruke, greska: r.greska }));
      });
    void ucitaj();

    const sb = supabase();
    const kanal = sb
      .channel(`razgovor-${klijentId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poruke", filter: `klijent_id=eq.${klijentId}` },
        (promjena) => {
          const red = promjena.new as Record<string, unknown> | undefined;
          if (!aktivno || !red || !red.id) return;
          const nova = uPoruku(red);
          setStanje((s) => (s && s.klijentId === klijentId ? { ...s, poruke: spoji(s.poruke, [nova]) } : s));
        },
      )
      .subscribe();

    // Povratak u aplikaciju: dohvati propušteno i označi pročitanim
    const naVidljivost = () => {
      if (document.visibilityState !== "visible") return;
      void ucitaj();
      void oznaciProcitano(klijentId);
    };
    document.addEventListener("visibilitychange", naVidljivost);
    return () => {
      aktivno = false;
      void sb.removeChannel(kanal);
      document.removeEventListener("visibilitychange", naVidljivost);
    };
  }, [klijentId]);

  const poruke = stanje?.klijentId === klijentId ? stanje.poruke : null;
  const neprocitanih = poruke?.filter((p) => p.odTrenera !== jaSamTrener && !p.procitano).length ?? 0;

  // Otvoren razgovor = pročitane poruke
  useEffect(() => {
    if (neprocitanih > 0 && document.visibilityState === "visible") void oznaciProcitano(klijentId);
  }, [neprocitanih, klijentId]);

  // Uvijek prikaži najnoviju poruku
  const broj = poruke?.length ?? 0;
  const prviPut = useRef(true);
  useEffect(() => {
    if (!broj) return;
    dno.current?.scrollIntoView({ block: "end", behavior: prviPut.current ? "auto" : "smooth" });
    prviPut.current = false;
  }, [broj]);

  async function posalji(e: FormEvent) {
    e.preventDefault();
    const t = tekst.trim();
    if (!t || salje) return;
    setSalje(true);
    setGreska(null);
    const r = await posaljiPoruku(t, jaSamTrener ? klijentId : undefined);
    setSalje(false);
    if ("greska" in r) {
      setGreska(r.greska);
      return;
    }
    setTekst("");
    if (polje.current) polje.current.style.height = "";
    setStanje((s) => (s && s.klijentId === klijentId ? { ...s, poruke: spoji(s.poruke, r.poruke) } : s));
  }

  if (!poruke) return <Ucitavanje />;

  // Grupiranje po danima
  const dani: { dan: string; opis: string; poruke: Poruka[] }[] = [];
  for (const p of poruke) {
    const dan = datumZagreb(p.kreirano);
    const zadnji = dani[dani.length - 1];
    if (zadnji?.dan === dan) zadnji.poruke.push(p);
    else dani.push({ dan, opis: opisDanaPoruke(p.kreirano), poruke: [p] });
  }
  const zadnja = poruke[poruke.length - 1];
  const zadnjaMoja = zadnja && zadnja.odTrenera === jaSamTrener ? zadnja : null;

  return (
    <>
      {stanje?.greska && <Obavijest tip="greska">{stanje.greska}</Obavijest>}

      {poruke.length === 0 ? (
        <Kartica className="text-center text-tekst-2">
          Još nema poruka. {jaSamTrener ? "Napiši klijentu prvu poruku." : "Ovdje se možeš dopisivati s trenerom."}
        </Kartica>
      ) : (
        <div className="flex flex-col gap-1.5">
          {dani.map((d) => (
            <div key={d.dan} className="flex flex-col gap-1.5">
              <p className="my-2 text-center text-xs font-medium text-tekst-2">{d.opis}</p>
              {d.poruke.map((p) => {
                const moja = p.odTrenera === jaSamTrener;
                return (
                  <div key={p.id} className={`flex ${moja ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[82%] rounded-3xl px-4 py-2.5 ${
                        moja
                          ? "rounded-br-lg bg-linear-to-r from-vatra to-vatra-2 text-white"
                          : "rounded-bl-lg border border-rub bg-povrsina-2 text-tekst"
                      }`}
                    >
                      <p className="whitespace-pre-wrap wrap-break-word text-base">{p.tekst}</p>
                      <p className={`mt-0.5 text-right text-[11px] ${moja ? "text-white/75" : "text-tekst-2"}`}>
                        {vrijemeZagreb(p.kreirano)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {zadnjaMoja && (
            <p className="text-right text-xs text-tekst-2">{zadnjaMoja.procitano ? "✓✓ Pročitano" : "✓ Poslano"}</p>
          )}
        </div>
      )}

      <div ref={dno} />

      <form
        onSubmit={posalji}
        className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 border-t border-rub bg-pozadina/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
      >
        {greska && <Obavijest tip="greska">{greska}</Obavijest>}
        <div className="flex items-end gap-2">
          <textarea
            ref={polje}
            aria-label="Nova poruka"
            rows={1}
            maxLength={2000}
            placeholder="Napiši poruku…"
            value={tekst}
            onChange={(e) => {
              setTekst(e.target.value);
              // polje raste s tekstom (do 6 redova)
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 168)}px`;
            }}
            className="min-h-12 flex-1 resize-none rounded-3xl border border-rub bg-povrsina-2 px-4 py-3 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
          />
          <button
            type="submit"
            aria-label="Pošalji"
            disabled={salje || !tekst.trim()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-linear-to-r from-vatra to-vatra-2 text-white shadow-lg shadow-vatra/20 transition active:scale-95 disabled:opacity-40"
          >
            {salje ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                <path d="M3.4 20.4 21 12 3.4 3.6l-.01 6.53L15 12 3.39 13.87z" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </>
  );
}
