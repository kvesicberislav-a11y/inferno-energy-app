// Kopira datoteku čitača barkodova (zxing .wasm) u public/, da se servira s našeg
// Cloudflarea umjesto s tuđeg CDN-a. Pokreće se automatski prije svakog builda (prebuild).
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

const verzija = JSON.parse(readFileSync("node_modules/zxing-wasm/package.json", "utf8")).version;
const cilj = `public/zxing/${verzija}`;
mkdirSync(cilj, { recursive: true });
copyFileSync("node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", `${cilj}/zxing_reader.wasm`);
console.log(`✓ zxing_reader.wasm ${verzija} -> ${cilj}`);
