"use client";

import { useEffect, useState } from "react";
import { Gumb, Kartica, Poruka } from "@/components/ui";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import { uVjezbu, youtubeId, type Vjezba } from "@/lib/treninzi";

type Zamjena = { id: string; izvorna: string; nova: string };
type Podaci = { klijentId: string; vjezbe: Vjezba[]; zamjene: Zamjena[]; greska: string | null };

function naziv(polje: unknown): string {
  const o = Array.isArray(polje) ? polje[0] : polje;
  return (o as { naziv?: string } | null)?.naziv ?? "?";
}

async function dohvati(klijentId: string): Promise<Podaci> {
  const sb = supabase();
  const [v, z] = await Promise.all([
    sb.from("vjezbe").select("*").eq("vlasnik_id", klijentId).order("naziv"),
    sb
      .from("zamjene_vjezbi")
      .select("id, vjezba:vjezbe(naziv), plan_vjezba:plan_vjezbe(vjezba:vjezbe(naziv))")
      .eq("klijent_id", klijentId),
  ]);
  const greska = v.error || z.error;
  return {
    klijentId,
    vjezbe: (v.data ?? []).map(uVjezbu),
    zamjene: (z.data ?? []).map((r) => {
      const pv = Array.isArray(r.plan_vjezba) ? r.plan_vjezba[0] : r.plan_vjezba;
      return {
        id: String(r.id),
        nova: naziv(r.vjezba),
        izvorna: naziv((pv as { vjezba?: unknown } | null)?.vjezba),
      };
    }),
    greska: greska ? prevediGresku(greska.message) : null,
  };
}

/** Vježbe iz klijentove teretane i zamjene koje je napravio. */
export function VjezbeKlijenta({ klijentId }: { klijentId: string }) {
  const [podaci, setPodaci] = useState<Podaci | null>(null);
  const [verzija, setVerzija] = useState(0);
  const [otvorena, setOtvorena] = useState<string | null>(null);
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

  async function uBiblioteku(v: Vjezba) {
    if (!window.confirm(`Premjestiti „${v.naziv}” u zajedničku biblioteku? Tada je vide svi klijenti.`)) return;
    setGreska(null);
    const { error } = await supabase().from("vjezbe").update({ vlasnik_id: null }).eq("id", v.id);
    if (error) return setGreska(prevediGresku(error.message));
    setVerzija((x) => x + 1);
  }

  if (podaci?.klijentId !== klijentId) return null;
  if (podaci.vjezbe.length === 0 && podaci.zamjene.length === 0 && !podaci.greska) return null;

  return (
    <Kartica className="flex flex-col gap-3">
      <p className="text-sm font-medium text-tekst-2">Klijentova teretana</p>
      {(podaci.greska || greska) && <Poruka tip="greska">{podaci.greska ?? greska}</Poruka>}

      {podaci.zamjene.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Zamjene u planu</p>
          {podaci.zamjene.map((z) => (
            <p key={z.id} className="text-sm text-tekst-2">
              {z.izvorna} <span className="text-vatra">→</span> {z.nova}
            </p>
          ))}
        </div>
      )}

      {podaci.vjezbe.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Njegove vježbe</p>
          {podaci.vjezbe.map((v) => (
            <div key={v.id} className="rounded-2xl border border-rub bg-povrsina-2">
              <button
                type="button"
                onClick={() => setOtvorena(otvorena === v.id ? null : v.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{v.naziv}</span>
                  <span className="text-sm text-tekst-2">{v.misicna_skupina}</span>
                </span>
                <span className="text-tekst-2" aria-hidden="true">
                  {otvorena === v.id ? "▴" : "▾"}
                </span>
              </button>
              {otvorena === v.id && (
                <div className="flex flex-col gap-2 border-t border-rub px-3 py-2.5">
                  <p className="whitespace-pre-line text-sm text-tekst-2">{v.opis || "Nema opisa."}</p>
                  {youtubeId(v.youtube_url) && (
                    // samo pravi YouTube link (klijent ga je upisao sam)
                    <a
                      href={`https://www.youtube.com/watch?v=${youtubeId(v.youtube_url)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-vatra"
                    >
                      ▶ Video
                    </a>
                  )}
                  <Gumb varijanta="sporedni" malen className="self-start" onClick={() => uBiblioteku(v)}>
                    Premjesti u biblioteku
                  </Gumb>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Kartica>
  );
}
