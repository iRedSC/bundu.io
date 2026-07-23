/**
 * Organic pond fill / FX mask as a world-space Mesh.
 * Uses Pixi's high-shader Mesh path so transforms bind correctly;
 * fragment SDF uses vertex world positions (not filter UVs).
 */
import {
    compileHighShaderGlProgram,
    compileHighShaderGpuProgram,
    Mesh,
    MeshGeometry,
    Shader,
    Texture,
    UniformGroup,
} from "pixi.js";
import { TILE_SIZE } from "@bundu/shared/tiles";
import { POND_SEAM_AMPLITUDE } from "./organic_noise";

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

/** Soft FX mask overshoot past the organic pond edge (tiles). */
export const ORGANIC_FX_OVERSHOOT_TILES = 0.25;
/** Max pond AABBs in one shared organic water mesh. */
export const ORGANIC_WATER_MAX_RECTS = 32;

export type OrganicWaterMode = "fill" | "mask";
export type WaterRect = { x: number; y: number; w: number; h: number };

const RECT_KEYS = Array.from(
    { length: ORGANIC_WATER_MAX_RECTS },
    (_, i) => `uRect${i}` as const
);

type OrganicUniformValues = {
    uFillColor: Float32Array;
    uAmplitude: number;
    uOuterFade: number;
    uTileSize: number;
    uMode: number;
    uRectCount: number;
    [key: `uRect${number}`]: Float32Array;
};

/** Same local-transform bit Pixi Mesh uses (not exported from pixi.js). */
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

function unionSdfGl(): string {
    return RECT_KEYS.map(
        (k, i) =>
            `    if (uRectCount > ${i}.0) sdf = min(sdf, boxSdf(tile, ${k}));`
    ).join("\n");
}

function unionSdfGpu(): string {
    return RECT_KEYS.map(
        (k, i) =>
            `    if (organicUniforms.uRectCount > ${i}.0) { sdf = min(sdf, boxSdf(tile, organicUniforms.${k})); }`
    ).join("\n");
}

function rectDeclsGl(): string {
    return RECT_KEYS.map((k) => `uniform vec4 ${k};`).join("\n");
}

function rectFieldsGpu(): string {
    return RECT_KEYS.map((k) => `    ${k}: vec4<f32>,`).join("\n");
}

const organicWaterBitGl: ShaderBit = {
    name: "organic-water",
    vertex: {
        header: `out vec2 vWorldPos;`,
        main: `
            // aPosition is world pixels when the mesh sits at the origin.
            vWorldPos = (modelMatrix * vec3(position, 1.0)).xy;
        `,
    },
    fragment: {
        header: `
in vec2 vWorldPos;
uniform vec4 uFillColor;
uniform float uAmplitude;
uniform float uOuterFade;
uniform float uTileSize;
uniform float uMode;
uniform float uRectCount;
${rectDeclsGl()}

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
float seamOffsetPond(vec2 p) {
    float wx = p.x + 0.7 * sin(0.38 * p.y + 0.22 * p.x + 0.4);
    float wy = p.y + 0.7 * sin(0.34 * p.x - 0.28 * p.y + 1.3);
    return uAmplitude * (
        0.32 * sin(1.15 * wx + 0.6 * wy) +
        0.24 * sin(0.82 * wx - 1.05 * wy + 1.5) +
        0.18 * sin(1.55 * (wx + wy) + 2.3) +
        0.14 * sin(0.55 * wx + 1.25 * wy + 0.9) +
        0.12 * sin(2.05 * wx - 1.35 * wy + 3.1)
    );
}
float unionSdf(vec2 tile) {
    float sdf = 1e6;
${unionSdfGl()}
    return sdf;
}
        `,
        main: `
            vec2 tile = vWorldPos / uTileSize;
            float edge = unionSdf(tile) - seamOffsetPond(tile);
            float alpha = uOuterFade > 0.0
                ? 1.0 - smoothstep(0.0, uOuterFade, edge)
                : coverage(edge, 0.06);
            if (alpha <= 0.001) {
                outColor = vec4(0.0);
            } else {
                vec3 rgb = uMode > 0.5 ? vec3(1.0) : uFillColor.rgb;
                outColor = vec4(rgb * alpha, alpha);
            }
        `,
    },
};

const organicWaterBitGpu: ShaderBit = {
    name: "organic-water",
    vertex: {
        header: `@out vWorldPos: vec2<f32>;`,
        main: `
            vWorldPos = (modelMatrix * vec3<f32>(position, 1.0)).xy;
        `,
    },
    fragment: {
        header: `
struct OrganicUniforms {
    uFillColor: vec4<f32>,
    uAmplitude: f32,
    uOuterFade: f32,
    uTileSize: f32,
    uMode: f32,
    uRectCount: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
${rectFieldsGpu()}
}
@group(2) @binding(0) var<uniform> organicUniforms: OrganicUniforms;
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
fn seamOffsetPond(p: vec2<f32>) -> f32 {
    let wx = p.x + 0.7 * sin(0.38 * p.y + 0.22 * p.x + 0.4);
    let wy = p.y + 0.7 * sin(0.34 * p.x - 0.28 * p.y + 1.3);
    return organicUniforms.uAmplitude * (
        0.32 * sin(1.15 * wx + 0.6 * wy) +
        0.24 * sin(0.82 * wx - 1.05 * wy + 1.5) +
        0.18 * sin(1.55 * (wx + wy) + 2.3) +
        0.14 * sin(0.55 * wx + 1.25 * wy + 0.9) +
        0.12 * sin(2.05 * wx - 1.35 * wy + 3.1)
    );
}
fn unionSdf(tile: vec2<f32>) -> f32 {
    var sdf = 1e6;
${unionSdfGpu()}
    return sdf;
}
        `,
        main: `
            let tile = vWorldPos / organicUniforms.uTileSize;
            let edge = unionSdf(tile) - seamOffsetPond(tile);
            var alpha: f32;
            if (organicUniforms.uOuterFade > 0.0) {
                alpha = 1.0 - smoothstep(0.0, organicUniforms.uOuterFade, edge);
            } else {
                alpha = coverage(edge, 0.06);
            }
            if (alpha <= 0.001) {
                outColor = vec4<f32>(0.0);
            } else {
                let rgb = select(
                    organicUniforms.uFillColor.xyz,
                    vec3<f32>(1.0),
                    organicUniforms.uMode > 0.5
                );
                outColor = vec4<f32>(rgb * alpha, alpha);
            }
        `,
    },
};

function setQuad(geometry: MeshGeometry, x: number, y: number, w: number, h: number) {
    geometry.positions = new Float32Array([
        x,
        y,
        x + w,
        y,
        x + w,
        y + h,
        x,
        y + h,
    ]);
}

export type OrganicWaterMesh = {
    mesh: Mesh<MeshGeometry, Shader>;
    bounds: { x: number; y: number; w: number; h: number };
    setBounds: (waterBounds: readonly WaterRect[]) => void;
    destroy: () => void;
};

export function createOrganicWaterMesh(
    color: number,
    mode: OrganicWaterMode
): OrganicWaterMesh {
    const rectResources: Record<
        string,
        { value: Float32Array; type: "vec4<f32>" }
    > = {};
    for (const key of RECT_KEYS) {
        rectResources[key] = { value: new Float32Array(4), type: "vec4<f32>" };
    }

    const organicUniforms = new UniformGroup({
        uFillColor: {
            value: new Float32Array([
                ((color >> 16) & 0xff) / 255,
                ((color >> 8) & 0xff) / 255,
                (color & 0xff) / 255,
                1,
            ]),
            type: "vec4<f32>",
        },
        uAmplitude: { value: POND_SEAM_AMPLITUDE, type: "f32" },
        uOuterFade: {
            value: mode === "mask" ? ORGANIC_FX_OVERSHOOT_TILES : 0,
            type: "f32",
        },
        uTileSize: { value: TILE_SIZE, type: "f32" },
        uMode: { value: mode === "mask" ? 1 : 0, type: "f32" },
        uRectCount: { value: 0, type: "f32" },
        _pad0: { value: 0, type: "f32" },
        _pad1: { value: 0, type: "f32" },
        _pad2: { value: 0, type: "f32" },
        ...rectResources,
    });

    const shader = new Shader({
        glProgram: compileHighShaderGlProgram({
            name: "organic-water-mesh",
            bits: [localUniformBitGl, roundPixelsBitGl, organicWaterBitGl],
        }),
        gpuProgram: compileHighShaderGpuProgram({
            name: "organic-water-mesh",
            bits: [localUniformBitGpu, roundPixelsBitGpu, organicWaterBitGpu],
        }),
        resources: { organicUniforms },
    });

    const geometry = new MeshGeometry({
        positions: new Float32Array(8),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const mesh = new Mesh<MeshGeometry, Shader>({
        geometry,
        shader,
        texture: Texture.WHITE,
    });

    const bounds = { x: 0, y: 0, w: 0, h: 0 };

    const setBounds = (waterBounds: readonly WaterRect[]) => {
        const u = organicUniforms.uniforms as unknown as OrganicUniformValues;
        if (waterBounds.length === 0) {
            bounds.w = 0;
            bounds.h = 0;
            mesh.visible = false;
            u.uRectCount = 0;
            return;
        }

        const pad = (Math.ceil(POND_SEAM_AMPLITUDE) + 1) * TILE_SIZE;
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const b of waterBounds) {
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        }
        bounds.x = minX - pad;
        bounds.y = minY - pad;
        bounds.w = maxX - minX + pad * 2;
        bounds.h = maxY - minY + pad * 2;
        setQuad(geometry, bounds.x, bounds.y, bounds.w, bounds.h);
        mesh.visible = true;

        const n = Math.min(ORGANIC_WATER_MAX_RECTS, waterBounds.length);
        u.uRectCount = n;
        for (let i = 0; i < ORGANIC_WATER_MAX_RECTS; i++) {
            const b = waterBounds[i];
            const key = RECT_KEYS[i]!;
            const dest = u[key];
            if (!dest) continue;
            if (b) {
                dest[0] = b.x / TILE_SIZE;
                dest[1] = b.y / TILE_SIZE;
                dest[2] = b.w / TILE_SIZE;
                dest[3] = b.h / TILE_SIZE;
            } else {
                dest[0] = 0;
                dest[1] = 0;
                dest[2] = 0;
                dest[3] = 0;
            }
        }
    };

    return {
        mesh,
        bounds,
        setBounds,
        destroy() {
            mesh.destroy({ children: true });
            shader.destroy(true);
        },
    };
}
