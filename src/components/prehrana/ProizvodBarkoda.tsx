"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Ploca } from "@/components/Ploca";
import { Cip, Gumb, Polje, Poruka, Ucitavanje } from "@/components/ui";
import { prevediGresku } from "@/lib/greske";
import { formatG, formatKcal, parsirajBroj } from "@/lib/makroi";
import { kcalNa100, makroiZaGrame, pronadiPoBarkodu, uNamirnicu, type Namirnica } from "@/lib/namirnice";
import { supabase } from "@/lib/supabase/client";

export type DodaniProizvod = {
  naziv: string;
  grami: number;
  proteini: number;
  ugljikohidrati: number;
  masti: number;
};

/** Nakon skeniranja: pronađi proizvod, odaberi grame i dodaj u obrok (ili upiši novi proizvod). */
export function ProizvodBarkoda({
  barkod,
  onDodaj,
  onZatvori,
  onPonovo,
}: {
  barkod: string;
  onDodaj: (p: DodaniProizvod) => void;
  onZatvori: () => void;
  onPonovo: () => void;
}) {
  const { profil } = useAuth();
  const [stanje, setStanje] = useState<{ barkod: string; namirnica: Namirnica | null } | null>(null);
  const [uredivanje, setUredivanje] = useState(false);
  const [grami, setGrami] = useState("");

  useEffect(() => {
    let aktivno = true;
    pronadiPoBarkodu(barkod).then((n) => {
      if (!aktivno) return;
      setStanje({ barkod, namirnica: n });
      if (n) setGrami(formatG(n.porcija_g ?? 100));
    });
    return () => {
      aktivno = false;
    };
  }, [barkod]);

  if (stanje?.barkod !== barkod) {
    return (
      <Ploca naslov="Tražim proizvod…" onZatvori={onZatvori}>
        <Ucitavanje tekst={`Barkod ${barkod}`} />
      </Ploca>
    );
  }

  const n = stanje.namirnica;

  if (!n || uredivanje) {
    return (
      <NoviProizvod
        barkod={barkod}
        postojeci={uredivanje ? n : null}
        onSpremljeno={(novi) => {
          setStanje({ barkod, namirnica: novi });
          setGrami(formatG(novi.porcija_g ?? 100));
          setUredivanje(false);
        }}
        onZatvori={uredivanje ? () => setUredivanje(false) : onZatvori}
        onPonovo={onPonovo}
      />
    );
  }

  const g = parsirajBroj(grami);
  const izracun = g && g > 0 ? makroiZaGrame(n, g) : null;
  const mozeUrediti = profil?.uloga === "trener" || (n.dodao !== null && n.dodao === profil?.id);
  const brzi = [...new Set([n.porcija_g, 50, 100, 150, 200].filter((x): x is number => x !== null))].slice(0, 5);

  return (
    <Ploca naslov="Proizvod" onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-povrsina-2 px-4 py-3">
          <p className="text-lg font-semibold">{n.naziv}</p>
          {n.marka && <p className="text-sm text-tekst-2">{n.marka}</p>}
          <p className="mt-1 text-sm tabular-nums text-tekst-2">
            na 100 g: {formatKcal(kcalNa100(n))} kcal · P {formatG(n.proteini_100)} · UH {formatG(n.ugljikohidrati_100)} · M{" "}
            {formatG(n.masti_100)} g
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="grami" className="text-sm font-medium text-tekst-2">
            Koliko si pojeo/la?
          </label>
          <div className="relative">
            <input
              id="grami"
              inputMode="decimal"
              autoFocus
              value={grami}
              onChange={(e) => setGrami(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="h-16 w-full rounded-2xl border border-rub bg-povrsina-2 pr-12 pl-4 text-3xl font-bold tabular-nums text-tekst outline-none focus:border-vatra focus:ring-2 focus:ring-vatra/30"
            />
            <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-tekst-2">g</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {brzi.map((b) => (
              <Cip key={b} aktivan={g === b} onClick={() => setGrami(formatG(b))}>
                {formatG(b)} g{b === n.porcija_g ? " (porcija)" : ""}
              </Cip>
            ))}
          </div>
        </div>

        <div className="flex items-baseline justify-center gap-2 rounded-2xl bg-povrsina-2 py-3 tabular-nums">
          {izracun ? (
            <>
              <span className="text-3xl font-bold">{formatKcal(izracun.kcal)}</span>
              <span className="text-tekst-2">
                kcal · P {formatG(izracun.proteini)} · UH {formatG(izracun.ugljikohidrati)} · M {formatG(izracun.masti)} g
              </span>
            </>
          ) : (
            <span className="text-tekst-2">Upiši količinu u gramima</span>
          )}
        </div>

        <Gumb
          disabled={!izracun}
          onClick={() =>
            izracun &&
            g &&
            onDodaj({
              naziv: n.naziv,
              grami: g,
              proteini: izracun.proteini,
              ugljikohidrati: izracun.ugljikohidrati,
              masti: izracun.masti,
            })
          }
        >
          Dodaj u obrok
        </Gumb>

        <div className="flex items-center justify-between gap-3 text-sm">
          <button type="button" onClick={onPonovo} className="font-medium text-vatra">
            Skeniraj drugi
          </button>
          {mozeUrediti && (
            <button type="button" onClick={() => setUredivanje(true)} className="text-tekst-2 underline">
              Ispravi vrijednosti
            </button>
          )}
        </div>
        {n.izvor === "off" && (
          <p className="text-center text-xs text-tekst-2">Podaci o proizvodu: Open Food Facts (ODbL)</p>
        )}
      </div>
    </Ploca>
  );
}

/** Proizvoda nema u bazi – upiši vrijednosti s deklaracije (na 100 g). */
function NoviProizvod({
  barkod,
  postojeci,
  onSpremljeno,
  onZatvori,
  onPonovo,
}: {
  barkod: string;
  postojeci: Namirnica | null;
  onSpremljeno: (n: Namirnica) => void;
  onZatvori: () => void;
  onPonovo: () => void;
}) {
  const [naziv, setNaziv] = useState(postojeci?.naziv ?? "");
  const [marka, setMarka] = useState(postojeci?.marka ?? "");
  const [p, setP] = useState(postojeci ? formatG(postojeci.proteini_100) : "");
  const [uh, setUh] = useState(postojeci ? formatG(postojeci.ugljikohidrati_100) : "");
  const [m, setM] = useState(postojeci ? formatG(postojeci.masti_100) : "");
  const [porcija, setPorcija] = useState(postojeci?.porcija_g ? formatG(postojeci.porcija_g) : "");
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);

  async function spremi(e: FormEvent) {
    e.preventDefault();
    setGreska(null);
    if (!naziv.trim()) return setGreska("Upiši naziv proizvoda.");
    const v = { p: parsirajBroj(p), uh: parsirajBroj(uh), m: parsirajBroj(m) };
    if (v.p === null || v.uh === null || v.m === null) return setGreska("Upiši ispravne brojeve s deklaracije.");
    if (v.p > 100 || v.uh > 100 || v.m > 100) return setGreska("Vrijednosti su na 100 g – ne mogu biti veće od 100.");
    const por = porcija.trim() ? parsirajBroj(porcija) : null;
    if (porcija.trim() && (por === null || por < 1)) return setGreska("Porcija nije ispravna.");

    setSalje(true);
    const podaci = {
      naziv: naziv.trim().slice(0, 120),
      marka: marka.trim().slice(0, 80),
      proteini_100: v.p,
      ugljikohidrati_100: v.uh,
      masti_100: v.m,
      porcija_g: por,
    };
    const sb = supabase();
    const { data, error } = postojeci
      ? await sb.from("namirnice").update({ ...podaci, azurirano: new Date().toISOString() }).eq("id", postojeci.id).select().single()
      : await sb.from("namirnice").insert({ ...podaci, barkod, izvor: "korisnik" }).select().single();
    setSalje(false);
    if (error || !data) return setGreska(prevediGresku(error?.message));
    onSpremljeno(uNamirnicu(data));
  }

  return (
    <Ploca naslov={postojeci ? "Ispravi proizvod" : "Novi proizvod"} onZatvori={onZatvori}>
      <form onSubmit={spremi} className="flex flex-col gap-4">
        {!postojeci && (
          <Poruka>
            Proizvod s barkodom <strong>{barkod}</strong> još nije u bazi. Prepiši vrijednosti s deklaracije (stupac
            „na 100 g”) – sljedeći put će se pronaći odmah.
          </Poruka>
        )}
        <Polje id="np-naziv" oznaka="Naziv" placeholder="npr. Grčki jogurt" maxLength={120} value={naziv} onChange={(e) => setNaziv(e.target.value)} />
        <Polje id="np-marka" oznaka="Marka (neobavezno)" maxLength={80} value={marka} onChange={(e) => setMarka(e.target.value)} />
        <p className="-mb-2 text-sm font-medium text-tekst-2">Na 100 g proizvoda:</p>
        <div className="grid grid-cols-3 gap-3">
          <Polje id="np-p" oznaka="Bjelančevine" inputMode="decimal" placeholder="0" value={p} onChange={(e) => setP(e.target.value)} />
          <Polje id="np-uh" oznaka="Ugljikohidrati" inputMode="decimal" placeholder="0" value={uh} onChange={(e) => setUh(e.target.value)} />
          <Polje id="np-m" oznaka="Masti" inputMode="decimal" placeholder="0" value={m} onChange={(e) => setM(e.target.value)} />
        </div>
        <Polje
          id="np-porcija"
          oznaka="Uobičajena porcija u gramima (neobavezno)"
          inputMode="decimal"
          placeholder="npr. 150"
          value={porcija}
          onChange={(e) => setPorcija(e.target.value)}
        />
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <Gumb type="submit" disabled={salje}>
          {salje ? "Spremam…" : "Spremi proizvod"}
        </Gumb>
        {!postojeci && (
          <button type="button" onClick={onPonovo} className="text-sm font-medium text-vatra">
            Skeniraj ponovno
          </button>
        )}
      </form>
    </Ploca>
  );
}
