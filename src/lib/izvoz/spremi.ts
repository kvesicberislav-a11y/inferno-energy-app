// Spremanje ili dijeljenje izvezene datoteke na mobitelu / računalu.

/** Preuzimanje datoteke (radi i na računalu i na mobitelu). */
export function preuzmi(blob: Blob, ime: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ime;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function mozeDijeliti(blob: Blob, ime: string) {
  try {
    const datoteka = new File([blob], ime, { type: blob.type });
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [datoteka] });
  } catch {
    return false;
  }
}

/** Dijeljenje kroz izbornik mobitela (WhatsApp, e-mail, Spremi u datoteke…). */
export async function podijeli(blob: Blob, ime: string, naslov: string) {
  const datoteka = new File([blob], ime, { type: blob.type });
  try {
    await navigator.share({ files: [datoteka], title: naslov });
  } catch (e) {
    // korisnik je odustao – nije greška
    if (e instanceof DOMException && e.name === "AbortError") return;
    throw e;
  }
}
