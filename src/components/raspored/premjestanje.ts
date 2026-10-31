// Premještanje termina povlačenjem u kalendaru (i vraćanje za „Poništi").
// Isto kao „Pomakni termin": stalni termin dobiva iznimku, jednokratni se mijenja, plan treninga ide s terminom.
import { danMjesec } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import type { Termin } from "@/lib/raspored";
import { supabase } from "@/lib/supabase/client";

export type Rezultat = { greska: string | null; upozorenje: string | null };

/** Plan treninga ide s terminom na drugi dan (ako taj dan već nema svoj plan). */
async function premjestiPlan(klijentId: string, iz: string, u: string): Promise<string | null> {
  if (iz === u) return null;
  const { data, error } = await supabase().rpc("premjesti_trening", { p_klijent: klijentId, p_iz: iz, p_u: u });
  return error || data === false ? `Plan je ostao na ${danMjesec(iz)}, jer ${danMjesec(u)} već ima svoj plan.` : null;
}

/** Premjesti termin na novi dan i vrijeme. */
export async function premjestiTermin(t: Termin, datum: string, vrijeme: string): Promise<Rezultat> {
  const sb = supabase();
  const { error } = t.pravilo
    ? await sb.from("termini_iznimke").upsert(
        { pravilo_id: t.pravilo.id, datum: t.izvorniDatum ?? t.datum, otkazan: false, novi_datum: datum, novo_vrijeme: vrijeme },
        { onConflict: "pravilo_id,datum" },
      )
    : await sb.from("termini_dodatni").update({ datum, vrijeme }).eq("id", t.dodatni!.id);
  if (error) return { greska: prevediGresku(error.message), upozorenje: null };
  return { greska: null, upozorenje: await premjestiPlan(t.klijentId, t.datum, datum) };
}

/** Vrati termin točno kako je bio prije premještanja (sada je na `sadaDatum`). */
export async function vratiTermin(t: Termin, sadaDatum: string): Promise<Rezultat> {
  const sb = supabase();
  let greska: { message: string } | null;
  if (t.pravilo) {
    const izvorni = t.izvorniDatum ?? t.datum;
    ({ error: greska } = t.iznimka
      ? // već je bio pomaknut: vrati tu iznimku
        await sb.from("termini_iznimke").upsert(
          { pravilo_id: t.pravilo.id, datum: izvorni, otkazan: false, novi_datum: t.datum, novo_vrijeme: t.vrijeme },
          { onConflict: "pravilo_id,datum" },
        )
      : // bio je u uobičajeno vrijeme: iznimka se briše
        await sb.from("termini_iznimke").delete().eq("pravilo_id", t.pravilo.id).eq("datum", izvorni));
  } else {
    ({ error: greska } = await sb.from("termini_dodatni").update({ datum: t.datum, vrijeme: t.vrijeme }).eq("id", t.dodatni!.id));
  }
  if (greska) return { greska: prevediGresku(greska.message), upozorenje: null };
  return { greska: null, upozorenje: await premjestiPlan(t.klijentId, sadaDatum, t.datum) };
}
