import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { toSanitizedTexturePath } from "@bundu/shared/models/texture_paths";

/** Hard caps for hostile pack textures before they are served to clients. */
export const PACK_ASSET_LIMITS = {
    maxInputBytes: 2 * 1024 * 1024,
    maxOutputBytes: 4 * 1024 * 1024,
    maxDimension: 2048,
    maxAssets: 2_000,
    maxTotalOutputBytes: 64 * 1024 * 1024,
} as const;

/** Bump when sanitize output rules change. */
const SANITIZE_CACHE_VERSION = 1;

const RASTER_EXT = new Set(["png", "jpg", "jpeg", "webp", "avif", "gif"]);

/** Fail closed on SVG features resvg will not execute but that still signal malice. */
const UNSAFE_SVG = new RegExp(
    [
        "<script[\\s>]",
        "foreignObject[\\s>]",
        "\\bon\\w+\\s*=",
        "javascript:",
        "data:\\s*text\\/html",
        "<!ENTITY",
        "<!DOCTYPE",
        "(?:xlink:)?href\\s*=\\s*[\"']\\s*(?:https?:|\\/\\/)",
    ].join("|"),
    "i"
);

export type SanitizedPackAsset = {
    path: string;
    bytes: Uint8Array;
};

function extension(logicalPath: string): string {
    return logicalPath.slice(logicalPath.lastIndexOf(".") + 1).toLowerCase();
}

function sanitizeCacheDir(): string {
    return path.join(process.cwd(), ".cache", "sanitized-pack-assets");
}

function sanitizeCacheKey(logicalPath: string, input: Uint8Array): string {
    return createHash("sha256")
        .update(`v${SANITIZE_CACHE_VERSION}:`)
        .update(logicalPath)
        .update(input)
        .digest("hex");
}

function readSanitizeCache(key: string): Uint8Array | undefined {
    const filename = path.join(sanitizeCacheDir(), `${key}.png`);
    if (!fs.existsSync(filename)) return undefined;
    try {
        return new Uint8Array(fs.readFileSync(filename));
    } catch {
        return undefined;
    }
}

function writeSanitizeCache(key: string, bytes: Uint8Array): void {
    const dir = sanitizeCacheDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${key}.png`), bytes);
}

function assertWithinLimits(
    path: string,
    bytes: Uint8Array,
    width: number,
    height: number
): void {
    if (
        width <= 0 ||
        height <= 0 ||
        width > PACK_ASSET_LIMITS.maxDimension ||
        height > PACK_ASSET_LIMITS.maxDimension
    ) {
        throw new Error(
            `${path}: image dimensions ${width}x${height} exceed ${PACK_ASSET_LIMITS.maxDimension}`
        );
    }
    if (bytes.byteLength > PACK_ASSET_LIMITS.maxOutputBytes) {
        throw new Error(
            `${path}: sanitized asset is ${bytes.byteLength} bytes (max ${PACK_ASSET_LIMITS.maxOutputBytes})`
        );
    }
}

async function encodePng(input: Uint8Array, path: string): Promise<Uint8Array> {
    const image = sharp(input, { failOn: "error" }).rotate();
    const meta = await image.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    // Level 6 is sharp's default — level 9 made cold start miss CI smoke windows.
    const bytes = new Uint8Array(
        await image.png({ compressionLevel: 6 }).toBuffer()
    );
    assertWithinLimits(path, bytes, width, height);
    return bytes;
}

function rasterizeSvg(input: Uint8Array, path: string): Uint8Array {
    const text = new TextDecoder("utf8", { fatal: false }).decode(input);
    if (UNSAFE_SVG.test(text)) {
        throw new Error(`${path}: rejected unsafe SVG content`);
    }
    try {
        const source = Buffer.from(input);
        const measured = new Resvg(source, {
            font: { loadSystemFonts: false },
        });
        const maxEdge = Math.max(measured.width, measured.height);
        if (maxEdge <= 0) {
            throw new Error(`${path}: SVG has invalid dimensions`);
        }
        const resvg =
            maxEdge <= PACK_ASSET_LIMITS.maxDimension
                ? measured
                : new Resvg(source, {
                      font: { loadSystemFonts: false },
                      fitTo: {
                          mode: "width",
                          value: Math.max(
                              1,
                              Math.floor(
                                  (measured.width /
                                      maxEdge) *
                                      PACK_ASSET_LIMITS.maxDimension
                              )
                          ),
                      },
                  });
        return new Uint8Array(resvg.render().asPng());
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${path}: failed to rasterize SVG (${message})`);
    }
}

/** Sanitize one pack texture into a PNG suitable for hostile clients. */
export async function sanitizePackTexture(
    logicalPath: string,
    input: Uint8Array
): Promise<SanitizedPackAsset> {
    if (input.byteLength > PACK_ASSET_LIMITS.maxInputBytes) {
        throw new Error(
            `${logicalPath}: input is ${input.byteLength} bytes (max ${PACK_ASSET_LIMITS.maxInputBytes})`
        );
    }
    const outPath = toSanitizedTexturePath(logicalPath);
    const cacheKey = sanitizeCacheKey(logicalPath, input);
    const cached = readSanitizeCache(cacheKey);
    if (cached) {
        return { path: outPath, bytes: cached };
    }

    const ext = extension(logicalPath);
    let bytes: Uint8Array;
    if (ext === "svg") {
        const raster = rasterizeSvg(input, logicalPath);
        bytes = await encodePng(raster, outPath);
    } else if (!RASTER_EXT.has(ext)) {
        throw new Error(`${logicalPath}: unsupported pack texture type ".${ext}"`);
    } else {
        bytes = await encodePng(input, outPath);
    }
    writeSanitizeCache(cacheKey, bytes);
    return { path: outPath, bytes };
}

/** Enforce pack-wide asset count / total size caps after per-file sanitization. */
export function assertPackAssetBudget(
    assets: readonly SanitizedPackAsset[]
): void {
    if (assets.length > PACK_ASSET_LIMITS.maxAssets) {
        throw new Error(
            `pack assets: ${assets.length} files exceed max ${PACK_ASSET_LIMITS.maxAssets}`
        );
    }
    let total = 0;
    for (const asset of assets) total += asset.bytes.byteLength;
    if (total > PACK_ASSET_LIMITS.maxTotalOutputBytes) {
        throw new Error(
            `pack assets: ${total} total bytes exceed max ${PACK_ASSET_LIMITS.maxTotalOutputBytes}`
        );
    }
}
