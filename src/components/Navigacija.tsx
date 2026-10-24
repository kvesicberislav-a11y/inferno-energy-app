"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Uloga } from "@/lib/tipovi";

type Stavka = { href: string; oznaka: string; aktivnoZa: string[] };

const STAVKE: Record<Uloga, Stavka[]> = {
  trener: [
    { href: "/trener", oznaka: "Klijenti", aktivnoZa: ["/trener", "/trener/klijent"] },
    { href: "/trener/raspored", oznaka: "Raspored", aktivnoZa: ["/trener/raspored"] },
    { href: "/trener/vjezbe", oznaka: "Vježbe", aktivnoZa: ["/trener/vjezbe"] },
    { href: "/trener/planovi", oznaka: "Planovi", aktivnoZa: ["/trener/planovi", "/trener/plan"] },
  ],
  klijent: [
    { href: "/klijent", oznaka: "Prehrana", aktivnoZa: ["/klijent"] },
    { href: "/klijent/trening", oznaka: "Trening", aktivnoZa: ["/klijent/trening", "/klijent/vjezbe"] },
    { href: "/klijent/napredak", oznaka: "Napredak", aktivnoZa: ["/klijent/napredak"] },
  ],
};

export function Navigacija({ uloga }: { uloga: Uloga }) {
  const putanja = usePathname();
  const stavke = STAVKE[uloga];

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
            className={`flex h-11 items-center justify-center rounded-xl font-semibold transition ${
              stavke.length > 3 ? "text-sm" : "text-base"
            } ${
              aktivno ? "bg-linear-to-r from-vatra to-vatra-2 text-white" : "text-tekst-2"
            }`}
          >
            {s.oznaka}
          </Link>
        );
      })}
    </nav>
  );
}
