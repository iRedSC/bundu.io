import {
    GlProgram,
    GpuProgram,
    Mesh,
    MeshGeometry,
    Shader,
    Texture,
    UniformGroup,
    type Container,
} from "pixi.js";
import { TILE_SIZE, WORLD_TILES } from "@bundu/shared/tiles";
import type { GroundPatchRef } from "./shore";

const AMPLITUDE = 1.15;
const OUTER_PAD = AMPLITUDE + 0.1;
/** Safe against the maximum inward organic cut while extending texture under it. */
export const LAND_FILL_INSET_TILES = 2;
/** Geometry reaches farther inland to crossfade textured fills into edge color. */
const INNER_PAD = 4;

export type LandBorderSegment = {
    side: "top" | "right" | "bottom" | "left";
    start: number;
    end: number;
    organic: boolean;
};

const glVertex = `
#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vWorldTile;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
    vWorldTile = aUV;
    vec3 position = uProjectionMatrix * uWorldTransformMatrix *
        uTransformMatrix * vec3(aPosition, 1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const glFragment = `
#version 300 es
in vec2 vWorldTile;
out vec4 finalColor;
uniform vec4 uBounds;
uniform vec4 uLandColor;
uniform float uOrganic;
uniform float uTextured;
uniform vec4 uFillBounds;
uniform sampler2D uFillTexture;

float boxSdf(vec2 p, vec4 box) {
    vec2 center = box.xy + box.zw * 0.5;
    vec2 q = abs(p - center) - box.zw * 0.5;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0));
}

float seamOffset(vec2 p) {
    float wx = p.x
        + 0.9 * sin(0.45 * p.y + 0.2 * p.x + 0.6)
        + 0.5 * sin(1.0 * p.x - 0.62 * p.y + 2.1);
    float wy = p.y
        + 0.9 * sin(0.4 * p.x - 0.26 * p.y + 1.9)
        + 0.5 * sin(0.92 * p.y + 0.68 * p.x + 0.4);
    return ${AMPLITUDE} * (
        0.30 * sin(1.6 * wx + 0.7 * wy)
        + 0.22 * sin(1.0 * wx - 1.4 * wy + 1.4)
        + 0.18 * sin(2.6 * wx + 1.2 * wy + 2.7)
        + 0.16 * sin(0.68 * (wx + wy) + 0.8)
        + 0.10 * sin(3.5 * wx - 2.1 * wy + 3.9)
    );
}

void main() {
    float edge = boxSdf(vWorldTile, uBounds);
    edge -= seamOffset(vWorldTile) * uOrganic;
    float aa = 0.01;
    float coverage = 1.0 - smoothstep(-aa, aa, edge);
    float insetBlend = smoothstep(-4.0, -2.5, edge);
    vec2 fillUv = clamp(
        (vWorldTile - uFillBounds.xy) / uFillBounds.zw,
        vec2(0.0),
        vec2(1.0)
    );
    vec3 fillColor = texture(uFillTexture, fillUv).rgb;
    vec3 texturedColor = mix(fillColor, uLandColor.rgb, insetBlend);
    vec3 color = mix(uLandColor.rgb, texturedColor, uTextured);
    if (coverage <= 0.0) discard;
    finalColor = vec4(color * coverage, coverage);
}`;

const gpuSource = `
struct GlobalUniforms {
    uProjectionMatrix: mat3x3<f32>,
    uWorldTransformMatrix: mat3x3<f32>,
    uWorldColorAlpha: vec4<f32>,
    uResolution: vec2<f32>,
};
struct LocalUniforms {
    uTransformMatrix: mat3x3<f32>,
    uColor: vec4<f32>,
    uRound: f32,
};
struct BorderUniforms {
    uBounds: vec4<f32>,
    uLandColor: vec4<f32>,
    uOrganic: f32,
    uTextured: f32,
    uFillBounds: vec4<f32>,
};
@group(0) @binding(0) var<uniform> globalUniforms: GlobalUniforms;
@group(1) @binding(0) var<uniform> localUniforms: LocalUniforms;
@group(2) @binding(0) var<uniform> borderUniforms: BorderUniforms;
@group(2) @binding(1) var uFillTexture: texture_2d<f32>;
@group(2) @binding(2) var uFillSampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) worldTile: vec2<f32>,
};

@vertex
fn mainVertex(
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>
) -> VertexOutput {
    let matrix = globalUniforms.uProjectionMatrix *
        globalUniforms.uWorldTransformMatrix * localUniforms.uTransformMatrix;
    var out: VertexOutput;
    out.position = vec4<f32>((matrix * vec3<f32>(position, 1.0)).xy, 0.0, 1.0);
    out.worldTile = uv;
    return out;
}

fn boxSdf(p: vec2<f32>, box: vec4<f32>) -> f32 {
    let center = box.xy + box.zw * 0.5;
    let q = abs(p - center) - box.zw * 0.5;
    return min(max(q.x, q.y), 0.0) + length(max(q, vec2<f32>(0.0)));
}

fn seamOffset(p: vec2<f32>) -> f32 {
    let wx = p.x
        + 0.9 * sin(0.45 * p.y + 0.2 * p.x + 0.6)
        + 0.5 * sin(1.0 * p.x - 0.62 * p.y + 2.1);
    let wy = p.y
        + 0.9 * sin(0.4 * p.x - 0.26 * p.y + 1.9)
        + 0.5 * sin(0.92 * p.y + 0.68 * p.x + 0.4);
    return ${AMPLITUDE} * (
        0.30 * sin(1.6 * wx + 0.7 * wy)
        + 0.22 * sin(1.0 * wx - 1.4 * wy + 1.4)
        + 0.18 * sin(2.6 * wx + 1.2 * wy + 2.7)
        + 0.16 * sin(0.68 * (wx + wy) + 0.8)
        + 0.10 * sin(3.5 * wx - 2.1 * wy + 3.9)
    );
}

@fragment
fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
    var edge = boxSdf(input.worldTile, borderUniforms.uBounds);
    edge -= seamOffset(input.worldTile) * borderUniforms.uOrganic;
    let aa = 0.01;
    let coverage = 1.0 - smoothstep(-aa, aa, edge);
    let insetBlend = smoothstep(-4.0, -2.5, edge);
    let fillUv = clamp(
        (input.worldTile - borderUniforms.uFillBounds.xy) /
            borderUniforms.uFillBounds.zw,
        vec2<f32>(0.0),
        vec2<f32>(1.0)
    );
    let fillColor = textureSample(uFillTexture, uFillSampler, fillUv).rgb;
    let texturedColor = mix(
        fillColor,
        borderUniforms.uLandColor.rgb,
        insetBlend
    );
    let color = mix(
        borderUniforms.uLandColor.rgb,
        texturedColor,
        borderUniforms.uTextured
    );
    if (coverage <= 0.0) { discard; }
    return vec4<f32>(color * coverage, coverage);
}`;

export function buildLandBorderSegments(
    patches: readonly GroundPatchRef[],
    isOceanType: (type: number) => boolean
): Map<number, LandBorderSegment[]> {
    const land = new Uint8Array(WORLD_TILES * WORLD_TILES);
    for (const patch of [...patches].sort((a, b) => a.id - b.id)) {
        const value = isOceanType(patch.type) ? 0 : 1;
        const x0 = Math.max(0, patch.x);
        const y0 = Math.max(0, patch.y);
        const x1 = Math.min(WORLD_TILES, patch.x + patch.w);
        const y1 = Math.min(WORLD_TILES, patch.y + patch.h);
        for (let y = y0; y < y1; y++) {
            land.fill(value, y * WORLD_TILES + x0, y * WORLD_TILES + x1);
        }
    }

    const result = new Map<number, LandBorderSegment[]>();
    for (const patch of patches) {
        if (isOceanType(patch.type)) continue;
        const segments: LandBorderSegment[] = [];
        appendSideRuns(segments, patch, "top", land);
        appendSideRuns(segments, patch, "right", land);
        appendSideRuns(segments, patch, "bottom", land);
        appendSideRuns(segments, patch, "left", land);
        result.set(patch.id, segments);
    }
    return result;
}

export function setLandBorderMeshes(
    layer: Container,
    segments: readonly LandBorderSegment[],
    bounds: { x: number; y: number; width: number; height: number },
    color: number,
    fillTexture?: Texture,
    fillBounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    } = bounds
): void {
    clearLandBorderMeshes(layer);
    for (const organic of [false, true]) {
        const selected = segments.filter((segment) => segment.organic === organic);
        if (selected.length === 0) continue;
        const geometry = borderGeometry(selected, bounds);
        const uniforms = new UniformGroup({
            uBounds: {
                value: new Float32Array([
                    bounds.x / TILE_SIZE,
                    bounds.y / TILE_SIZE,
                    bounds.width / TILE_SIZE,
                    bounds.height / TILE_SIZE,
                ]),
                type: "vec4<f32>",
            },
            uLandColor: {
                value: new Float32Array([
                    ((color >> 16) & 0xff) / 255,
                    ((color >> 8) & 0xff) / 255,
                    (color & 0xff) / 255,
                    1,
                ]),
                type: "vec4<f32>",
            },
            uOrganic: { value: organic ? 1 : 0, type: "f32" },
            uTextured: { value: fillTexture ? 1 : 0, type: "f32" },
            uFillBounds: {
                value: new Float32Array([
                    fillBounds.x / TILE_SIZE,
                    fillBounds.y / TILE_SIZE,
                    fillBounds.width / TILE_SIZE,
                    fillBounds.height / TILE_SIZE,
                ]),
                type: "vec4<f32>",
            },
        });
        const texture = fillTexture ?? Texture.WHITE;
        const shader = new Shader({
            glProgram: GlProgram.from({
                vertex: glVertex,
                fragment: glFragment,
                name: "land-border",
            }),
            gpuProgram: GpuProgram.from({
                vertex: { source: gpuSource, entryPoint: "mainVertex" },
                fragment: { source: gpuSource, entryPoint: "mainFragment" },
            }),
            resources: {
                borderUniforms: uniforms,
                uFillTexture: texture.source,
                uFillSampler: texture.source.style,
            },
        });
        layer.addChild(new Mesh({ geometry, shader }));
    }
}

export function clearLandBorderMeshes(layer: Container): void {
    for (const child of layer.removeChildren()) {
        if (child instanceof Mesh) {
            child.geometry.destroy();
            child.shader?.destroy();
        }
        child.destroy();
    }
}

function appendSideRuns(
    out: LandBorderSegment[],
    patch: GroundPatchRef,
    side: LandBorderSegment["side"],
    land: Uint8Array
): void {
    const vertical = side === "left" || side === "right";
    const first = vertical ? patch.y : patch.x;
    const last = first + (vertical ? patch.h : patch.w);
    let start = first;
    let organic = outsideIsLand(patch, side, first, land);
    for (let at = first + 1; at < last; at++) {
        const next = outsideIsLand(patch, side, at, land);
        if (next === organic) continue;
        out.push({ side, start, end: at, organic });
        start = at;
        organic = next;
    }
    if (last > first) out.push({ side, start, end: last, organic });
}

function outsideIsLand(
    patch: GroundPatchRef,
    side: LandBorderSegment["side"],
    at: number,
    land: Uint8Array
): boolean {
    const x =
        side === "left"
            ? patch.x - 1
            : side === "right"
              ? patch.x + patch.w
              : at;
    const y =
        side === "top"
            ? patch.y - 1
            : side === "bottom"
              ? patch.y + patch.h
              : at;
    return (
        x >= 0 &&
        y >= 0 &&
        x < WORLD_TILES &&
        y < WORLD_TILES &&
        land[y * WORLD_TILES + x] !== 0
    );
}

function borderGeometry(
    segments: readonly LandBorderSegment[],
    bounds: { x: number; y: number; width: number; height: number }
): MeshGeometry {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const box = {
        x0: bounds.x / TILE_SIZE,
        y0: bounds.y / TILE_SIZE,
        x1: (bounds.x + bounds.width) / TILE_SIZE,
        y1: (bounds.y + bounds.height) / TILE_SIZE,
    };
    for (const segment of segments) {
        const vertical = segment.side === "left" || segment.side === "right";
        const x0 = vertical
            ? (segment.side === "left" ? box.x0 - OUTER_PAD : box.x1 - INNER_PAD)
            : segment.start - OUTER_PAD;
        const x1 = vertical
            ? (segment.side === "left" ? box.x0 + INNER_PAD : box.x1 + OUTER_PAD)
            : segment.end + OUTER_PAD;
        const y0 = vertical
            ? segment.start - OUTER_PAD
            : segment.side === "top"
              ? box.y0 - OUTER_PAD
              : box.y1 - INNER_PAD;
        const y1 = vertical
            ? segment.end + OUTER_PAD
            : segment.side === "top"
              ? box.y0 + INNER_PAD
              : box.y1 + OUTER_PAD;
        const base = positions.length / 2;
        const tilePositions = [x0, y0, x1, y0, x1, y1, x0, y1];
        uvs.push(...tilePositions);
        positions.push(...tilePositions.map((value) => value * TILE_SIZE));
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return new MeshGeometry({
        positions: new Float32Array(positions),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
    });
}
