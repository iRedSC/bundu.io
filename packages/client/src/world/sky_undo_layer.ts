import {
    ColorMatrixFilter,
    Container,
    FillGradient,
    Graphics,
    Sprite,
    Texture,
    type Renderer,
} from "pixi.js";
import { colorLerp } from "@bundu/shared/transforms";

export type SkyUndoDisc = {
    x: number;
    y: number;
    radius: number;
};

/**
 * Soft fire undo:
 * 1) Bake soft white strength discs with screen (overlaps merge, saturate at 1)
 * 2) Colorize strength → lerp(white, skyTint, s)
 * 3) One divide pass
 *
 * Avoids Voronoi cells (darken) and neon plasma blowout (multiply stacking).
 */
export class SkyUndoLayer {
    readonly sprite: Sprite;
    private readonly renderer: Renderer;
    private readonly bake = new Container();
    private discs: SkyUndoDisc[] = [];
    private skyTint = 0xffffff;
    private baked?: Texture;

    constructor(renderer: Renderer) {
        this.renderer = renderer;
        this.sprite = new Sprite(Texture.EMPTY);
        this.sprite.zIndex = 201;
        this.sprite.blendMode = "divide";
        this.sprite.eventMode = "none";
        this.sprite.visible = false;
    }

    sync(discs: readonly SkyUndoDisc[], skyTint: number): void {
        if (sameDiscs(this.discs, discs) && this.skyTint === skyTint) return;
        this.discs = discs.map((disc) => ({ ...disc }));
        this.skyTint = skyTint;
        this.rebuild();
    }

    destroy(): void {
        this.clearBake();
        this.sprite.destroy();
        this.bake.destroy({ children: true });
    }

    private rebuild(): void {
        this.clearBake();
        for (const child of this.bake.removeChildren()) {
            child.destroy();
        }

        if (this.discs.length === 0) {
            this.sprite.visible = false;
            return;
        }

        const strengthFill = strengthGradient();
        for (const { x, y, radius } of this.discs) {
            if (radius <= 0) continue;
            const disc = new Graphics();
            disc.blendMode = "screen";
            disc.circle(x, y, radius).fill(strengthFill);
            this.bake.addChild(disc);
        }
        if (this.bake.children.length === 0) {
            this.sprite.visible = false;
            return;
        }

        const bounds = this.bake.getLocalBounds();
        if (bounds.width < 1 || bounds.height < 1) {
            this.sprite.visible = false;
            return;
        }

        const strength = this.renderer.generateTexture({
            target: this.bake,
            clearColor: 0x000000,
            resolution: 1,
            textureSourceOptions: {
                scaleMode: "linear",
                autoGenerateMipmaps: false,
            },
        });

        for (const child of this.bake.removeChildren()) {
            child.destroy();
        }

        const colorize = new Sprite(strength);
        const filter = strengthToSkyFilter(this.skyTint);
        colorize.filters = [filter];
        this.bake.addChild(colorize);

        this.baked = this.renderer.generateTexture({
            target: this.bake,
            clearColor: 0xffffff,
            resolution: 1,
            textureSourceOptions: {
                scaleMode: "linear",
                autoGenerateMipmaps: false,
            },
        });

        colorize.destroy();
        filter.destroy();
        strength.destroy(true);

        this.sprite.texture = this.baked;
        this.sprite.tint = 0xffffff;
        this.sprite.position.set(bounds.x, bounds.y);
        this.sprite.visible = true;
    }

    private clearBake(): void {
        if (!this.baked) return;
        this.sprite.texture = Texture.EMPTY;
        this.baked.destroy(true);
        this.baked = undefined;
    }
}

/** White core → black rim (strength). Pure black before the geometric edge. */
function strengthGradient(): FillGradient {
    return new FillGradient({
        type: "radial",
        center: { x: 0.5, y: 0.5 },
        innerRadius: 0,
        outerCenter: { x: 0.5, y: 0.5 },
        outerRadius: 0.5,
        textureSpace: "local",
        colorStops: [
            { offset: 0, color: 0xffffff },
            { offset: 0.28, color: 0xffffff },
            { offset: 0.45, color: colorLerp(0xffffff, 0x000000, 0.25) },
            { offset: 0.62, color: colorLerp(0xffffff, 0x000000, 0.55) },
            { offset: 0.78, color: colorLerp(0xffffff, 0x000000, 0.82) },
            { offset: 0.9, color: colorLerp(0xffffff, 0x000000, 0.96) },
            { offset: 0.95, color: 0x000000 },
            { offset: 1, color: 0x000000 },
        ],
    });
}

/** Map greyscale strength S → lerp(white, skyTint, S) for divide. */
function strengthToSkyFilter(skyTint: number): ColorMatrixFilter {
    const sr = ((skyTint >> 16) & 255) / 255;
    const sg = ((skyTint >> 8) & 255) / 255;
    const sb = (skyTint & 255) / 255;
    const filter = new ColorMatrixFilter();
    filter.matrix = [
        sr - 1,
        0,
        0,
        0,
        1,
        sg - 1,
        0,
        0,
        0,
        1,
        sb - 1,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        1,
        0,
    ];
    return filter;
}

function sameDiscs(
    a: readonly SkyUndoDisc[],
    b: readonly SkyUndoDisc[]
): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const left = a[i];
        const right = b[i];
        if (!left || !right) return false;
        if (
            left.x !== right.x ||
            left.y !== right.y ||
            left.radius !== right.radius
        ) {
            return false;
        }
    }
    return true;
}
