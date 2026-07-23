import {
    Filter,
    GlProgram,
    GpuProgram,
    UniformGroup,
} from "pixi.js";
import { TILE_SIZE, WORLD_TILES } from "@bundu/shared/tiles";
import {
    POND_DIST_SAMPLE_SCALE,
    type GroundFieldTextures,
} from "./ground_fields";
import { POND_SEAM_AMPLITUDE } from "./organic_noise";

/** Soft FX mask overshoot past the organic pond edge (tiles). */
export const ORGANIC_FX_OVERSHOOT_TILES = 0.25;

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform highp vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uPondDist;
uniform vec4 uSpriteWorld;
uniform vec3 uColor;
uniform float uAmplitude;
uniform float uOuterFade;
uniform float uPondScale;
uniform float uWorldTiles;
uniform float uTileSize;
uniform float uMode;

float coverage(float sdf, float aa) {
    if (sdf <= -aa) return 1.0;
    if (sdf >= aa) return 0.0;
    float t = (sdf + aa) / (2.0 * aa);
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

float samplePondDist(vec2 tile) {
    vec2 uv = (tile + 0.5) / uWorldTiles;
    float encoded = texture(uPondDist, uv).r;
    return (encoded * 2.0 - 1.0) * uPondScale;
}

void main(void) {
    vec2 world = uSpriteWorld.xy + vTextureCoord * uSpriteWorld.zw;
    vec2 tile = world / uTileSize;
    float dist = samplePondDist(tile);
    float aa = max(fwidth(dist), 0.03);
    float edge = dist - seamOffsetPond(tile);
    float alpha;
    if (uOuterFade > 0.0) {
        alpha = 1.0 - smoothstep(0.0, 1.0, clamp(edge / uOuterFade, 0.0, 1.0));
    } else {
        alpha = coverage(edge, aa);
    }
    if (alpha <= 0.001) {
        finalColor = vec4(0.0);
        return;
    }
    // uMode 0 = opaque fill, 1 = white mask
    vec3 rgb = uMode > 0.5 ? vec3(1.0) : uColor;
    finalColor = vec4(rgb * alpha, alpha);
}
`;

const gpu = `
struct GlobalFilterUniforms {
    uInputSize: vec4<f32>,
    uInputPixel: vec4<f32>,
    uInputClamp: vec4<f32>,
    uOutputFrame: vec4<f32>,
    uGlobalFrame: vec4<f32>,
    uOutputTexture: vec4<f32>,
};
struct WaterUniforms {
    uSpriteWorld: vec4<f32>,
    uColor: vec4<f32>,
    uAmplitude: f32,
    uOuterFade: f32,
    uPondScale: f32,
    uWorldTiles: f32,
    uTileSize: f32,
    uMode: f32,
    _pad0: f32,
    _pad1: f32,
};
@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> water: WaterUniforms;
@group(1) @binding(1) var uPondDist: texture_2d<f32>;
@group(1) @binding(2) var uPondDistSampler: sampler;

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};
@vertex fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOut {
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
    let uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
    return VSOut(vec4<f32>(position, 0.0, 1.0), uv);
}
fn coverage(sdf: f32, aa: f32) -> f32 {
    if (sdf <= -aa) { return 1.0; }
    if (sdf >= aa) { return 0.0; }
    let t = (sdf + aa) / (2.0 * aa);
    let s = t * t * (3.0 - 2.0 * t);
    return 1.0 - s;
}
fn seamOffsetPond(p: vec2<f32>) -> f32 {
    let wx = p.x + 0.7 * sin(0.38 * p.y + 0.22 * p.x + 0.4);
    let wy = p.y + 0.7 * sin(0.34 * p.x - 0.28 * p.y + 1.3);
    return water.uAmplitude * (
        0.32 * sin(1.15 * wx + 0.6 * wy) +
        0.24 * sin(0.82 * wx - 1.05 * wy + 1.5) +
        0.18 * sin(1.55 * (wx + wy) + 2.3) +
        0.14 * sin(0.55 * wx + 1.25 * wy + 0.9) +
        0.12 * sin(2.05 * wx - 1.35 * wy + 3.1)
    );
}
fn samplePondDist(tile: vec2<f32>) -> f32 {
    let uv = (tile + vec2<f32>(0.5)) / water.uWorldTiles;
    let encoded = textureSample(uPondDist, uPondDistSampler, uv).r;
    return (encoded * 2.0 - 1.0) * water.uPondScale;
}
@fragment fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let world = water.uSpriteWorld.xy + uv * water.uSpriteWorld.zw;
    let tile = world / water.uTileSize;
    let dist = samplePondDist(tile);
    let aa = max(0.03, 0.04);
    let edge = dist - seamOffsetPond(tile);
    var alpha: f32;
    if (water.uOuterFade > 0.0) {
        alpha = 1.0 - smoothstep(0.0, 1.0, clamp(edge / water.uOuterFade, 0.0, 1.0));
    } else {
        alpha = coverage(edge, aa);
    }
    if (alpha <= 0.001) {
        return vec4<f32>(0.0);
    }
    let rgb = select(water.uColor.xyz, vec3<f32>(1.0), water.uMode > 0.5);
    return vec4<f32>(rgb * alpha, alpha);
}
`;

export type OrganicWaterFilterMode = "fill" | "mask";

/**
 * Pond organic fill / FX mask from a world pond-distance field + mid-freq noise.
 */
export class OrganicWaterFilter extends Filter {
    private readonly waterUniforms: UniformGroup;

    constructor(
        fields: GroundFieldTextures,
        color: number,
        mode: OrganicWaterFilterMode,
        spriteWorld: Float32Array
    ) {
        const waterUniforms = new UniformGroup({
            uSpriteWorld: { value: spriteWorld, type: "vec4<f32>" },
            uColor: {
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
            uPondScale: { value: POND_DIST_SAMPLE_SCALE, type: "f32" },
            uWorldTiles: { value: WORLD_TILES, type: "f32" },
            uTileSize: { value: TILE_SIZE, type: "f32" },
            uMode: { value: mode === "mask" ? 1 : 0, type: "f32" },
            _pad0: { value: 0, type: "f32" },
            _pad1: { value: 0, type: "f32" },
        });
        super({
            glProgram: GlProgram.from({
                vertex,
                fragment,
                name: "organic-water",
            }),
            gpuProgram: GpuProgram.from({
                vertex: { source: gpu, entryPoint: "mainVertex" },
                fragment: { source: gpu, entryPoint: "mainFragment" },
            }),
            resources: {
                waterUniforms,
                uPondDist: fields.pondDist.source,
                uPondDistSampler: fields.pondDist.source.style,
            },
            padding: Math.ceil(POND_SEAM_AMPLITUDE + 1) * TILE_SIZE,
        });
        this.waterUniforms = waterUniforms;
    }

    setSpriteWorld(x: number, y: number, w: number, h: number): void {
        const v = (this.waterUniforms.uniforms as { uSpriteWorld: Float32Array })
            .uSpriteWorld;
        v[0] = x;
        v[1] = y;
        v[2] = w;
        v[3] = h;
    }

    setWorldTiles(n: number): void {
        (this.waterUniforms.uniforms as { uWorldTiles: number }).uWorldTiles = n;
    }

    bindFields(fields: GroundFieldTextures): void {
        this.resources.uPondDist = fields.pondDist.source;
        this.resources.uPondDistSampler = fields.pondDist.source.style;
    }
}
