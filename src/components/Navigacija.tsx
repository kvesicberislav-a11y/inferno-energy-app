"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNeprocitane } from "@/components/poruke/useNeprocitane";
import type { Uloga } from "@/lib/tipovi";

type Stavka = { href: string; oznaka: string; aktivnoZa: string[]; poruke?: true };

const STAVKE: Record<Uloga, Stavka[]> = {
  trener: [
    { href: "/trener", oznaka: "Klijenti", aktivnoZa: ["/trener", "/trener/klijent"] },
    { href: "/trener/raspored", oznaka: "Raspored", aktivnoZa: ["/trener/raspored"] },
    { href: "/trener/vjezbe", oznaka: "Vježbe", aktivnoZa: ["/trener/vjezbe"] },
    { href: "/trener/planovi", oznaka: "Planovi", aktivnoZa: ["/trener/planovi", "/trener/plan"] },
    { href: "/trener/poruke", oznaka: "Poruke", aktivnoZa: ["/trener/poruke"], poruke: true },
  ],
  klijent: [
    { href: "/klijent", oznaka: "Prehrana", aktivnoZa: ["/klijent"] },
    { href: "/klijent/trening", oznaka: "Trening", aktivnoZa: ["/klijent/trening", "/klijent/vjezbe"] },
    { href: "/klijent/napredak", oznaka: "Napredak", aktivnoZa: ["/klijent/napredak"] },
    { href: "/klijent/poruke", oznaka: "Poruke", aktivnoZa: ["/klijent/poruke"], poruke: true },
  ],
};

export function Navigacija({ uloga }: { uloga: Uloga }) {
  const putanja = usePathname();
  const stavke = STAVKE[uloga];
  const neprocitane = useNeprocitane(uloga);
  const velicina = stavke.length > 4 ? "text-[13px]" : stavke.length > 3 ? "text-sm" : "text-base";

  return (
    <nav
      className="grid gap-1 rounded-2xl border border-rub bg-povrsina p-1"
      style={{ gridTemplateColumns: `repeat(${stavke.length}, minmax(0, 1fr))` }}
    >
      {stavke.map((s) => {
        const aktivno = s.aktivnoZa.includes(putanja);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={aktivno ? "page" : undefined}
            className={`relative flex h-11 items-center justify-center rounded-xl font-semibold transition ${velicina} ${
              aktivno ? "bg-linear-to-r from-vatra to-vatra-2 text-white" : "text-tekst-2"
            }`}
          >
            {s.oznaka}
            {s.poruke && neprocitane > 0 && (
              <span
                aria-label={`${neprocitane} nepročitanih`}
                className="absolute -top-1.5 right-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-vatra-2 px-1 text-[11px] font-bold text-white ring-2 ring-povrsina"
              >
                {neprocitane > 9 ? "9+" : neprocitane}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
