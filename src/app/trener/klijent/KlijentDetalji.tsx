"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { NapredakPrikaz } from "@/components/napredak/NapredakPrikaz";
import { Prehrana } from "@/components/prehrana/Prehrana";
import { Poruka, Ucitavanje } from "@/components/ui";
import type { Profil } from "@/lib/tipovi";
import { supabase } from "@/lib/supabase/client";
import { CiljeviForma } from "./CiljeviForma";
import { PlanKlijenta } from "./PlanKlijenta";
import { VjezbeKlijenta } from "./VjezbeKlijenta";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ucitano = { id: string; profil: Profil | null };

export function KlijentDetalji() {
  const id = useSearchParams().get("id") ?? "";
  const ispravan = UUID.test(id);
  const [ucitano, setUcitano] = useState<Ucitano | null>(null);
  const [verzijaCilja, setVerzijaCilja] = useState(0);
  const [kartica, setKartica] = useState<"plan" | "prehrana" | "napredak">("plan");

  useEffect(() => {
    if (!ispravan) return;
    let aktivno = true;
    supabase()
      .from("profili")
      .select("*")
      .eq("id", id)
      .eq("uloga", "klijent")
      .maybeSingle()
      .then(({ data }) => {
        if (aktivno) setUcitano({ id, profil: (data as Profil | null) ?? null });
      });
    return () => {
      aktivno = false;
    };
  }, [id, ispravan]);

  const natrag = (
    <Link href="/trener" className="self-start py-2 text-base font-medium text-vatra">
      ‹ Klijenti
    </Link>
  );

  if (ispravan && ucitano?.id !== id) return <Ucitavanje />;

  const profil = ispravan ? ucitano?.profil : null;
  if (!profil) {
    return (
      <>
        {natrag}
        <Poruka tip="greska">Klijent nije pronađen.</Poruka>
      </>
    );
  }

  return (
    <>
      {natrag}
      <div>
        <h1 className="text-2xl font-bold">{profil.ime || profil.email}</h1>
        <p className="text-tekst-2">{profil.email}</p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-rub bg-povrsina p-1">
        {(
          [
            ["plan", "Plan i ciljevi"],
            ["prehrana", "Prehrana"],
            ["napredak", "Napredak"],
          ] as const
        ).map(([kljuc, oznaka]) => (
          <button
            key={kljuc}
            type="button"
            onClick={() => setKartica(kljuc)}
            className={`h-11 rounded-xl text-sm font-semibold transition ${
              kartica === kljuc ? "bg-povrsina-2 text-tekst shadow" : "text-tekst-2"
            }`}
          >
            {oznaka}
          </button>
        ))}
      </div>

      {kartica === "plan" && (
        <>
          <PlanKlijenta klijentId={profil.id} />
          <VjezbeKlijenta klijentId={profil.id} />
          <CiljeviForma klijentId={profil.id} onSpremljeno={() => setVerzijaCilja((v) => v + 1)} />
        </>
      )}
      {kartica === "prehrana" && <Prehrana key={verzijaCilja} klijentId={profil.id} mozeUredivati={false} />}
      {kartica === "napredak" && <NapredakPrikaz klijentId={profil.id} jeKlijent={false} />}
    </>
  );
}
