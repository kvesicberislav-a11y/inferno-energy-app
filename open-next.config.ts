import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Sve stranice su statične (bez osvježavanja na poslužitelju), pa ih Worker šalje
// gotove iz predmemorije umjesto da ih svaki put iznova slaže – štedi procesorsko
// vrijeme (besplatni plan dopušta 10 ms po zahtjevu).
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
