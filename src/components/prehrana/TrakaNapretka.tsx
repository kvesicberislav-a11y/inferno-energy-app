import { formatG, formatKcal } from "@/lib/makroi";

const boje = {
  kcal: "from-vatra to-vatra-2",
  proteini: "from-sky-400 to-blue-500",
  ugljikohidrati: "from-amber-300 to-yellow-500",
  masti: "from-fuchsia-400 to-pink-500",
} as const;

export type VrstaTrake = keyof typeof boje;

/** Traka napretka prema cilju; crvena kad je cilj premašen. */
export function TrakaNapretka({
  vrsta,
  oznaka,
  unos,
  cilj,
}: {
  vrsta: VrstaTrake;
  oznaka: string;
  unos: number;
  cilj: number | null;
}) {
  const kcal = vrsta === "kcal";
  const fmt = kcal ? formatKcal : formatG;
  const jedinica = kcal ? "kcal" : "g";
  const imaCilj = cilj !== null && cilj > 0;
  const posto = imaCilj ? Math.min(100, (unos / cilj) * 100) : 0;
  const preko = imaCilj && unos > cilj;
  const razlika = imaCilj ? Math.abs(cilj - unos) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={kcal ? "text-base font-semibold" : "text-sm font-medium text-tekst-2"}>
          {oznaka}
        </span>
        <span className={kcal ? "text-base tabular-nums" : "text-sm tabular-nums"}>
          <strong className="font-semibold">{fmt(unos)}</strong>
          {imaCilj && <span className="text-tekst-2"> / {fmt(cilj)}</span>} {jedinica}
        </span>
      </div>
      <div className={`overflow-hidden rounded-full bg-povrsina-2 ${kcal ? "h-4" : "h-2.5"}`}>
        <div
          className={`h-full rounded-full bg-linear-to-r transition-[width] duration-500 ${
            preko ? "from-red-500 to-red-600" : boje[vrsta]
          }`}
          style={{ width: `${posto}%` }}
        />
      </div>
      {imaCilj && (
        <span className={`text-xs tabular-nums ${preko ? "text-red-300" : "text-tekst-2"}`}>
          {preko ? `${fmt(razlika)} ${jedinica} preko cilja` : `još ${fmt(razlika)} ${jedinica}`}
        </span>
      )}
    </div>
  );
}
