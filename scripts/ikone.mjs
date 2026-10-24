// Izrada ikona aplikacije iz plamena u logu.
// Pokretanje (iz mape projekta):  node scripts/ikone.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const PLAMEN =
  "M12.6 2.2c.9 3.6-1.4 5.4-2.8 7.2C8.6 11 7.6 12.5 7.6 14.6c0 3.4 2.2 6.2 4.9 6.2s4.9-2.4 4.9-5.7c0-2-.9-3.6-1.9-4.8-.2 1.4-.9 2.4-2 2.9.5-3.7-.2-7.4-.9-11z";
// Središte i visina plamena u njegovom 24×24 okviru
const SREDISTE = { x: 12.5, y: 11.5 };
const VISINA = 18.6;

/** @param {number} udioVisine koliki dio ikone zauzima plamen (maskable ikone trebaju više ruba) */
function svg(udioVisine, zaobljeno = false) {
  const mjerilo = (512 * udioVisine) / VISINA;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fb923c"/>
      <stop offset="1" stop-color="#ef4444"/>
    </linearGradient>
    <radialGradient id="sjaj" cx="0.5" cy="0.62" r="0.5">
      <stop offset="0" stop-color="#f97316" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#f97316" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${zaobljeno ? 112 : 0}" fill="#0a0a0b"/>
  <rect width="512" height="512" rx="${zaobljeno ? 112 : 0}" fill="url(#sjaj)"/>
  <g transform="translate(256 ${256 + 6}) scale(${mjerilo.toFixed(3)}) translate(${-SREDISTE.x} ${-SREDISTE.y})">
    <path d="${PLAMEN}" fill="url(#g)"/>
  </g>
</svg>`;
}

const izlaz = [
  // [datoteka, veličina, udio plamena, zaobljeni kutovi]
  ["public/ikone/ikona-192.png", 192, 0.7, false],
  ["public/ikone/ikona-512.png", 512, 0.7, false],
  ["public/ikone/ikona-maskable-512.png", 512, 0.52, false],
  ["src/app/apple-icon.png", 180, 0.66, false],
  ["src/app/icon.png", 64, 0.78, true],
];

mkdirSync("public/ikone", { recursive: true });
for (const [datoteka, velicina, udio, zaobljeno] of izlaz) {
  await sharp(Buffer.from(svg(udio, zaobljeno)))
    .resize(velicina, velicina)
    .png({ compressionLevel: 9 })
    .toFile(datoteka);
  console.log("✓", datoteka);
}
