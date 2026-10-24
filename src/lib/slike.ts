import { supabase } from "@/lib/supabase/client";

const SPREMISTE = "vjezbe";

/** Smanji sliku na najviše `maks` piksela po dužoj strani i spremi kao JPEG (štedi prostor). */
export async function smanjiSliku(datoteka: File, maks = 1080): Promise<Blob> {
  const slika = await createImageBitmap(datoteka);
  const omjer = Math.min(1, maks / Math.max(slika.width, slika.height));
  const sirina = Math.round(slika.width * omjer);
  const visina = Math.round(slika.height * omjer);
  const platno = document.createElement("canvas");
  platno.width = sirina;
  platno.height = visina;
  const ctx = platno.getContext("2d");
  if (!ctx) throw new Error("Slika se ne može obraditi.");
  ctx.drawImage(slika, 0, 0, sirina, visina);
  slika.close();
  return new Promise((rijesi, odbij) =>
    platno.toBlob(
      (blob) => (blob ? rijesi(blob) : odbij(new Error("Slika se ne može obraditi."))),
      "image/jpeg",
      0.82,
    ),
  );
}

/** Učitaj sliku vježbe i vrati njezin javni URL. */
export async function ucitajSlikuVjezbe(datoteka: File): Promise<string> {
  const blob = await smanjiSliku(datoteka);
  const putanja = `${crypto.randomUUID()}.jpg`;
  const sb = supabase();
  const { error } = await sb.storage
    .from(SPREMISTE)
    .upload(putanja, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  return sb.storage.from(SPREMISTE).getPublicUrl(putanja).data.publicUrl;
}

/** Obriši staru sliku (ako je iz našeg spremišta). Greške se ignoriraju. */
export async function obrisiSlikuVjezbe(url: string | null) {
  if (!url) return;
  const oznaka = `/object/public/${SPREMISTE}/`;
  const i = url.indexOf(oznaka);
  if (i === -1) return;
  await supabase().storage.from(SPREMISTE).remove([url.slice(i + oznaka.length)]);
}
