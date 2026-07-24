import { beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
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
import { loadConfigs } from "../../../packages/server/src/configs/loaders/load";
import { ResourcePackService } from "../../../packages/server/src/configs/resource_packs";

function hash(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

describe("server/client resource pack compatibility", () => {
    let service: ResourcePackService;

    beforeAll(async () => {
        loadConfigs();
        service = await ResourcePackService.create();
    });

    test("the server format-2 manifest verifies and installs on the client", () => {
        const manifest = parseManifest(service.manifest);
        const payloads: readonly [
            entry: { hash: string; url: string } | undefined,
            payload: string,
        ][] = [
            [manifest.models, service.modelsJson],
            [manifest.registries, service.registriesJson],
            [manifest.gameplay, service.gameplayJson],
            [manifest.statBars, service.statBarsJson],
            [manifest.lang, service.langJson],
        ];

        for (const [entry, payload] of payloads) {
            expect(entry).toBeDefined();
            if (!entry) throw new Error("expected language payload");
            expect(hash(new TextEncoder().encode(payload))).toBe(entry.hash);
        }
        for (const asset of manifest.assets) {
            const served = service.asset(asset.path);
            expect(served).toBeDefined();
            if (!served) throw new Error(`expected asset ${asset.path}`);
            expect(served.bytes.byteLength).toBe(asset.size);
            expect(hash(served.bytes)).toBe(asset.hash);
        }

        const models = parseCompiledModels(JSON.parse(service.modelsJson));
        const registries = JSON.parse(
            service.registriesJson
        ) as ClientRegistryProjection;
        replaceClientRegistries(registries);
        replaceCompiledModelDefs(
            models,
            manifest.assets.map((asset) => asset.path)
        );
        expect(
            applyClientGameplay(JSON.parse(service.gameplayJson))
        ).toBeDefined();
        expect(applyStatBars(JSON.parse(service.statBarsJson))).toBeDefined();
        if (!manifest.lang) throw new Error("expected language payload");
        expect(applyLang(JSON.parse(service.langJson))).toBeDefined();
    });

    test("accepts the legacy format-2 stat_bars key without language", () => {
        const { statBars, lang: _lang, ...legacy } = service.manifest;

        expect(
            parseManifest({ ...legacy, stat_bars: statBars }).lang
        ).toBeUndefined();
    });
});
