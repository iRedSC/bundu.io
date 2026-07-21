import path from "node:path";
import { discoverPacks } from "./generate";
import { migratePackToDefs } from "./migrate";

const packsRoot = path.resolve(
    process.argv[2] ?? path.join(import.meta.dirname, "../../packs")
);

for (const packRoot of discoverPacks(packsRoot)) {
    const result = migratePackToDefs(packRoot);
    console.log(
        `pack-gen migrate: ${path.basename(packRoot)}\n` +
            `  paired=${result.paired} dataOnly=${result.dataOnly} assetsOnly=${result.assetsOnly} wrote=${result.wrote.length}`
    );
}
