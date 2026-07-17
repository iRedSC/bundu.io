/**
 * Emit the sanitized bundu-only pack stack into the client build output so
 * base-pack servers can skip re-downloading textures/visuals/registries.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..");
const bunduPack = path.join(repoRoot, "packs", "bundu");
const outdir = path.resolve(
    repoRoot,
    process.argv[2] ?? "public/site/base-pack"
);

if (!fs.existsSync(path.join(bunduPack, "pack.yml"))) {
    throw new Error(`Missing base pack at ${bunduPack}`);
}

// Copy into an isolated root so overlay packs under ./packs are never bundled.
// (Dirent.isDirectory() is false for symlinks, so a link is not enough.)
const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bundu-base-pack-"));
fs.cpSync(bunduPack, path.join(packRoot, "bundu"), { recursive: true });
process.env.BUNDU_PACK_ROOT = packRoot;

const { loadConfigs } = await import(
    "../packages/server/src/configs/loaders/load"
);
const { packs } = await import("../packages/server/src/configs/packs");
const { ResourcePackService } = await import(
    "../packages/server/src/configs/resource_packs"
);

if (packs.packs.length !== 1 || packs.packs[0]?.manifest.id !== "bundu") {
    throw new Error(
        `Expected bundu-only pack stack, got ${packs.packs
            .map((pack) => pack.manifest.id)
            .join(", ")}`
    );
}

loadConfigs();
const resourcePacks = await ResourcePackService.create();

fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

const visualsPath = path.join(outdir, "visuals.json");
const registriesPath = path.join(outdir, "registries.json");
fs.writeFileSync(visualsPath, resourcePacks.visualsJson);
fs.writeFileSync(registriesPath, resourcePacks.registriesJson);

const assetsRoot = path.join(outdir, "assets");
for (const entry of resourcePacks.manifest.assets) {
    const asset = resourcePacks.asset(entry.path);
    if (!asset) {
        throw new Error(`Missing sanitized asset bytes for ${entry.path}`);
    }
    const filename = path.join(assetsRoot, ...entry.path.split("/"));
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, asset.bytes);
}

const bundledManifest = {
    format: 2 as const,
    fingerprint: resourcePacks.manifest.fingerprint,
    packs: resourcePacks.manifest.packs,
    visuals: {
        hash: resourcePacks.manifest.visuals.hash,
        url: "visuals.json",
    },
    registries: {
        hash: resourcePacks.manifest.registries.hash,
        url: "registries.json",
    },
    assets: resourcePacks.manifest.assets,
};

fs.writeFileSync(
    path.join(outdir, "manifest.json"),
    JSON.stringify(bundledManifest)
);

fs.rmSync(packRoot, { recursive: true, force: true });

console.log(
    `[bundle-base-pack] wrote ${resourcePacks.manifest.assets.length} assets → ${path.relative(repoRoot, outdir)} (${resourcePacks.manifest.fingerprint.slice(0, 12)})`
);
