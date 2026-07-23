/**
 * Organic land fill as a world-space Mesh (Pixi high-shader path).
 * Edge = box SDF − seamOffset in world tiles — resolution follows the screen.
 */
import {
    compileHighShaderGlProgram,
    compileHighShaderGpuProgram,
    Mesh,
    MeshGeometry,
    Rectangle,
    Shader,
    Texture,
    UniformGroup,
} from "pixi.js";
import type { SolidGroundFill } from "@bundu/shared/ground_models";
import { TILE_SIZE } from "@bundu/shared/tiles";
import {
    INLAND_SAMPLE_SCALE,
    type GroundFieldTextures,
} from "./ground_fields";
import { LAND_SEAM_AMPLITUDE } from "./organic_noise";
import { NEARSHORE_OVERSHOOT_TILES } from "./nearshore_fill";

const COAST_CLEAR_TILES = NEARSHORE_OVERSHOOT_TILES;

type ShaderBit = {
    name?: string;
    vertex?: {
        header?: string;
        start?: string;
        main?: string;
        end?: string;
    };
    fragment?: {
        header?: string;
        start?: string;
        main?: string;
        end?: string;
    };
};

function fillTypeId(fill?: SolidGroundFill): number {
    if (fill === "sand_bands") return 1;
    if (fill === "forest_blobs") return 2;
    if (fill === "solid_blobs") return 3;
    return 0;
}

/** Padded world rect for an authored land AABB. */
export function organicLandSpriteRect(bounds: Rectangle): {
    x: number;
    y: number;
    w: number;
    h: number;
    pad: number;
} {
    const pad = Math.ceil(LAND_SEAM_AMPLITUDE + 0.02) * TILE_SIZE;
    return {
        x: bounds.x - pad,
        y: bounds.y - pad,
        w: bounds.width + pad * 2,
        h: bounds.height + pad * 2,
        pad,
    };
}

const localUniformBitGl: ShaderBit = {
    name: "local-uniform-bit",
    vertex: {
        header: `
            uniform mat3 uTransformMatrix;
            uniform vec4 uColor;
            uniform float uRound;
        `,
        main: `
            vColor *= uColor;
            modelMatrix = uTransformMatrix;
        `,
        end: `
            if (uRound == 1.) {
                gl_Position.xy = roundPixels(gl_Position.xy, uResolution);
            }
        `,
    },
};

const localUniformBitGpu: ShaderBit = {
    name: "local-uniform-bit",
    vertex: {
        header: `
            struct LocalUniforms {
                uTransformMatrix: mat3x3<f32>,
                uColor: vec4<f32>,
                uRound: f32,
            }
            @group(1) @binding(0) var<uniform> localUniforms: LocalUniforms;
        `,
        main: `
            vColor *= localUniforms.uColor;
            modelMatrix *= localUniforms.uTransformMatrix;
        `,
        end: `
            if (localUniforms.uRound == 1.0) {
                vPosition = vec4(roundPixels(vPosition.xy, globalUniforms.uResolution), vPosition.zw);
            }
        `,
    },
};

const roundPixelsBitGl: ShaderBit = {
    name: "round-pixels-bit",
    vertex: {
        header: `
            vec2 roundPixels(vec2 position, vec2 targetSize) {
                return (floor(((position * 0.5 + 0.5) * targetSize) + 0.5) / targetSize) * 2.0 - 1.0;
            }
        `,
    },
};

const roundPixelsBitGpu: ShaderBit = {
    name: "round-pixels-bit",
    vertex: {
        header: `
            fn roundPixels(position: vec2<f32>, targetSize: vec2<f32>) -> vec2<f32> {
                return (floor(((position * 0.5 + 0.5) * targetSize) + 0.5) / targetSize) * 2.0 - 1.0;
            }
        `,
    },
};

/** Shared noise / shade helpers (GL). */
const landShadeGl = `
float hash2(vec2 p) {
    ivec2 i = ivec2(floor(p));
    int n = i.x * 374761393 + i.y * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    n = n ^ (n >> 16);
    return float(uint(n)) / 4294967296.0;
}
float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
        mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}
float fbm(vec2 p, int octaves) {
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    float norm = 0.0;
    for (int i = 0; i < 6; i++) {
        if (i >= octaves) break;
        sum += amp * (valueNoise(p * freq) * 2.0 - 1.0);
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
    }
    return norm > 0.0 ? sum / norm : 0.0;
}
float sharpBlob(float t) {
    if (t <= 0.6) return 0.0;
    if (t >= 0.78) return 1.0;
    float u = (t - 0.6) / 0.18;
    return u * u * (3.0 - 2.0 * u);
}
float hardBlob(float t) { return t >= 0.72 ? 1.0 : 0.0; }
vec3 applyLandShade(vec3 base, float lumScale, float chroma) {
    vec3 c = base * lumScale;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = lum + (c - lum) * (1.0 + chroma * 0.14);
    float twist = chroma * 0.045;
    c = vec3(
        c.r + twist * (c.g - c.b),
        c.g + twist * (c.b - c.r),
        c.b + twist * (c.r - c.g)
    );
    return clamp(c, 0.0, 1.0);
}
vec3 shadeSand(vec3 base, vec2 tile, float shore) {
    float warp =
        0.85 * sin(0.29 * tile.x + 0.19 * tile.y + 0.8) +
        0.45 * sin(0.62 * tile.y - 0.38 * tile.x + 2.3) +
        0.28 * sin(1.15 * tile.x + 0.72 * tile.y + 4.0) +
        0.14 * sin(1.9 * tile.y - 1.1 * tile.x + 1.4);
    float d = shore + warp;
    float bands =
        sin(1.05 * d + 0.35) +
        0.55 * sin(2.15 * d + 0.18 * tile.x + 1.5) +
        0.32 * sin(0.48 * d - 0.22 * tile.y + 2.9) +
        0.18 * sin(3.2 * d + 0.9 * tile.y + 0.55) +
        0.1 * sin(4.6 * d - 0.4 * tile.x + 3.7);
    float cn = valueNoise(tile * 0.11 + vec2(12.0, 7.0));
    float chroma = sharpBlob(cn) * 0.55 - sharpBlob(1.0 - cn) * 0.45;
    return applyLandShade(base, 1.0 + bands * 0.0294, chroma * 0.55);
}
vec3 shadeForest(vec3 base, vec2 tile) {
    float soft = fbm(tile * 0.2, 4) * 0.65 + fbm(tile * 0.45 + vec2(17.0), 3) * 0.35;
    vec2 b = tile + vec2(fbm(tile * 0.04, 2), fbm(tile * 0.04 + vec2(40.0), 2)) * 2.8;
    float softN = valueNoise(b * 0.13);
    float light = sharpBlob(softN);
    float dark = sharpBlob(1.0 - softN);
    vec2 d = tile + vec2(
        fbm(tile * 0.06 + vec2(200.0), 2),
        fbm(tile * 0.06 + vec2(230.0), 2)
    ) * 1.6;
    float darken = hardBlob(valueNoise(d * 0.19 + vec2(9.0))) * 0.045;
    return applyLandShade(
        base,
        1.0 + soft * 0.07 + light * 0.14 - dark * 0.12 - darken,
        (light - dark) * 0.3
    );
}
vec3 shadeSolid(vec3 base, vec2 tile) {
    vec2 d = tile + vec2(
        fbm(tile * 0.06 + vec2(200.0), 2),
        fbm(tile * 0.06 + vec2(230.0), 2)
    ) * 1.6;
    float n = valueNoise(d * 0.28 + vec2(9.0));
    float darken = 0.0;
    if (n >= 0.82) darken = 0.07;
    else if (n >= 0.72) darken = 0.045;
    return applyLandShade(base, 1.0 - darken, 0.0);
}
float oceanEdgeFade(float shore, float tiles) {
    if (tiles <= 0.0) return 1.0;
    if (shore <= 0.0) return 0.0;
    if (shore >= tiles) return 1.0;
    float u = shore / tiles;
    return u * u * (3.0 - 2.0 * u);
}
vec3 shadeFill(vec3 base, float fillType, vec2 tile, float shore) {
    if (fillType < 0.5) return base;
    vec3 shaded = base;
    if (fillType < 1.5) shaded = shadeSand(base, tile, shore);
    else if (fillType < 2.5) shaded = shadeForest(base, tile);
    else shaded = shadeSolid(base, tile);
    return mix(base, shaded, oceanEdgeFade(shore, 2.25));
}
float boxSdf(vec2 p, vec4 rect) {
    vec2 c = rect.xy + rect.zw * 0.5;
    vec2 q = abs(p - c) - rect.zw * 0.5;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
float coverage(float sdf, float aa) {
    float t = clamp((sdf + aa) / (2.0 * aa), 0.0, 1.0);
    float s = t * t * (3.0 - 2.0 * t);
    return 1.0 - s;
}
float seamOffset(vec2 p) {
    float wx = p.x
        + 0.9 * sin(0.45 * p.y + 0.2 * p.x + 0.6)
        + 0.5 * sin(1.0 * p.x - 0.62 * p.y + 2.1)
        + 0.22 * sin(1.7 * p.y + 0.85 * p.x + 3.4);
    float wy = p.y
        + 0.9 * sin(0.4 * p.x - 0.26 * p.y + 1.9)
        + 0.5 * sin(0.92 * p.y + 0.68 * p.x + 0.4)
        + 0.22 * sin(1.55 * p.x - 1.1 * p.y + 5.0);
    return uAmplitude * (
        0.22 * sin(1.6 * wx + 0.7 * wy) +
        0.17 * sin(1.0 * wx - 1.4 * wy + 1.4) +
        0.14 * sin(2.6 * wx + 1.2 * wy + 2.7) +
        0.12 * sin(0.68 * (wx + wy) + 0.8) +
        0.1 * sin(3.5 * wx - 2.1 * wy + 3.9) +
        0.08 * sin(2.0 * (wx - wy) + 5.1) +
        0.07 * sin(4.7 * wy + 1.15 * wx + 1.2) +
        0.05 * sin(3.0 * wx + 3.3 * wy + 4.4) +
        0.03 * sin(5.4 * (wx + 0.5 * wy) + 0.3) +
        0.02 * sin(6.2 * wy - 3.8 * wx + 2.5)
    );
}
`;

const organicLandBitGl: ShaderBit = {
    name: "organic-land",
    vertex: {
        header: `out vec2 vWorldPos;`,
        main: `vWorldPos = (modelMatrix * vec3(position, 1.0)).xy;`,
    },
    fragment: {
        header: `
in vec2 vWorldPos;
uniform sampler2D uInland;
uniform vec4 uRect;
uniform vec4 uLandColor;
uniform float uAmplitude;
uniform float uCoastClear;
uniform float uInlandScale;
uniform float uWorldTiles;
uniform float uTileSize;
${landShadeGl}
        `,
        main: `
            vec2 tile = vWorldPos / uTileSize;
            float edge = boxSdf(tile, uRect) - seamOffset(tile);
            float alpha = coverage(edge, 0.06);
            vec2 inlandUv = (tile + 0.5) / uWorldTiles;
            vec4 inlandSample = texture(uInland, inlandUv);
            float inland = inlandSample.r * uInlandScale;
            float openInland = inlandSample.g * uInlandScale;
            if (uLandColor.a < 0.5 && openInland <= uCoastClear) {
                alpha = 0.0;
            }
            if (alpha <= 0.001) {
                outColor = vec4(0.0);
            } else {
                vec3 rgb = shadeFill(uLandColor.rgb, uLandColor.a, tile, inland);
                outColor = vec4(rgb * alpha, alpha);
            }
        `,
    },
};

// GPU land shade is large — keep a tighter port focused on the edge + light fill.
const organicLandBitGpu: ShaderBit = {
    name: "organic-land",
    vertex: {
        header: `@out vWorldPos: vec2<f32>;`,
        main: `vWorldPos = (modelMatrix * vec3<f32>(position, 1.0)).xy;`,
    },
    fragment: {
        header: `
struct LandUniforms {
    uRect: vec4<f32>,
    uLandColor: vec4<f32>,
    uAmplitude: f32,
    uCoastClear: f32,
    uInlandScale: f32,
    uWorldTiles: f32,
    uTileSize: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}
@group(2) @binding(0) var<uniform> landUniforms: LandUniforms;
@group(2) @binding(1) var uInland: texture_2d<f32>;
@group(2) @binding(2) var uInlandSampler: sampler;
@in vWorldPos: vec2<f32>;

fn boxSdf(p: vec2<f32>, rect: vec4<f32>) -> f32 {
    let c = rect.xy + rect.zw * 0.5;
    let q = abs(p - c) - rect.zw * 0.5;
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0);
}
fn coverage(sdf: f32, aa: f32) -> f32 {
    let t = clamp((sdf + aa) / (2.0 * aa), 0.0, 1.0);
    let s = t * t * (3.0 - 2.0 * t);
    return 1.0 - s;
}
fn seamOffset(p: vec2<f32>) -> f32 {
    let wx = p.x
        + 0.9 * sin(0.45 * p.y + 0.2 * p.x + 0.6)
        + 0.5 * sin(1.0 * p.x - 0.62 * p.y + 2.1)
        + 0.22 * sin(1.7 * p.y + 0.85 * p.x + 3.4);
    let wy = p.y
        + 0.9 * sin(0.4 * p.x - 0.26 * p.y + 1.9)
        + 0.5 * sin(0.92 * p.y + 0.68 * p.x + 0.4)
        + 0.22 * sin(1.55 * p.x - 1.1 * p.y + 5.0);
    return landUniforms.uAmplitude * (
        0.22 * sin(1.6 * wx + 0.7 * wy) +
        0.17 * sin(1.0 * wx - 1.4 * wy + 1.4) +
        0.14 * sin(2.6 * wx + 1.2 * wy + 2.7) +
        0.12 * sin(0.68 * (wx + wy) + 0.8) +
        0.1 * sin(3.5 * wx - 2.1 * wy + 3.9) +
        0.08 * sin(2.0 * (wx - wy) + 5.1) +
        0.07 * sin(4.7 * wy + 1.15 * wx + 1.2) +
        0.05 * sin(3.0 * wx + 3.3 * wy + 4.4) +
        0.03 * sin(5.4 * (wx + 0.5 * wy) + 0.3) +
        0.02 * sin(6.2 * wy - 3.8 * wx + 2.5)
    );
}
        `,
        main: `
            let tile = vWorldPos / landUniforms.uTileSize;
            var alpha = coverage(boxSdf(tile, landUniforms.uRect) - seamOffset(tile), 0.06);
            let inlandUv = (tile + vec2<f32>(0.5)) / landUniforms.uWorldTiles;
            let inlandSample = textureSample(uInland, uInlandSampler, inlandUv);
            let openInland = inlandSample.g * landUniforms.uInlandScale;
            if (landUniforms.uLandColor.w < 0.5 && openInland <= landUniforms.uCoastClear) {
                alpha = 0.0;
            }
            if (alpha <= 0.001) {
                outColor = vec4<f32>(0.0);
            } else {
                // WebGPU: solid fill color (GL path keeps procedural shade).
                let rgb = landUniforms.uLandColor.xyz;
                outColor = vec4<f32>(rgb * alpha, alpha);
            }
        `,
    },
};

export type OrganicLandMeshOptions = {
    bounds: Rectangle;
    color: number;
    fill?: SolidGroundFill;
    fields: GroundFieldTextures;
    worldTiles: number;
};

export type OrganicLandMesh = {
    mesh: Mesh<MeshGeometry, Shader>;
    bindFields: (fields: GroundFieldTextures) => void;
    setWorldTiles: (n: number) => void;
    destroy: () => void;
};

export function createOrganicLandMesh(
    opts: OrganicLandMeshOptions
): OrganicLandMesh {
    const padded = organicLandSpriteRect(opts.bounds);
    const landUniforms = new UniformGroup({
        uRect: {
            value: new Float32Array([
                opts.bounds.x / TILE_SIZE,
                opts.bounds.y / TILE_SIZE,
                opts.bounds.width / TILE_SIZE,
                opts.bounds.height / TILE_SIZE,
            ]),
            type: "vec4<f32>",
        },
        uLandColor: {
            value: new Float32Array([
                ((opts.color >> 16) & 0xff) / 255,
                ((opts.color >> 8) & 0xff) / 255,
                (opts.color & 0xff) / 255,
                fillTypeId(opts.fill),
            ]),
            type: "vec4<f32>",
        },
        uAmplitude: { value: LAND_SEAM_AMPLITUDE, type: "f32" },
        uCoastClear: {
            value: opts.fill ? 0 : COAST_CLEAR_TILES,
            type: "f32",
        },
        uInlandScale: { value: INLAND_SAMPLE_SCALE, type: "f32" },
        uWorldTiles: { value: opts.worldTiles, type: "f32" },
        uTileSize: { value: TILE_SIZE, type: "f32" },
        _pad0: { value: 0, type: "f32" },
        _pad1: { value: 0, type: "f32" },
        _pad2: { value: 0, type: "f32" },
    });

    const shader = new Shader({
        glProgram: compileHighShaderGlProgram({
            name: "organic-land-mesh",
            bits: [localUniformBitGl, roundPixelsBitGl, organicLandBitGl],
        }),
        gpuProgram: compileHighShaderGpuProgram({
            name: "organic-land-mesh",
            bits: [localUniformBitGpu, roundPixelsBitGpu, organicLandBitGpu],
        }),
        resources: {
            landUniforms,
            uInland: opts.fields.inland.source,
            uInlandSampler: opts.fields.inland.source.style,
        },
    });

    const geometry = new MeshGeometry({
        positions: new Float32Array([
            padded.x,
            padded.y,
            padded.x + padded.w,
            padded.y,
            padded.x + padded.w,
            padded.y + padded.h,
            padded.x,
            padded.y + padded.h,
        ]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });

    const mesh = new Mesh<MeshGeometry, Shader>({
        geometry,
        shader,
        texture: Texture.WHITE,
    });

    return {
        mesh,
        bindFields(fields) {
            shader.resources.uInland = fields.inland.source;
            shader.resources.uInlandSampler = fields.inland.source.style;
        },
        setWorldTiles(n) {
            (landUniforms.uniforms as { uWorldTiles: number }).uWorldTiles = n;
        },
        destroy() {
            mesh.destroy({ children: true });
            shader.destroy(true);
        },
    };
}
