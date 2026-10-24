"use client";

import { useEffect, useRef, useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Gumb, Kartica, Poruka } from "@/components/ui";
import { danasZagreb, dodajDane, puniDatum } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { smanjiSliku } from "@/lib/slike";
import { supabase } from "@/lib/supabase/client";

const SPREMISTE = "napredak";
const POZE = [
  { kljuc: "sprijeda", oznaka: "Sprijeda" },
  { kljuc: "bocno", oznaka: "Bočno" },
  { kljuc: "straga", oznaka: "Straga" },
] as const;
type Poza = (typeof POZE)[number]["kljuc"];

type Slika = { id: string; datum: string; poza: Poza; putanja: string; url: string | null };
type Stanje = { klijentId: string; slike: Slika[]; greska: string | null };

async function dohvati(klijentId: string): Promise<Stanje> {
  const sb = supabase();
  const { data, error } = await sb
    .from("slike_napretka")
    .select("id, datum, poza, putanja")
    .eq("klijent_id", klijentId)
    .order("datum", { ascending: false });
  if (error) return { klijentId, slike: [], greska: prevediGresku(error.message) };
  const redovi = (data ?? []).map((r) => ({
    id: String(r.id),
    datum: String(r.datum),
    poza: r.poza as Poza,
    putanja: String(r.putanja),
    url: null as string | null,
  }));
  if (redovi.length) {
    const { data: potpisani } = await sb.storage
      .from(SPREMISTE)
      .createSignedUrls(
        redovi.map((r) => r.putanja),
        60 * 60,
      );
    const poPutanji = new Map((potpisani ?? []).map((p) => [p.path, p.signedUrl]));
    for (const r of redovi) r.url = poPutanji.get(r.putanja) ?? null;
  }
  return { klijentId, slike: redovi, greska: null };
}

/** Slike napretka: jedan set (sprijeda, bočno, straga) svaka 2 tjedna. Vide ih samo klijent i trener. */
export function SlikeNapretka({ klijentId, jeKlijent }: { klijentId: string; jeKlijent: boolean }) {
  const danas = danasZagreb();
  const [stanje, setStanje] = useState<Stanje | null>(null);
  const [verzija, setVerzija] = useState(0);
  const [ucitava, setUcitava] = useState<Poza | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [uvecana, setUvecana] = useState<Slika | null>(null);
  const [usporedba, setUsporedba] = useState(false);
  const [odabranaPoza, setOdabranaPoza] = useState<Poza | null>(null);
  const odabir = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let aktivno = true;
    dohvati(klijentId).then((r) => {
      if (aktivno) setStanje(r);
    });
    return () => {
      aktivno = false;
    };
  }, [klijentId, verzija]);

  const slike = stanje?.klijentId === klijentId ? stanje.slike : null;
  const osvjezi = () => setVerzija((v) => v + 1);

  if (slike === null) {
    return (
      <Kartica>
        <p className="text-tekst-2">Učitavam slike…</p>
      </Kartica>
    );
  }

  // Setovi po datumu (najnoviji prvi)
  const datumi = [...new Set(slike.map((s) => s.datum))];
  const zadnjiDrugi = datumi.find((d) => d !== danas) ?? null;
  const sljedeciDozvoljeni = zadnjiDrugi ? dodajDane(zadnjiDrugi, 14) : danas;
  const smijeDanas = sljedeciDozvoljeni <= danas;
  const danasnje = slike.filter((s) => s.datum === danas);

  function pokreniOdabir(poza: Poza) {
    setOdabranaPoza(poza);
    setGreska(null);
    odabir.current?.click();
  }

  async function ucitaj(datoteka: File | undefined) {
    const poza = odabranaPoza;
    if (!datoteka || !poza) return;
    if (!datoteka.type.startsWith("image/")) return setGreska("Odaberi sliku.");
    setUcitava(poza);
    const sb = supabase();
    const putanja = `${klijentId}/${crypto.randomUUID()}.jpg`;
    try {
      const blob = await smanjiSliku(datoteka, 1080, 0.75);
      // Zamjena postojeće današnje slike iste poze
      const stara = danasnje.find((s) => s.poza === poza);
      if (stara) {
        await sb.storage.from(SPREMISTE).remove([stara.putanja]);
        await sb.from("slike_napretka").delete().eq("id", stara.id);
      }
      // Prvo zapis (baza provjerava pravilo od 14 dana), zatim datoteka
      const { data: red, error } = await sb
        .from("slike_napretka")
        .insert({ klijent_id: klijentId, datum: danas, poza, putanja })
        .select("id")
        .single();
      if (error || !red) {
        throw new Error(
          /row-level security|policy/i.test(error?.message ?? "")
            ? `Nove slike možeš dodati od ${puniDatum(sljedeciDozvoljeni)}.`
            : (error?.message ?? "Slika nije spremljena."),
        );
      }
      const { error: greskaDatoteke } = await sb.storage
        .from(SPREMISTE)
        .upload(putanja, blob, { contentType: "image/jpeg" });
      if (greskaDatoteke) {
        await sb.from("slike_napretka").delete().eq("id", red.id);
        throw new Error(greskaDatoteke.message);
      }
      osvjezi();
    } catch (err) {
      setGreska(err instanceof Error && err.message.startsWith("Nove slike") ? err.message : prevediGresku(err instanceof Error ? err.message : null));
    } finally {
      setUcitava(null);
    }
  }

  async function obrisi(s: Slika) {
    if (!window.confirm("Obrisati ovu sliku?")) return;
    const sb = supabase();
    await sb.storage.from(SPREMISTE).remove([s.putanja]);
    const { error } = await sb.from("slike_napretka").delete().eq("id", s.id);
    if (error) return setGreska(prevediGresku(error.message));
    setUvecana(null);
    osvjezi();
  }

  const prvi = datumi[datumi.length - 1];
  const zadnji = datumi[0];

  return (
    <Kartica className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Slike napretka</h3>
          <p className="text-sm text-tekst-2">Vide ih samo {jeKlijent ? "ti i tvoj trener" : "klijent i trener"}.</p>
        </div>
        {datumi.length >= 2 && (
          <button type="button" onClick={() => setUsporedba((u) => !u)} className="text-sm font-medium text-vatra">
            {usporedba ? "Svi setovi" : "Usporedi"}
          </button>
        )}
      </div>

      {jeKlijent &&
        (smijeDanas ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-tekst-2">
              {danasnje.length ? "Današnji set – dodaj ili zamijeni slike:" : "Novi set slika (u istoj odjeći i svjetlu):"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {POZE.map((p) => {
                const postoji = danasnje.find((s) => s.poza === p.kljuc);
                return (
                  <button
                    key={p.kljuc}
                    type="button"
                    onClick={() => pokreniOdabir(p.kljuc)}
                    disabled={ucitava !== null}
                    className={`flex aspect-[3/4] flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border text-sm font-semibold ${
                      postoji ? "border-emerald-500/50" : "border-dashed border-rub bg-povrsina-2 text-tekst-2"
                    }`}
                  >
                    {postoji?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- privatna slika s potpisanim linkom
                      <img src={postoji.url} alt={p.oznaka} className="h-full w-full object-cover" />
                    ) : ucitava === p.kljuc ? (
                      "Učitavam…"
                    ) : (
                      <>
                        <span className="text-2xl">＋</span>
                        {p.oznaka}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            <input
              ref={odabir}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                ucitaj(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <Poruka>Sljedeći set slika možeš dodati od {puniDatum(sljedeciDozvoljeni)}.</Poruka>
        ))}

      {greska && <Poruka tip="greska">{greska}</Poruka>}

      {datumi.length === 0 ? (
        <p className="text-sm text-tekst-2">Još nema slika.</p>
      ) : usporedba && prvi && zadnji ? (
        <div className="flex flex-col gap-3">
          {POZE.map((p) => {
            const a = slike.find((s) => s.datum === prvi && s.poza === p.kljuc);
            const b = slike.find((s) => s.datum === zadnji && s.poza === p.kljuc);
            if (!a && !b) return null;
            return (
              <div key={p.kljuc} className="flex flex-col gap-1">
                <span className="text-sm font-medium text-tekst-2">{p.oznaka}</span>
                <div className="grid grid-cols-2 gap-2">
                  {[a, b].map((s, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-povrsina-2">
                        {s?.url && (
                          // eslint-disable-next-line @next/next/no-img-element -- privatna slika s potpisanim linkom
                          <img src={s.url} alt={`${p.oznaka} ${s.datum}`} className="h-full w-full object-cover" />
                        )}
                      </div>
                      <span className="text-center text-xs text-tekst-2">{puniDatum(i === 0 ? prvi : zadnji)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {datumi.map((d) => (
            <div key={d} className="flex flex-col gap-1">
              <span className="text-sm font-medium text-tekst-2">{puniDatum(d)}</span>
              <div className="grid grid-cols-3 gap-2">
                {POZE.map((p) => {
                  const s = slike.find((x) => x.datum === d && x.poza === p.kljuc);
                  return s?.url ? (
                    <button
                      key={p.kljuc}
                      type="button"
                      onClick={() => setUvecana(s)}
                      className="aspect-[3/4] overflow-hidden rounded-2xl bg-povrsina-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- privatna slika s potpisanim linkom */}
                      <img src={s.url} alt={`${p.oznaka} ${d}`} loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <div key={p.kljuc} className="aspect-[3/4] rounded-2xl border border-dashed border-rub" />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {uvecana && (
        <Ploca
          naslov={`${POZE.find((p) => p.kljuc === uvecana.poza)?.oznaka} · ${puniDatum(uvecana.datum)}`}
          onZatvori={() => setUvecana(null)}
        >
          <div className="flex flex-col gap-4">
            {uvecana.url && (
              // eslint-disable-next-line @next/next/no-img-element -- privatna slika s potpisanim linkom
              <img src={uvecana.url} alt="" className="w-full rounded-2xl" />
            )}
            {jeKlijent && (
              <Gumb varijanta="opasni" onClick={() => obrisi(uvecana)}>
                Obriši sliku
              </Gumb>
            )}
          </div>
        </Ploca>
      )}
    </Kartica>
  );
}
