// Učitavanje pdfmake-a s fontom Roboto (hrvatska slova) – samo kad se PDF stvarno radi.

export type PdfMake = typeof import("pdfmake/build/pdfmake");

export async function ucitajPdfMake(): Promise<PdfMake> {
  const modul = await import("pdfmake/build/pdfmake");
  const pdfMake = ((modul as unknown as { default?: PdfMake }).default ?? modul) as PdfMake;
  const fontovi = await import("pdfmake/build/vfs_fonts");
  pdfMake.addVirtualFileSystem(
    ((fontovi as unknown as { default?: unknown }).default ?? fontovi) as Parameters<PdfMake["addVirtualFileSystem"]>[0],
  );
  return pdfMake;
}
