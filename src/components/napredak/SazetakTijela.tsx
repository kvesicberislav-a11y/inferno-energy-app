"use client";

import { Gumb, Kartica } from "@/components/ui";
import { danasZagreb, puniDatum } from "@/lib/datum";
import {
  bazalniMetabolizam,
  dob,
  format1,
  format2,
  izracunajBmi,
  kategorijaBmi,
  kategorijaMasti,
  omjerStrukBokovi,
  omjerStrukVisina,
  postotakMasti,
  zadnjeVrijednosti,
  type Mjerenje,
  type OsobniPodaci,
  type Razina,
} from "@/lib/tijelo";

const BOJA_RAZINE: Record<Razina, string> = {
  dobro: "bg-emerald-400",
  upozorenje: "bg-amber-400",
  ozbiljno: "bg-red-500",
};
const IKONA_RAZINE: Record<Razina, string> = { dobro: "✓", upozorenje: "!", ozbiljno: "!!" };

function Status({ razina, oznaka }: { razina: Razina; oznaka: string }) {
  return (
    <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-tekst-2">
      <span
        className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-black ${BOJA_RAZINE[razina]}`}
        aria-hidden="true"
      >
        {IKONA_RAZINE[razina]}
      </span>
      {oznaka}
    </span>
  );
}

function Plocica({
  oznaka,
  vrijednost,
  jedinica,
  children,
}: {
  oznaka: string;
  vrijednost: string | null;
  jedinica?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-rub bg-povrsina-2 p-3">
      <span className="text-xs font-medium text-tekst-2">{oznaka}</span>
      {vrijednost !== null ? (
        <span className="mt-0.5 text-2xl font-bold">
          {vrijednost}
          {jedinica && <span className="ml-1 text-sm font-medium text-tekst-2">{jedinica}</span>}
        </span>
      ) : (
        <span className="mt-0.5 text-2xl font-bold text-tekst-2">—</span>
      )}
      {children}
    </div>
  );
}

/** Pločice s trenutnim stanjem tijela i automatskim izračunima. */
export function SazetakTijela({
  osobni,
  mjerenja,
  onOsobni,
}: {
  osobni: OsobniPodaci;
  mjerenja: Mjerenje[];
  onOsobni?: () => void;
}) {
  const danas = danasZagreb();
  const z = zadnjeVrijednosti(mjerenja);
  const tezina = z.tezina_kg?.vrijednost ?? null;
  const prvaTezina = mjerenja.find((m) => m.tezina_kg !== null)?.tezina_kg ?? null;
  const promjena = tezina !== null && prvaTezina !== null ? tezina - prvaTezina : null;

  const visina = osobni.visina_cm;
  const bmi = izracunajBmi(tezina, visina);
  const masti = postotakMasti(osobni.spol, visina, z.vrat_cm?.vrijednost ?? null, z.struk_cm?.vrijednost ?? null, z.bokovi_cm?.vrijednost ?? null);
  const nemasna = masti !== null && tezina !== null ? tezina * (1 - masti / 100) : null;
  const sv = omjerStrukVisina(z.struk_cm?.vrijednost ?? null, visina);
  const sb = omjerStrukBokovi(z.struk_cm?.vrijednost ?? null, z.bokovi_cm?.vrijednost ?? null);
  const granicaSb = osobni.spol === "z" ? 0.85 : 0.9;
  const godine = dob(osobni.godina_rodenja, danas);
  const bmr = bazalniMetabolizam(osobni.spol, tezina, visina, godine);
  const nedostajeOsobno = !visina || !osobni.spol || !osobni.godina_rodenja;

  const trebaZaMasti = !osobni.spol
    ? "treba spol"
    : osobni.spol === "m"
      ? "treba vrat i struk"
      : "treba vrat, struk i bokove";

  return (
    <Kartica className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-tekst-2">Tijelo danas</p>
        {onOsobni && (
          <button type="button" onClick={onOsobni} className="text-sm font-medium text-vatra">
            Osobni podaci
          </button>
        )}
      </div>

      {nedostajeOsobno && onOsobni && (
        <div className="flex flex-col gap-2 rounded-2xl border border-vatra/40 bg-vatra/10 p-3">
          <p className="text-sm">Za BMI, postotak masti i metabolizam upiši visinu, spol i godinu rođenja.</p>
          <Gumb malen onClick={onOsobni}>
            Upiši osobne podatke
          </Gumb>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Plocica oznaka="Težina" vrijednost={tezina !== null ? format1(tezina) : null} jedinica="kg">
          {promjena !== null && mjerenja.filter((m) => m.tezina_kg !== null).length > 1 && (
            <span className="mt-1 text-xs text-tekst-2">
              od početka {promjena > 0 ? "+" : promjena < 0 ? "−" : "±"}
              {format1(Math.abs(promjena))} kg
            </span>
          )}
        </Plocica>
        <Plocica oznaka="BMI" vrijednost={bmi !== null ? format1(bmi) : null}>
          {bmi !== null ? (
            <Status {...kategorijaBmi(bmi)} />
          ) : (
            <span className="mt-1 text-xs text-tekst-2">treba težina i visina</span>
          )}
        </Plocica>
        <Plocica oznaka="Tjelesna mast" vrijednost={masti !== null ? format1(masti) : null} jedinica="%">
          {masti !== null && osobni.spol ? (
            <Status {...kategorijaMasti(osobni.spol, masti)} />
          ) : (
            <span className="mt-1 text-xs text-tekst-2">{visina ? trebaZaMasti : "treba visina"}</span>
          )}
        </Plocica>
        <Plocica oznaka="Nemasna masa" vrijednost={nemasna !== null ? format1(nemasna) : null} jedinica="kg">
          {nemasna !== null && tezina !== null && (
            <span className="mt-1 text-xs text-tekst-2">mast {format1(tezina - nemasna)} kg</span>
          )}
        </Plocica>
        <Plocica oznaka="Struk / visina" vrijednost={sv !== null ? format2(sv) : null}>
          {sv !== null ? (
            <Status
              razina={sv < 0.5 ? "dobro" : sv < 0.6 ? "upozorenje" : "ozbiljno"}
              oznaka={sv < 0.5 ? "u redu (ispod 0,5)" : "povećan rizik"}
            />
          ) : (
            <span className="mt-1 text-xs text-tekst-2">treba struk i visina</span>
          )}
        </Plocica>
        <Plocica oznaka="Struk / bokovi" vrijednost={sb !== null ? format2(sb) : null}>
          {sb !== null ? (
            <Status
              razina={sb < granicaSb ? "dobro" : "upozorenje"}
              oznaka={sb < granicaSb ? `u redu (ispod ${format2(granicaSb)})` : "povećan rizik"}
            />
          ) : (
            <span className="mt-1 text-xs text-tekst-2">treba struk i bokove</span>
          )}
        </Plocica>
        <Plocica
          oznaka="Bazalni metabolizam"
          vrijednost={bmr !== null ? Math.round(bmr).toLocaleString("hr-HR") : null}
          jedinica="kcal"
        >
          <span className="mt-1 text-xs text-tekst-2">{bmr !== null ? "potrošnja u mirovanju" : "treba sve osobne podatke"}</span>
        </Plocica>
        <Plocica oznaka="Mjerenja" vrijednost={String(mjerenja.length)}>
          <span className="mt-1 text-xs text-tekst-2">
            {mjerenja.length ? `zadnje ${puniDatum(mjerenja[mjerenja.length - 1].datum)}` : "još nema unosa"}
          </span>
        </Plocica>
      </div>
      <p className="text-xs text-tekst-2">
        Izračuni su procjene (% masti po formuli američke mornarice) i služe za praćenje napretka, ne kao
        medicinska dijagnoza.
      </p>
    </Kartica>
  );
}
