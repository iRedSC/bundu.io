import {
    Filter,
    GlProgram,
    GpuProgram,
    Matrix,
    Point,
    type Sprite,
    UniformGroup,
    type FilterSystem,
    type RenderSurface,
    type Texture,
} from "pixi.js";

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vFilterUv;
uniform highp vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uFilterMatrix;
void main(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    vFilterUv = (uFilterMatrix * vec3(vTextureCoord, 1.0)).xy;
}`;

const fragment = `
in vec2 vTextureCoord;
in vec2 vFilterUv;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uMapTexture;
uniform vec4 uInputClamp;
uniform highp vec4 uInputSize;
uniform mat2 uRotation;
uniform vec2 uScale;
uniform vec2 uAnchorUv;
uniform vec2 uAnchorStep;
void main(void) {
    vec2 anchor = vec2(0.0);
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            anchor += texture(uMapTexture, uAnchorUv + vec2(x, y) * uAnchorStep).xy;
        }
    }
    anchor /= 9.0;
    vec2 local = texture(uMapTexture, vFilterUv).xy - anchor;
    vec2 offset = uInputSize.zw * (uRotation * local) * uScale;
    vec2 sampleUv = vTextureCoord + offset;
    if (any(lessThan(sampleUv, uInputClamp.xy)) || any(greaterThan(sampleUv, uInputClamp.zw))) {
        finalColor = vec4(0.0);
    } else {
        finalColor = texture(uTexture, sampleUv);
    }
}`;

const gpu = `
struct GlobalFilterUniforms { uInputSize: vec4<f32>, uInputPixel: vec4<f32>, uInputClamp: vec4<f32>, uOutputFrame: vec4<f32>, uGlobalFrame: vec4<f32>, uOutputTexture: vec4<f32> };
struct Uniforms { uFilterMatrix: mat3x3<f32>, uScale: vec2<f32>, uRotation: mat2x2<f32>, uAnchorUv: vec2<f32>, uAnchorStep: vec2<f32> };
@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;
@group(1) @binding(1) var uMapTexture: texture_2d<f32>;
@group(1) @binding(2) var uMapSampler: sampler;
struct Output { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32>, @location(1) filterUv: vec2<f32> };
@vertex fn mainVertex(@location(0) aPosition: vec2<f32>) -> Output {
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
    let uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
    return Output(vec4<f32>(position, 0.0, 1.0), uv, (uniforms.uFilterMatrix * vec3<f32>(uv, 1.0)).xy);
}
@fragment fn mainFragment(@location(0) uv: vec2<f32>, @location(1) filterUv: vec2<f32>) -> @location(0) vec4<f32> {
    var anchor = vec2<f32>(0.0);
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            anchor += textureSample(uMapTexture, uMapSampler, uniforms.uAnchorUv + vec2<f32>(f32(x), f32(y)) * uniforms.uAnchorStep).xy;
        }
    }
    anchor /= 9.0;
    let local = textureSample(uMapTexture, uMapSampler, filterUv).xy - anchor;
    let offset = gfu.uInputSize.zw * (uniforms.uRotation * local) * uniforms.uScale;
    let sampleUv = uv + offset;
    if (any(sampleUv < gfu.uInputClamp.xy) || any(sampleUv > gfu.uInputClamp.zw)) {
        return vec4<f32>(0.0);
    }
    return textureSample(uTexture, uSampler, sampleUv);
}`;

export class AnchoredDisplacementFilter extends Filter {
    private readonly map: Sprite;

    constructor(map: Sprite, scale: number) {
        const uniforms = new UniformGroup({
            uFilterMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
            uScale: { value: new Point(scale, scale), type: "vec2<f32>" },
            uRotation: { value: new Float32Array([1, 0, 0, 1]), type: "mat2x2<f32>" },
            uAnchorUv: { value: new Point(0.5, 0.5), type: "vec2<f32>" },
            uAnchorStep: { value: new Point(0.01, 0.01), type: "vec2<f32>" },
        });
        super({
            glProgram: GlProgram.from({ vertex, fragment, name: "anchored-displacement" }),
            gpuProgram: GpuProgram.from({
                vertex: { source: gpu, entryPoint: "mainVertex" },
                fragment: { source: gpu, entryPoint: "mainFragment" },
            }),
            resources: {
                uniforms,
                uMapTexture: map.texture.source,
                uMapSampler: map.texture.source.style,
            },
        });
        this.map = map;
        map.renderable = false;
    }

    set anchorUv(value: { x: number; y: number }) {
        this.resources.uniforms.uniforms.uAnchorUv.copyFrom(value);
    }

    set anchorStep(value: { x: number; y: number }) {
        this.resources.uniforms.uniforms.uAnchorStep.copyFrom(value);
    }

    set scale(value: number) {
        this.resources.uniforms.uniforms.uScale.set(value, value);
    }

    override apply(
        filterManager: FilterSystem,
        input: Texture,
        output: RenderSurface,
        clearMode: boolean
    ): void {
        const uniforms = this.resources.uniforms.uniforms;
        filterManager.calculateSpriteMatrix(uniforms.uFilterMatrix, this.map);
        const transform = this.map.worldTransform;
        const lenX = Math.hypot(transform.a, transform.b);
        const lenY = Math.hypot(transform.c, transform.d);
        if (lenX && lenY) {
            uniforms.uRotation[0] = transform.a / lenX;
            uniforms.uRotation[1] = transform.b / lenX;
            uniforms.uRotation[2] = transform.c / lenY;
            uniforms.uRotation[3] = transform.d / lenY;
        }
        this.resources.uMapTexture = this.map.texture.source;
        filterManager.applyFilter(this, input, output, clearMode);
    }
}
