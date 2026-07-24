import { describe, expect, test } from "bun:test";
import type { GroundModelSet } from "@bundu/shared/ground_models";
import type { CompiledModelDefs } from "@bundu/shared/models/compile";
import type { ModelDef } from "@bundu/shared/models/types";
import {
    validateCompiledTextures,
    validateGroundModelTextures,
} from "../../../packages/server/src/configs/resource_packs";

const TEXTURE = "bundu/textures/fixture.png";

function model(overrides: Partial<ModelDef>): CompiledModelDefs {
    const def: ModelDef = {
        id: "bundu:fixture",
        abstract: false,
        parts: [],
        animations: {},
        states: {},
        stateOrder: [],
        displays: {},
        ...overrides,
    };
    return new Map([[def.id, def]]);
}

describe("resource pack texture references", () => {
    const compiledReferences: readonly [name: string, defs: CompiledModelDefs][] =
        [
            ["model texture", model({ texture: TEXTURE })],
            [
                "display texture",
                model({ displays: { inventory: { texture: TEXTURE } } }),
            ],
            [
                "part sprite",
                model({
                    parts: [
                        {
                            name: "body",
                            sprite: TEXTURE,
                            x: 0,
                            y: 0,
                            scale: 1,
                            rotation: 0,
                            anchor: { x: 0.5, y: 0.5 },
                            pivot: { x: 0, y: 0 },
                            zIndex: 0,
                        },
                    ],
                }),
            ],
            [
                "variant replacement",
                model({ variants: { alternate: { body: TEXTURE } } }),
            ],
            [
                "footstep texture",
                model({
                    footsteps: {
                        intervalMs: 100,
                        size: 1,
                        lifetime: 100,
                        alpha: 1,
                        fadeAt: 0.5,
                        stride: 1,
                        texture: TEXTURE,
                    },
                }),
            ],
        ];

    for (const [name, defs] of compiledReferences) {
        test(`validates ${name}`, () => {
            expect(() =>
                validateCompiledTextures(defs, new Set([TEXTURE]))
            ).not.toThrow();
            expect(() => validateCompiledTextures(defs, new Set())).toThrow(
                `missing texture "${TEXTURE}"`
            );
        });
    }

    test("validates every ocean ground texture", () => {
        const textureKeys = [
            "caustics",
            "displace",
            "rippleIdle",
            "rippleMove",
            "foam",
            "sparkle",
        ] as const;
        const textures = Object.fromEntries(
            textureKeys.map((key) => [key, `${key}.svg`])
        ) as Record<(typeof textureKeys)[number], string>;
        const models: GroundModelSet = {
            ocean: {
                id: "ocean",
                kind: "ocean",
                color: "#000000",
                fadeTiles: 1,
                transitionTiles: 1,
                shoreOvershoot: false,
                surfaceLayer: false,
                displacement: { strength: 1, scroll: 1, worldScale: 1 },
                textures,
            },
        };
        const available = new Set(
            textureKeys.map((key) => `${key}.png`)
        );

        expect(() =>
            validateGroundModelTextures(models, available)
        ).not.toThrow();
        for (const key of textureKeys) {
            const withoutKey = new Set(available);
            withoutKey.delete(`${key}.png`);
            expect(() =>
                validateGroundModelTextures(models, withoutKey)
            ).toThrow(`ground_model.ocean.textures.${key}`);
        }
    });
});
