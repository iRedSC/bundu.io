import { describe, expect, test } from "bun:test";
import {
    assertPackAssetBudget,
    PACK_ASSET_LIMITS,
    sanitizePackTexture,
    type SanitizedPackAsset,
} from "../../../packages/server/src/configs/sanitize_pack_assets";

const encoder = new TextEncoder();

describe("pack asset security fixtures", () => {
    const maliciousSvgs: readonly [name: string, content: string][] = [
        ["script", "<svg><script>alert(1)</script></svg>"],
        ["foreign object", "<svg><foreignObject /></svg>"],
        ["event handler", '<svg onload="alert(1)" />'],
        ["javascript URL", '<svg><a href="javascript:alert(1)" /></svg>'],
        ["HTML data URL", '<svg><image href="data:text/html,x" /></svg>'],
        ["entity", '<!ENTITY x "x"><svg />'],
        ["doctype", "<!DOCTYPE svg><svg />"],
        ["external URL", '<svg><image href="https://example.com/x.png" /></svg>'],
        ["protocol-relative URL", '<svg><image xlink:href="//example.com/x" /></svg>'],
    ];

    for (const [name, content] of maliciousSvgs) {
        test(`rejects SVG ${name}`, async () => {
            expect(
                sanitizePackTexture(
                    "bundu/textures/malicious.svg",
                    encoder.encode(content)
                )
            ).rejects.toThrow("rejected unsafe SVG content");
        });
    }

    test("rejects more assets than the pack count budget", () => {
        const asset: SanitizedPackAsset = {
            path: "bundu/textures/fixture.png",
            bytes: new Uint8Array(),
        };
        const assets = Array.from(
            { length: PACK_ASSET_LIMITS.maxAssets + 1 },
            () => asset
        );

        expect(() => assertPackAssetBudget(assets)).toThrow(
            `${PACK_ASSET_LIMITS.maxAssets + 1} files exceed max ${PACK_ASSET_LIMITS.maxAssets}`
        );
    });

    test("rejects total sanitized bytes over the pack budget", () => {
        const bytes = new Uint8Array(PACK_ASSET_LIMITS.maxOutputBytes);
        const assets = Array.from(
            {
                length:
                    PACK_ASSET_LIMITS.maxTotalOutputBytes /
                        PACK_ASSET_LIMITS.maxOutputBytes +
                    1,
            },
            (_, index): SanitizedPackAsset => ({
                path: `bundu/textures/${index}.png`,
                bytes,
            })
        );

        expect(() => assertPackAssetBudget(assets)).toThrow(
            `total bytes exceed max ${PACK_ASSET_LIMITS.maxTotalOutputBytes}`
        );
    });

    test("accepts assets exactly at both aggregate limits", () => {
        const bytesPerAsset =
            Math.floor(
                PACK_ASSET_LIMITS.maxTotalOutputBytes /
                    PACK_ASSET_LIMITS.maxAssets
            );
        const assets = Array.from(
            { length: PACK_ASSET_LIMITS.maxAssets },
            (_, index): SanitizedPackAsset => ({
                path: `bundu/textures/${index}.png`,
                bytes: new Uint8Array(
                    index === PACK_ASSET_LIMITS.maxAssets - 1
                        ? PACK_ASSET_LIMITS.maxTotalOutputBytes -
                              bytesPerAsset *
                                  (PACK_ASSET_LIMITS.maxAssets - 1)
                        : bytesPerAsset
                ),
            })
        );

        expect(() => assertPackAssetBudget(assets)).not.toThrow();
    });
});
