"use client";

import { useAuth } from "@/components/AuthProvider";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Zasticeno } from "@/components/Zasticeno";
import { Kartica, Stranica } from "@/components/ui";

function KlijentPocetna() {
  const { profil } = useAuth();
  const ime = profil?.ime.split(" ")[0] || "";

  return (
    <Stranica>
      <Zaglavlje />
      <h1 className="pt-2 text-3xl font-bold">Bok{ime ? `, ${ime}` : ""}! 👋</h1>
      <Kartica>
        <p className="text-lg font-semibold">Uskoro ovdje</p>
        <p className="mt-1 text-tekst-2">
          Današnji makroi, trening i napredak pojavit će se ovdje u sljedećim koracima.
        </p>
      </Kartica>
    </Stranica>
  );
}

export default function KlijentStranica() {
  return (
    <Zasticeno uloga="klijent">
      <KlijentPocetna />
    </Zasticeno>
  );
}
