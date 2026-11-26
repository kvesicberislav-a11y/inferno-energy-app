// Prije svake izgradnje (prebuild): oznaka verzije = trenutak izgradnje.
// Zapisuje se u public/verzija.json; next.config.ts istu oznaku ugradi u aplikaciju.
// Otvorena aplikacija uspoređuje svoju oznaku s verzija.json na poslužitelju i
// sama se osvježi kad izađe nova verzija (components/NovaVerzija.tsx).
import { writeFileSync } from "node:fs";

const verzija = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
writeFileSync("public/verzija.json", JSON.stringify({ verzija }) + "\n");
console.log(`✓ oznaka verzije ${verzija} -> public/verzija.json`);
