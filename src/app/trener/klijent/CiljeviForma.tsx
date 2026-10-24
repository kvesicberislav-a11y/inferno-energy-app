"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Gumb, Kartica, Polje, Poruka } from "@/components/ui";
import { danasZagreb, puniDatum } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { formatG, formatKcal, kcalIz, parsirajBroj, uCilj, type Cilj } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";

type Ucitano = { klijentId: string; cilj: Cilj | null };

/** Trener postavlja dnevni cilj klijenta (vrijedi od danas). */
export function CiljeviForma({
  klijentId,
  onSpremljeno,
}: {
  klijentId: string;
  onSpremljeno: () => void;
}) {
  const [ucitano, setUcitano] = useState<Ucitano | null>(null);
  const [uredivanje, setUredivanje] = useState(false);
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [uh, setUh] = useState("");
  const [m, setM] = useState("");
  const [kcalRucno, setKcalRucno] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);

  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("ciljevi_makroa")
      .select("*")
      .eq("klijent_id", klijentId)
      .order("vrijedi_od", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!aktivno) return;
        setUcitano({ klijentId, cilj: data?.[0] ? uCilj(data[0]) : null });
      });
    return () => {
      aktivno = false;
    };
  }, [klijentId]);

  const cilj = ucitano?.klijentId === klijentId ? ucitano.cilj : null;

  function otvori() {
    setP(cilj ? formatG(cilj.proteini) : "");
    setUh(cilj ? formatG(cilj.ugljikohidrati) : "");
    setM(cilj ? formatG(cilj.masti) : "");
    setKcal(cilj ? String(cilj.kcal) : "");
    setKcalRucno(Boolean(cilj && Math.round(kcalIz(cilj)) !== cilj.kcal));
    setGreska(null);
    setUredivanje(true);
  }

  function promijeniMakro(postavi: (v: string) => void, vrijednost: string, novo: { p: string; uh: string; m: string }) {
    postavi(vrijednost);
    if (kcalRucno) return;
    const izracun = kcalIz({
      proteini: parsirajBroj(novo.p) ?? 0,
      ugljikohidrati: parsirajBroj(novo.uh) ?? 0,
      masti: parsirajBroj(novo.m) ?? 0,
    });
    setKcal(izracun > 0 ? String(Math.round(izracun)) : "");
  }

  async function spremi(e: FormEvent) {
    e.preventDefault();
    setGreska(null);
    const vrijednosti = {
      kcal: parsirajBroj(kcal),
      proteini: parsirajBroj(p),
      ugljikohidrati: parsirajBroj(uh),
      masti: parsirajBroj(m),
    };
    if (Object.values(vrijednosti).some((v) => v === null)) {
      return setGreska("Upiši ispravne brojeve (npr. 150 ili 62,5).");
    }
    const { kcal: k, proteini, ugljikohidrati, masti } = vrijednosti as Record<string, number>;
    if (k <= 0) return setGreska("Upiši dnevni cilj kalorija.");
    if (k > 10000 || proteini > 1000 || ugljikohidrati > 1000 || masti > 1000) {
      return setGreska("Vrijednosti su prevelike.");
    }

    setSalje(true);
    const { data, error } = await supabase()
      .from("ciljevi_makroa")
      .upsert(
        {
          klijent_id: klijentId,
          vrijedi_od: danasZagreb(),
          kcal: Math.round(k),
          proteini,
          ugljikohidrati,
          masti,
        },
        { onConflict: "klijent_id,vrijedi_od" },
      )
      .select()
      .single();
    setSalje(false);
    if (error || !data) return setGreska(prevediGresku(error?.message));
    setUcitano({ klijentId, cilj: uCilj(data) });
    setUredivanje(false);
    onSpremljeno();
  }

  if (!ucitano) {
    return (
      <Kartica>
        <p className="text-tekst-2">Učitavam cilj…</p>
      </Kartica>
    );
  }

  if (!uredivanje) {
    return (
      <Kartica className="flex flex-col gap-3">
        <p className="text-sm font-medium text-tekst-2">Dnevni cilj</p>
        {cilj ? (
          <>
            <p className="text-3xl font-bold tabular-nums">
              {formatKcal(cilj.kcal)} <span className="text-base font-medium text-tekst-2">kcal</span>
            </p>
            <p className="tabular-nums text-tekst-2">
              P {formatG(cilj.proteini)} · UH {formatG(cilj.ugljikohidrati)} · M {formatG(cilj.masti)} g
            </p>
            <p className="text-sm text-tekst-2">Vrijedi od {puniDatum(cilj.vrijedi_od)}</p>
          </>
        ) : (
          <p className="text-lg font-semibold">Cilj još nije postavljen.</p>
        )}
        <Gumb varijanta={cilj ? "sporedni" : "glavni"} onClick={otvori}>
          {cilj ? "Promijeni cilj" : "Postavi cilj"}
        </Gumb>
      </Kartica>
    );
  }

  return (
    <Kartica>
      <form onSubmit={spremi} className="flex flex-col gap-4">
        <p className="text-lg font-semibold">Dnevni cilj</p>
        <div className="grid grid-cols-3 gap-3">
          <Polje
            id="cilj-p"
            oznaka="Proteini (g)"
            inputMode="decimal"
            value={p}
            onChange={(e) => promijeniMakro(setP, e.target.value, { p: e.target.value, uh, m })}
          />
          <Polje
            id="cilj-uh"
            oznaka="UH (g)"
            inputMode="decimal"
            value={uh}
            onChange={(e) => promijeniMakro(setUh, e.target.value, { p, uh: e.target.value, m })}
          />
          <Polje
            id="cilj-m"
            oznaka="Masti (g)"
            inputMode="decimal"
            value={m}
            onChange={(e) => promijeniMakro(setM, e.target.value, { p, uh, m: e.target.value })}
          />
        </div>
        <Polje
          id="cilj-kcal"
          oznaka={kcalRucno ? "Kalorije (kcal) – ručno" : "Kalorije (kcal) – računa se iz makroa"}
          inputMode="numeric"
          value={kcal}
          onChange={(e) => {
            setKcal(e.target.value);
            setKcalRucno(true);
          }}
        />
        {kcalRucno && (
          <button
            type="button"
            className="-mt-2 self-start text-sm font-medium text-vatra"
            onClick={() => {
              setKcalRucno(false);
              const izracun = kcalIz({
                proteini: parsirajBroj(p) ?? 0,
                ugljikohidrati: parsirajBroj(uh) ?? 0,
                masti: parsirajBroj(m) ?? 0,
              });
              setKcal(izracun > 0 ? String(Math.round(izracun)) : "");
            }}
          >
            Izračunaj iz makroa
          </button>
        )}
        <p className="text-sm text-tekst-2">Novi cilj vrijedi od danas. Stari ciljevi ostaju u povijesti.</p>
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <div className="grid grid-cols-2 gap-3">
          <Gumb type="button" varijanta="sporedni" onClick={() => setUredivanje(false)}>
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
