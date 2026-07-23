import {
    Filter,
    GlProgram,
    GpuProgram,
    Rectangle,
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

/** Flat land yields the nearshore beach band (tiles). */
const COAST_CLEAR_TILES = NEARSHORE_OVERSHOOT_TILES;

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

/** Shared land organic fragment body (GL). */
const landFragmentBody = `
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
    float a = hash2(i);
    float b = hash2(i + vec2(1.0, 0.0));
    float c = hash2(i + vec2(0.0, 1.0));
    float d = hash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
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

float hardBlob(float t) {
    return t >= 0.72 ? 1.0 : 0.0;
}

vec3 applyLandShade(vec3 base, float lumScale, float chroma) {
    vec3 c = base * lumScale;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float sat = 1.0 + chroma * 0.14;
    c = lum + (c - lum) * sat;
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
    float lumScale = 1.0 + bands * 0.42 * 0.07;
    float cn = valueNoise(tile * 0.11 + vec2(12.0, 7.0));
    float light = sharpBlob(cn);
    float dark = sharpBlob(1.0 - cn);
    float chroma = light * 0.55 - dark * 0.45;
    return applyLandShade(base, lumScale, chroma * 0.55);
}

vec3 shadeForest(vec3 base, vec2 tile) {
    float soft =
        fbm(tile * 0.2, 4) * 0.65 +
        fbm(tile * 0.45 + vec2(17.0), 3) * 0.35;
    vec2 b = tile + vec2(fbm(tile * 0.04, 2), fbm(tile * 0.04 + vec2(40.0), 2)) * 2.8;
    float softN = valueNoise(b * 0.13);
    float light = sharpBlob(softN);
    float dark = sharpBlob(1.0 - softN);
    float lumBlob = light * 0.14 - dark * 0.12;
    float chroma = (light - dark) * 0.5;
    vec2 d = tile + vec2(
        fbm(tile * 0.06 + vec2(200.0), 2),
        fbm(tile * 0.06 + vec2(230.0), 2)
    ) * 1.6;
    float hardN = valueNoise(d * 0.19 + vec2(9.0));
    float darken = hardBlob(hardN) * 0.045;
    return applyLandShade(base, 1.0 + soft * 0.07 + lumBlob - darken, chroma * 0.6);
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
    float fade = oceanEdgeFade(shore, 2.25);
    return mix(base, shaded, fade);
}

float boxSdf(vec2 p, vec4 rect) {
    vec2 c = rect.xy + rect.zw * 0.5;
    vec2 q = abs(p - c) - rect.zw * 0.5;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float coverage(float sdf, float aa) {
    if (sdf <= -aa) return 1.0;
    if (sdf >= aa) return 0.0;
    float t = (sdf + aa) / (2.0 * aa);
    float smooth = t * t * (3.0 - 2.0 * t);
    return 1.0 - smooth;
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

float sampleLand(vec2 tile) {
    vec2 uv = (tile + 0.5) / uWorldTiles;
    return texture(uLandOcc, uv).r;
}

float sampleInland(vec2 tile) {
    vec2 uv = (tile + 0.5) / uWorldTiles;
    return texture(uInland, uv).r * uInlandScale;
}

float sampleOpenInland(vec2 tile) {
    vec2 uv = (tile + 0.5) / uWorldTiles;
    return texture(uInland, uv).g * uInlandScale;
}

float facesLandLand(vec2 tile, vec4 rect, float sdf) {
    // Outside authored rect but still in the organic band: only wobble onto land.
    if (sdf > 0.0) {
        return sampleLand(tile) > 0.5 ? 1.0 : 0.0;
    }
    // Push one tile outward from the nearest edge and test occupancy.
    vec2 center = rect.xy + rect.zw * 0.5;
    vec2 local = tile - center;
    vec2 half = rect.zw * 0.5;
    float dx = half.x - abs(local.x);
    float dy = half.y - abs(local.y);
    vec2 outside = tile;
    if (dx < dy) {
        outside.x += local.x >= 0.0 ? 1.0 : -1.0;
    } else {
        outside.y += local.y >= 0.0 ? 1.0 : -1.0;
    }
    return sampleLand(outside) > 0.5 ? 1.0 : 0.0;
}
`;

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uLandOcc;
uniform sampler2D uInland;
uniform vec4 uSpriteWorld;
uniform vec4 uRect;
uniform vec4 uColor;
uniform float uAmplitude;
uniform float uCoastClear;
uniform float uInlandScale;
uniform float uWorldTiles;
uniform float uTileSize;
${landFragmentBody}
void main(void) {
    vec2 world = uSpriteWorld.xy + vTextureCoord * uSpriteWorld.zw;
    vec2 tile = world / uTileSize;
    float sdf = boxSdf(tile, uRect);
    float aa = max(fwidth(sdf), 0.75 / uTileSize * length(uSpriteWorld.zw) * 0.002);
    aa = max(aa, 0.02);
    float landLand = facesLandLand(tile, uRect, sdf);
    float edge = sdf;
    if (landLand > 0.5 && abs(sdf) <= uAmplitude + aa) {
        edge = sdf - seamOffset(tile);
    }
    float alpha = coverage(edge, aa);
    float inland = sampleInland(tile);
    float openInland = sampleOpenInland(tile);
    if (uColor.a < 0.5 && openInland <= uCoastClear) {
        alpha = 0.0;
    }
    if (alpha <= 0.001) {
        finalColor = vec4(0.0);
        return;
    }
    vec3 rgb = shadeFill(uColor.rgb, uColor.a, tile, inland);
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
struct LandUniforms {
    uSpriteWorld: vec4<f32>,
    uRect: vec4<f32>,
    uColor: vec4<f32>,
    uAmplitude: f32,
    uCoastClear: f32,
    uInlandScale: f32,
    uWorldTiles: f32,
    uTileSize: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
};
@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> land: LandUniforms;
@group(1) @binding(1) var uLandOcc: texture_2d<f32>;
@group(1) @binding(2) var uLandOccSampler: sampler;
@group(1) @binding(3) var uInland: texture_2d<f32>;
@group(1) @binding(4) var uInlandSampler: sampler;

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

fn hash2(p: vec2<f32>) -> f32 {
    let i = vec2<i32>(floor(p));
    var n = i.x * 374761393 + i.y * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    n = n ^ (n >> 16);
    return f32(u32(n)) / 4294967296.0;
}
fn valueNoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    let a = hash2(i);
    let b = hash2(i + vec2<f32>(1.0, 0.0));
    let c = hash2(i + vec2<f32>(0.0, 1.0));
    let d = hash2(i + vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn fbm(p: vec2<f32>, octaves: i32) -> f32 {
    var sum = 0.0;
    var amp = 0.5;
    var freq = 1.0;
    var norm = 0.0;
    for (var i = 0; i < 6; i++) {
        if (i >= octaves) { break; }
        sum += amp * (valueNoise(p * freq) * 2.0 - 1.0);
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
    }
    return select(0.0, sum / norm, norm > 0.0);
}
fn sharpBlob(t: f32) -> f32 {
    if (t <= 0.6) { return 0.0; }
    if (t >= 0.78) { return 1.0; }
    let u = (t - 0.6) / 0.18;
    return u * u * (3.0 - 2.0 * u);
}
fn hardBlob(t: f32) -> f32 { return select(0.0, 1.0, t >= 0.72); }
fn applyLandShade(base: vec3<f32>, lumScale: f32, chroma: f32) -> vec3<f32> {
    var c = base * lumScale;
    let lum = dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
    let sat = 1.0 + chroma * 0.14;
    c = lum + (c - lum) * sat;
    let twist = chroma * 0.045;
    c = vec3<f32>(
        c.r + twist * (c.g - c.b),
        c.g + twist * (c.b - c.r),
        c.b + twist * (c.r - c.g)
    );
    return clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
}
fn shadeSand(base: vec3<f32>, tile: vec2<f32>, shore: f32) -> vec3<f32> {
    let warp =
        0.85 * sin(0.29 * tile.x + 0.19 * tile.y + 0.8) +
        0.45 * sin(0.62 * tile.y - 0.38 * tile.x + 2.3) +
        0.28 * sin(1.15 * tile.x + 0.72 * tile.y + 4.0) +
        0.14 * sin(1.9 * tile.y - 1.1 * tile.x + 1.4);
    let d = shore + warp;
    let bands =
        sin(1.05 * d + 0.35) +
        0.55 * sin(2.15 * d + 0.18 * tile.x + 1.5) +
        0.32 * sin(0.48 * d - 0.22 * tile.y + 2.9) +
        0.18 * sin(3.2 * d + 0.9 * tile.y + 0.55) +
        0.1 * sin(4.6 * d - 0.4 * tile.x + 3.7);
    let lumScale = 1.0 + bands * 0.42 * 0.07;
    let cn = valueNoise(tile * 0.11 + vec2<f32>(12.0, 7.0));
    let light = sharpBlob(cn);
    let dark = sharpBlob(1.0 - cn);
    let chroma = light * 0.55 - dark * 0.45;
    return applyLandShade(base, lumScale, chroma * 0.55);
}
fn shadeForest(base: vec3<f32>, tile: vec2<f32>) -> vec3<f32> {
    let soft = fbm(tile * 0.2, 4) * 0.65 + fbm(tile * 0.45 + vec2<f32>(17.0), 3) * 0.35;
    let b = tile + vec2<f32>(fbm(tile * 0.04, 2), fbm(tile * 0.04 + vec2<f32>(40.0), 2)) * 2.8;
    let softN = valueNoise(b * 0.13);
    let light = sharpBlob(softN);
    let dark = sharpBlob(1.0 - softN);
    let lumBlob = light * 0.14 - dark * 0.12;
    let chroma = (light - dark) * 0.5;
    let d = tile + vec2<f32>(
        fbm(tile * 0.06 + vec2<f32>(200.0), 2),
        fbm(tile * 0.06 + vec2<f32>(230.0), 2)
    ) * 1.6;
    let hardN = valueNoise(d * 0.19 + vec2<f32>(9.0));
    let darken = hardBlob(hardN) * 0.045;
    return applyLandShade(base, 1.0 + soft * 0.07 + lumBlob - darken, chroma * 0.6);
}
fn shadeSolid(base: vec3<f32>, tile: vec2<f32>) -> vec3<f32> {
    let d = tile + vec2<f32>(
        fbm(tile * 0.06 + vec2<f32>(200.0), 2),
        fbm(tile * 0.06 + vec2<f32>(230.0), 2)
    ) * 1.6;
    let n = valueNoise(d * 0.28 + vec2<f32>(9.0));
    var darken = 0.0;
    if (n >= 0.82) { darken = 0.07; }
    else if (n >= 0.72) { darken = 0.045; }
    return applyLandShade(base, 1.0 - darken, 0.0);
}
fn oceanEdgeFade(shore: f32, tiles: f32) -> f32 {
    if (tiles <= 0.0) { return 1.0; }
    if (shore <= 0.0) { return 0.0; }
    if (shore >= tiles) { return 1.0; }
    let u = shore / tiles;
    return u * u * (3.0 - 2.0 * u);
}
fn shadeFill(base: vec3<f32>, fillType: f32, tile: vec2<f32>, shore: f32) -> vec3<f32> {
    if (fillType < 0.5) { return base; }
    var shaded = base;
    if (fillType < 1.5) { shaded = shadeSand(base, tile, shore); }
    else if (fillType < 2.5) { shaded = shadeForest(base, tile); }
    else { shaded = shadeSolid(base, tile); }
    return mix(base, shaded, oceanEdgeFade(shore, 2.25));
}
fn boxSdf(p: vec2<f32>, rect: vec4<f32>) -> f32 {
    let c = rect.xy + rect.zw * 0.5;
    let q = abs(p - c) - rect.zw * 0.5;
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0);
}
fn coverage(sdf: f32, aa: f32) -> f32 {
    if (sdf <= -aa) { return 1.0; }
    if (sdf >= aa) { return 0.0; }
    let t = (sdf + aa) / (2.0 * aa);
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
    return land.uAmplitude * (
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
fn sampleLand(tile: vec2<f32>) -> f32 {
    let uv = (tile + vec2<f32>(0.5)) / land.uWorldTiles;
    return textureSample(uLandOcc, uLandOccSampler, uv).r;
}
fn sampleInland(tile: vec2<f32>) -> f32 {
    let uv = (tile + vec2<f32>(0.5)) / land.uWorldTiles;
    return textureSample(uInland, uInlandSampler, uv).r * land.uInlandScale;
}
fn sampleOpenInland(tile: vec2<f32>) -> f32 {
    let uv = (tile + vec2<f32>(0.5)) / land.uWorldTiles;
    return textureSample(uInland, uInlandSampler, uv).g * land.uInlandScale;
}
fn facesLandLand(tile: vec2<f32>, rect: vec4<f32>, sdf: f32) -> f32 {
    if (sdf > 0.0) {
        return select(0.0, 1.0, sampleLand(tile) > 0.5);
    }
    let center = rect.xy + rect.zw * 0.5;
    let local = tile - center;
    let half = rect.zw * 0.5;
    let dx = half.x - abs(local.x);
    let dy = half.y - abs(local.y);
    var outside = tile;
    if (dx < dy) {
        outside.x += select(-1.0, 1.0, local.x >= 0.0);
    } else {
        outside.y += select(-1.0, 1.0, local.y >= 0.0);
    }
    return select(0.0, 1.0, sampleLand(outside) > 0.5);
}

@fragment fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let world = land.uSpriteWorld.xy + uv * land.uSpriteWorld.zw;
    let tile = world / land.uTileSize;
    let sdf = boxSdf(tile, land.uRect);
    var aa = max(0.02, 0.04);
    let landLand = facesLandLand(tile, land.uRect, sdf);
    var edge = sdf;
    if (landLand > 0.5 && abs(sdf) <= land.uAmplitude + aa) {
        edge = sdf - seamOffset(tile);
    }
    var alpha = coverage(edge, aa);
    let inland = sampleInland(tile);
    let openInland = sampleOpenInland(tile);
    if (land.uColor.w < 0.5 && openInland <= land.uCoastClear) {
        alpha = 0.0;
    }
    if (alpha <= 0.001) {
        return vec4<f32>(0.0);
    }
    let rgb = shadeFill(land.uColor.xyz, land.uColor.w, tile, inland);
    return vec4<f32>(rgb * alpha, alpha);
}
`;

function fillTypeId(fill?: SolidGroundFill): number {
    if (fill === "sand_bands") return 1;
    if (fill === "forest_blobs") return 2;
    if (fill === "solid_blobs") return 3;
    return 0;
}

export type OrganicLandFilterOptions = {
    bounds: Rectangle;
    color: number;
    fill?: SolidGroundFill;
    fields: GroundFieldTextures;
    worldTiles: number;
};

/**
 * Live organic land fill: analytic rect SDF + land↔land wobble + procedural fill.
 * Draw on a padded white sprite covering the authored rect + amplitude pad.
 */
export class OrganicLandFilter extends Filter {
    private readonly landUniforms: UniformGroup;

    constructor(opts: OrganicLandFilterOptions) {
        const pad = Math.ceil(LAND_SEAM_AMPLITUDE + 0.02) * TILE_SIZE;
        const spriteX = opts.bounds.x - pad;
        const spriteY = opts.bounds.y - pad;
        const spriteW = opts.bounds.width + pad * 2;
        const spriteH = opts.bounds.height + pad * 2;
        const rectTiles = new Float32Array([
            opts.bounds.x / TILE_SIZE,
            opts.bounds.y / TILE_SIZE,
            opts.bounds.width / TILE_SIZE,
            opts.bounds.height / TILE_SIZE,
        ]);
        const color = opts.color;
        const landUniforms = new UniformGroup({
            uSpriteWorld: {
                value: new Float32Array([spriteX, spriteY, spriteW, spriteH]),
                type: "vec4<f32>",
            },
            uRect: { value: rectTiles, type: "vec4<f32>" },
            uColor: {
                value: new Float32Array([
                    ((color >> 16) & 0xff) / 255,
                    ((color >> 8) & 0xff) / 255,
                    (color & 0xff) / 255,
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
        super({
            glProgram: GlProgram.from({
                vertex,
                fragment,
                name: "organic-land",
            }),
            gpuProgram: GpuProgram.from({
                vertex: { source: gpu, entryPoint: "mainVertex" },
                fragment: { source: gpu, entryPoint: "mainFragment" },
            }),
            resources: {
                landUniforms,
                uLandOcc: opts.fields.landOcc.source,
                uLandOccSampler: opts.fields.landOcc.source.style,
                uInland: opts.fields.inland.source,
                uInlandSampler: opts.fields.inland.source.style,
            },
            padding: pad,
        });
        this.landUniforms = landUniforms;
        this.blendMode = "normal";
    }

    /** Keep world-tile uniform in sync after {@link setWorldTiles}. */
    setWorldTiles(n: number): void {
        const u = this.landUniforms.uniforms as { uWorldTiles: number };
        u.uWorldTiles = n;
    }

    bindFields(fields: GroundFieldTextures): void {
        this.resources.uLandOcc = fields.landOcc.source;
        this.resources.uLandOccSampler = fields.landOcc.source.style;
        this.resources.uInland = fields.inland.source;
        this.resources.uInlandSampler = fields.inland.source.style;
    }
}

/** Padded sprite world rect for an authored land AABB. */
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
