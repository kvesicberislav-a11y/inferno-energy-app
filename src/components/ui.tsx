import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

type VarijantaGumba = "glavni" | "sporedni" | "opasni";

const stiloviGumba: Record<VarijantaGumba, string> = {
  glavni:
    "bg-linear-to-r from-vatra to-vatra-2 text-white shadow-lg shadow-vatra/20",
  sporedni: "border border-rub bg-povrsina-2 text-tekst",
  opasni: "border border-vatra-2/40 bg-vatra-2/10 text-red-300",
};

export function Gumb({
  varijanta = "glavni",
  malen = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  varijanta?: VarijantaGumba;
  malen?: boolean;
}) {
  const velicina = malen ? "h-11 px-4 text-base" : "h-14 w-full px-5 text-lg";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${velicina} ${stiloviGumba[varijanta]} ${className}`}
      {...props}
    />
  );
}

export function Polje({
  oznaka,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { oznaka: string; id: string }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-sm font-medium text-tekst-2">{oznaka}</span>
      <input
        id={id}
        className="h-14 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-lg text-tekst outline-none transition placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
        {...props}
      />
    </label>
  );
}

export function PoljeTeksta({
  oznaka,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { oznaka: string; id: string }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-sm font-medium text-tekst-2">{oznaka}</span>
      <textarea
        id={id}
        rows={4}
        className="w-full rounded-2xl border border-rub bg-povrsina-2 px-4 py-3 text-base text-tekst outline-none transition placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
        {...props}
      />
    </label>
  );
}

/** Mali gumb-oznaka za odabir (npr. mišićna skupina). */
export function Cip({
  aktivan,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { aktivan: boolean }) {
  return (
    <button
      type="button"
      className={`h-10 shrink-0 rounded-xl px-3 text-sm font-semibold transition ${
        aktivan ? "bg-vatra text-white" : "border border-rub bg-povrsina-2 text-tekst-2"
      } ${className}`}
      {...props}
    />
  );
}

export function Kartica({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-rub bg-povrsina p-5 ${className}`}>{children}</div>
  );
}

export function Poruka({
  tip = "info",
  children,
}: {
  tip?: "greska" | "uspjeh" | "info";
  children: ReactNode;
}) {
  const stil = {
    greska: "border-red-500/30 bg-red-500/10 text-red-200",
    uspjeh: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    info: "border-rub bg-povrsina-2 text-tekst-2",
  }[tip];
  return (
    <div role={tip === "greska" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-base ${stil}`}>
      {children}
    </div>
  );
}

export function Ucitavanje({ tekst = "Učitavam…" }: { tekst?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-tekst-2">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-rub border-t-vatra" />
      <p>{tekst}</p>
    </div>
  );
}

/** Uski stupac prilagođen mobitelu, s razmakom od rubova i "notcha". */
export function Stranica({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      {children}
    </main>
  );
}
