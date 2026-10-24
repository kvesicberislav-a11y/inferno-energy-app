"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { Zasticeno } from "@/components/Zasticeno";
import { Gumb, Poruka, Stranica, Ucitavanje } from "@/components/ui";
import { SlicicaVjezbe } from "@/components/vjezbe/VideoVjezbe";
import { VjezbaForma } from "@/components/vjezbe/VjezbaForma";
import { useVjezbe } from "@/components/vjezbe/useVjezbe";
import type { Vjezba } from "@/lib/treninzi";

function MojeVjezbe({ klijentId }: { klijentId: string }) {
  const { vjezbe, greska, osvjezi } = useVjezbe({ vrsta: "moje", klijentId });
  const [forma, setForma] = useState<{ vjezba: Vjezba | null } | null>(null);
  const [otvorena, setOtvorena] = useState<string | null>(null);

  return (
    <>
      <Link href="/klijent/trening" className="self-start py-2 text-base font-medium text-vatra">
        ‹ Trening
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Moje vježbe</h1>
        <Gumb malen onClick={() => setForma({ vjezba: null })}>
          + Nova
        </Gumb>
      </div>
      <p className="text-tekst-2">
        Vježbe i sprave iz tvoje teretane. Njima možeš zamijeniti vježbu iz plana kad nemaš tu spravu.
        Vidiš ih samo ti i tvoj trener.
      </p>

      {greska && <Poruka tip="greska">{greska}</Poruka>}
      {vjezbe === null ? (
        !greska && <Ucitavanje />
      ) : vjezbe.length === 0 ? (
        <Poruka>Još nemaš svojih vježbi. Dodaj prvu gumbom „+ Nova”.</Poruka>
      ) : (
        <div className="flex flex-col gap-2">
          {vjezbe.map((v) => (
            <div key={v.id} className="rounded-2xl border border-rub bg-povrsina">
              <button
                type="button"
                onClick={() => setOtvorena(otvorena === v.id ? null : v.id)}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <SlicicaVjezbe slikaUrl={null} youtubeUrl={v.youtube_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{v.naziv}</p>
                  <p className="text-sm text-tekst-2">{v.misicna_skupina}</p>
                </div>
                <span className="text-xl text-tekst-2" aria-hidden="true">
                  {otvorena === v.id ? "▴" : "▾"}
                </span>
              </button>
              {otvorena === v.id && (
                <div className="flex flex-col gap-3 border-t border-rub p-3">
                  {v.opis ? (
                    <p className="whitespace-pre-line text-tekst-2">{v.opis}</p>
                  ) : (
                    <p className="text-sm text-tekst-2">Nema opisa.</p>
                  )}
                  <Gumb varijanta="sporedni" malen onClick={() => setForma({ vjezba: v })}>
                    Uredi
                  </Gumb>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {forma && (
        <VjezbaForma
          postojeca={forma.vjezba}
          vlasnikId={klijentId}
          onZatvori={() => setForma(null)}
          onSpremljeno={() => {
            setForma(null);
            osvjezi();
          }}
        />
      )}
    </>
  );
}

function Sadrzaj() {
  const { profil } = useAuth();
  if (!profil) return null;
  return (
    <Stranica>
      <MojeVjezbe klijentId={profil.id} />
    </Stranica>
  );
}

export default function KlijentVjezbeStranica() {
  return (
    <Zasticeno uloga="klijent">
      <Sadrzaj />
    </Zasticeno>
  );
}
