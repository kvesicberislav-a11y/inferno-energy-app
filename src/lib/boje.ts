// Boja klijenta u kalendaru: redni broj klijenta (profili.boja) → boja.
// Prvih 12 su klasične, jasno različite boje; zatim iste u svjetlijem, tamnijem … tonu (dovoljno za 50+ klijenata).

const OSNOVNE: [number, number, number][] = [
  [249, 115, 22], // narančasta
  [59, 130, 246], // plava
  [34, 197, 94], // zelena
  [168, 85, 247], // ljubičasta
  [239, 68, 68], // crvena
  [234, 179, 8], // žuta
  [20, 184, 166], // tirkizna
  [236, 72, 153], // ružičasta
  [161, 98, 7], // smeđa
  [56, 189, 248], // svijetloplava
  [132, 204, 22], // limeta
  [159, 18, 57], // bordo
];

/** krug: osnovna, svjetlija, tamnija, još svjetlija, još tamnija (+ = prema bijeloj, − = prema crnoj) */
const TONOVI = [0, 0.4, -0.35, 0.65, -0.55];

function mijesaj([r, g, b]: [number, number, number], t: number): [number, number, number] {
  const cilj = t >= 0 ? 255 : 0;
  const k = Math.abs(t);
  return [r, g, b].map((c) => Math.round(c + (cilj - c) * k)) as [number, number, number];
}

const css = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`;

/** Svjetlina boje 0–1 (za izbor crnog ili bijelog teksta). */
function svjetlina([r, g, b]: [number, number, number]) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export type BojaKlijenta = { pozadina: string; rub: string; tekst: string };

/** Boja za klijenta s rednim brojem `broj` (1, 2, 3 …). Bez broja: neutralna siva. */
export function bojaKlijenta(broj: number | null | undefined): BojaKlijenta {
  if (!broj || broj < 1) return { pozadina: "rgb(82, 82, 91)", rub: "rgb(113, 113, 122)", tekst: "#fff" };
  const i = broj - 1;
  const boja = mijesaj(OSNOVNE[i % OSNOVNE.length], TONOVI[Math.floor(i / OSNOVNE.length) % TONOVI.length]);
  return {
    pozadina: css(boja),
    rub: css(mijesaj(boja, -0.35)),
    tekst: svjetlina(boja) > 0.6 ? "#18181b" : "#fff",
  };
}
