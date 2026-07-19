import { Filter, Texture, UniformGroup } from "pixi.js";

/** Soft circular signed displacement: neutral center/edge, outward lensing. */
export function createDropletDisplacementTexture(size = 64): Texture {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create droplet displacement map");

    const image = context.createImageData(size, size);
    const center = (size - 1) / 2;
    const radius = size / 2;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = (x - center) / radius;
            const dy = (y - center) / radius;
            const distance = Math.hypot(dx, dy);
            if (distance >= 1) continue;

            const directionX = distance > 0 ? dx / distance : 0;
            const directionY = distance > 0 ? dy / distance : 0;
            const lens = Math.sin(distance * Math.PI);
            const edge = Math.min(1, (1 - distance) / 0.3);
            const alpha = edge * edge * (3 - 2 * edge);
            const offset = (y * size + x) * 4;
            image.data[offset] = 128 + directionX * lens * 127;
            image.data[offset + 1] = 128 + directionY * lens * 127;
            image.data[offset + 2] = 128;
            image.data[offset + 3] = alpha * 255;
        }
    }
    context.putImageData(image, 0, 0);
    const texture = Texture.from(canvas);
    texture.source.alphaMode = "no-premultiply-alpha";
    texture.source.addressMode = "clamp-to-edge";
    return texture;
}

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

uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform sampler2D uTexture;
uniform sampler2D uBackTexture;
uniform float uStrength;

void main(void) {
    vec4 map = texture(uTexture, vTextureCoord);
    vec2 direction = map.a > 0.001 ? map.xy / map.a - 0.5 : vec2(0.0);
    vec2 offset = uInputSize.zw * direction * uStrength * map.a;
    vec4 back = texture(uBackTexture, vTextureCoord);
    vec4 displaced = texture(
        uBackTexture,
        clamp(vTextureCoord + offset, uInputClamp.xy, uInputClamp.zw)
    );
    finalColor = mix(back, displaced, map.a);
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

struct SplashUniforms {
    uStrength: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(0) @binding(3) var uBackTexture: texture_2d<f32>;
@group(1) @binding(0) var<uniform> splashUniforms: SplashUniforms;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
    let uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
    return VSOutput(vec4<f32>(position, 0.0, 1.0), uv);
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let map = textureSample(uTexture, uSampler, uv);
    var direction = vec2<f32>(0.0);
    if (map.a > 0.001) {
        direction = map.xy / map.a - 0.5;
    }
    let offset = gfu.uInputSize.zw * direction * splashUniforms.uStrength * map.a;
    let back = textureSample(uBackTexture, uSampler, uv);
    let displaced = textureSample(
        uBackTexture,
        uSampler,
        clamp(uv + offset, gfu.uInputClamp.xy, gfu.uInputClamp.zw)
    );
    return mix(back, displaced, map.a);
}
`;

export function createSplashRefractionFilter() {
    const splashUniforms = new UniformGroup({
        uStrength: { value: 1, type: "f32" },
    });
    const filter = Filter.from({
        gl: { vertex, fragment },
        gpu: {
            vertex: { source: gpu, entryPoint: "mainVertex" },
            fragment: { source: gpu, entryPoint: "mainFragment" },
        },
        resources: { splashUniforms },
        blendRequired: true,
    });
    return {
        filter,
        setStrength(value: number) {
            splashUniforms.uniforms.uStrength = value;
        },
    };
}
