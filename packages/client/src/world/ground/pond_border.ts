import {
    Container,
    GlProgram,
    GpuProgram,
    Mesh,
    MeshGeometry,
    Shader,
    UniformGroup,
    type Rectangle,
} from "pixi.js";
import { TILE_SIZE } from "@bundu/shared/tiles";
import { POND_SEAM_AMPLITUDE } from "./land_seam";

const PAD_TILES = Math.ceil(POND_SEAM_AMPLITUDE) + 0.1;

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
uniform vec4 uPondColor;

float boxSdf(vec2 p, vec4 box) {
    vec2 center = box.xy + box.zw * 0.5;
    vec2 q = abs(p - center) - box.zw * 0.5;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0));
}

float pondOffset(vec2 p) {
    float wx = p.x + 0.7 * sin(0.38 * p.y + 0.22 * p.x + 0.4);
    float wy = p.y + 0.7 * sin(0.34 * p.x - 0.28 * p.y + 1.3);
    return ${POND_SEAM_AMPLITUDE} * (
        0.32 * sin(1.15 * wx + 0.6 * wy)
        + 0.24 * sin(0.82 * wx - 1.05 * wy + 1.5)
        + 0.18 * sin(1.55 * (wx + wy) + 2.3)
        + 0.14 * sin(0.55 * wx + 1.25 * wy + 0.9)
        + 0.12 * sin(2.05 * wx - 1.35 * wy + 3.1)
    );
}

void main() {
    float edge = boxSdf(vWorldTile, uBounds) - pondOffset(vWorldTile);
    float aa = 0.01;
    float alpha = 1.0 - smoothstep(-aa, aa, edge);
    if (alpha <= 0.0) discard;
    finalColor = vec4(uPondColor.rgb * alpha, alpha);
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
struct PondUniforms {
    uBounds: vec4<f32>,
    uPondColor: vec4<f32>,
};
@group(0) @binding(0) var<uniform> globalUniforms: GlobalUniforms;
@group(1) @binding(0) var<uniform> localUniforms: LocalUniforms;
@group(2) @binding(0) var<uniform> pondUniforms: PondUniforms;

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

fn pondOffset(p: vec2<f32>) -> f32 {
    let wx = p.x + 0.7 * sin(0.38 * p.y + 0.22 * p.x + 0.4);
    let wy = p.y + 0.7 * sin(0.34 * p.x - 0.28 * p.y + 1.3);
    return ${POND_SEAM_AMPLITUDE} * (
        0.32 * sin(1.15 * wx + 0.6 * wy)
        + 0.24 * sin(0.82 * wx - 1.05 * wy + 1.5)
        + 0.18 * sin(1.55 * (wx + wy) + 2.3)
        + 0.14 * sin(0.55 * wx + 1.25 * wy + 0.9)
        + 0.12 * sin(2.05 * wx - 1.35 * wy + 3.1)
    );
}

@fragment
fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
    let edge = boxSdf(input.worldTile, pondUniforms.uBounds) -
        pondOffset(input.worldTile);
    let aa = 0.01;
    let alpha = 1.0 - smoothstep(-aa, aa, edge);
    if (alpha <= 0.0) { discard; }
    return vec4<f32>(pondUniforms.uPondColor.rgb * alpha, alpha);
}`;

export function createPondBorder(
    bounds: Rectangle,
    color: number,
    zIndex: number
): Container {
    const root = new Container();
    root.zIndex = zIndex;
    const x0 = bounds.x / TILE_SIZE - PAD_TILES;
    const y0 = bounds.y / TILE_SIZE - PAD_TILES;
    const x1 = (bounds.x + bounds.width) / TILE_SIZE + PAD_TILES;
    const y1 = (bounds.y + bounds.height) / TILE_SIZE + PAD_TILES;
    const tiles = new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]);
    const geometry = new MeshGeometry({
        positions: new Float32Array(
            [...tiles].map((value) => value * TILE_SIZE)
        ),
        uvs: tiles,
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
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
        uPondColor: {
            value: new Float32Array([
                ((color >> 16) & 0xff) / 255,
                ((color >> 8) & 0xff) / 255,
                (color & 0xff) / 255,
                1,
            ]),
            type: "vec4<f32>",
        },
    });
    const shader = new Shader({
        glProgram: GlProgram.from({
            vertex: glVertex,
            fragment: glFragment,
            name: "pond-border",
        }),
        gpuProgram: GpuProgram.from({
            vertex: { source: gpuSource, entryPoint: "mainVertex" },
            fragment: { source: gpuSource, entryPoint: "mainFragment" },
        }),
        resources: { pondUniforms: uniforms },
    });
    const mesh = new Mesh({ geometry, shader });
    root.addChild(mesh);
    root.on("destroyed", () => {
        geometry.destroy();
        shader.destroy();
    });
    return root;
}
