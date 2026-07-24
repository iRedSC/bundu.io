import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ClientRegistryProjection } from "@bundu/shared/registry";
import {
    parseCompiledModels,
    parseManifest,
} from "../../../packages/client/src/assets/resource_packs";
import { replaceClientRegistries } from "../../../packages/client/src/configs/registries";
import { applyLang } from "../../../packages/client/src/lang/lang";
import { replaceCompiledModelDefs } from "../../../packages/client/src/models/defs";
import { applyClientGameplay } from "../../../packages/client/src/models/shadow";
import { applyStatBars } from "../../../packages/client/src/ui/stat_bars_config";

const root = path.resolve("scripts/public/site/base-pack");

function read(relative: string): Buffer {
    return fs.readFileSync(path.join(root, relative));
}

function json(relative: string): unknown {
    return JSON.parse(read(relative).toString("utf8"));
}

function hash(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

describe("bundled resource pack compatibility", () => {
    test("the generated format-2 manifest verifies and installs on the client", () => {
        const manifest = parseManifest(json("manifest.json"));
        const payloads = [
            manifest.models,
            manifest.registries,
            manifest.gameplay,
            manifest.statBars,
            manifest.lang,
        ];

        for (const payload of payloads) {
            expect(payload).toBeDefined();
            if (!payload) throw new Error("expected language payload");
            expect(hash(read(payload.url))).toBe(payload.hash);
        }
        for (const asset of manifest.assets) {
            const bytes = read(path.join("assets", asset.path));
            expect(bytes.byteLength).toBe(asset.size);
            expect(hash(bytes)).toBe(asset.hash);
        }

        const models = parseCompiledModels(json(manifest.models.url));
        const registries = json(
            manifest.registries.url
        ) as ClientRegistryProjection;
        replaceClientRegistries(registries);
        replaceCompiledModelDefs(
            models,
            manifest.assets.map((asset) => asset.path)
        );
        expect(applyClientGameplay(json(manifest.gameplay.url))).toBeDefined();
        expect(applyStatBars(json(manifest.statBars.url))).toBeDefined();
        if (!manifest.lang) throw new Error("expected language payload");
        expect(applyLang(json(manifest.lang.url))).toBeDefined();
    });

    test("accepts the legacy format-2 stat_bars key without language", () => {
        const current = json("manifest.json");
        if (!current || typeof current !== "object" || Array.isArray(current)) {
            throw new Error("expected manifest object");
        }
        const { statBars, lang: _lang, ...legacy } = current as Record<
            string,
            unknown
        >;

        expect(
            parseManifest({ ...legacy, stat_bars: statBars }).lang
        ).toBeUndefined();
    });
});
