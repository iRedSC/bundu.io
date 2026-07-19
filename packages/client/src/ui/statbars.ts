import { clamp, colorLerp, lerp } from "@bundu/shared/transforms";
import type { StatBarConfig, StatBarGradientStop } from "@bundu/shared/stat_bars";
import { type ContaineredSprite, SpriteFactory } from "../assets/sprite_factory";
import { Container } from "pixi.js";

const FLASH_HZ = 4;
/** Local +x after -90° becomes screen-up (Pixi y-down). */
const UP = -Math.PI / 2;
/** Fill thickness vs outline — higher = less side gap (not fill length). */
const FILL_SCALE = { x: 0.1, y: 0.7 } as const;
/** Leave inset so fill doesn't poke past the outline tip. */
const BAR_LENGTH = 1 - 0.06;
const DISPLAY_LERP = 0.08;
const FILL_LERP = 0.12;
const DIFF_LERP = 0.04;
/** `shake` config units → radians. */
const SHAKE_TO_RAD = Math.PI / 180;

function hex(value: string): number {
    return Number.parseInt(value.slice(1), 16);
}

function gradientColors(
    stops: readonly StatBarGradientStop[],
    ratio: number
): { base: number; overlay: number } {
    const t = clamp(ratio, 0, 1);
    let lo = stops[0]!;
    let hi = stops[stops.length - 1]!;
    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i]!;
        const b = stops[i + 1]!;
        if (t >= a.at && t <= b.at) {
            lo = a;
            hi = b;
            break;
        }
    }
    const span = hi.at - lo.at;
    const u = span > 0 ? (t - lo.at) / span : 0;
    return {
        base: colorLerp(hex(lo.base), hex(hi.base), u),
        overlay: colorLerp(hex(lo.overlay), hex(hi.overlay), u),
    };
}

/**
 * Vertical vitals bar. Sprites stay horizontal in local space; the whole
 * content node is rotated so fill length grows upward on screen.
 */
export class StatBar {
    max: number;
    split: boolean;
    amount: number;
    private displayAmount = 0;

    container: Container;
    private content: Container;
    private circle: ContaineredSprite;
    private outline: ContaineredSprite;
    private icon: ContaineredSprite;

    private base: ContaineredSprite;
    private baseDiff: ContaineredSprite;
    private overlay: ContaineredSprite;
    private overlayDiff: ContaineredSprite;

    private readonly config: StatBarConfig;
    /** Desyncs flash/shake across bars. */
    private readonly shakePhase = Math.random() * Math.PI * 2;

    constructor(config: StatBarConfig) {
        this.config = config;
        this.max = config.max;
        this.split = config.split;
        this.amount = 0;

        this.icon = SpriteFactory.build(config.icon);
        this.icon.anchor.set(0.5);
        this.icon.scale.set(0.2);
        // Content is rotated -90°; counter-rotate so icons stay upright.
        this.icon.rotation = -UP;

        this.outline = SpriteFactory.build("bundu/ui/stat_bar_outline.png");
        this.outline.anchor.set(0, 0.5);
        this.outline.scale.set(0.95);
        this.outline.tint = hex(config.colors.base);

        this.circle = SpriteFactory.build("bundu/ui/stat_bar_circle.png");
        this.circle.anchor.set(0.5);
        this.circle.scale.set(0.2);
        this.circle.tint = hex(config.colors.base);

        this.base = SpriteFactory.build("bundu/ui/stat_bar.png");
        this.base.scale.set(FILL_SCALE.x, FILL_SCALE.y);
        this.base.anchor.set(0, 0.5);
        this.base.tint = hex(config.colors.base);
        this.base.width = 0;

        this.baseDiff = SpriteFactory.build("bundu/ui/stat_bar.png");
        this.baseDiff.scale.set(FILL_SCALE.x, FILL_SCALE.y);
        this.baseDiff.anchor.set(0, 0.5);
        this.baseDiff.tint = hex(config.colors.diff);
        this.baseDiff.width = 0;

        this.overlay = SpriteFactory.build("bundu/ui/stat_bar.png");
        this.overlay.scale.set(FILL_SCALE.x, FILL_SCALE.y);
        this.overlay.anchor.set(0, 0.5);
        this.overlay.tint = hex(config.colors.overlay);
        this.overlay.width = 0;

        this.overlayDiff = SpriteFactory.build("bundu/ui/stat_bar.png");
        this.overlayDiff.scale.set(FILL_SCALE.x, FILL_SCALE.y);
        this.overlayDiff.anchor.set(0, 0.5);
        this.overlayDiff.tint = hex(config.colors.diff);
        this.overlayDiff.width = 0;

        this.content = new Container();
        this.content.addChild(this.baseDiff);
        this.content.addChild(this.base);
        this.content.addChild(this.overlayDiff);
        this.content.addChild(this.overlay);
        this.content.addChild(this.outline);
        this.content.addChild(this.circle);
        this.content.addChild(this.icon);
        this.content.rotation = UP;

        this.container = new Container();
        this.container.addChild(this.content);
        const bounds = this.container.getLocalBounds();
        this.container.pivot.set(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2
        );
        this.container.scale.set(175);
    }

    update(amount: number) {
        this.amount = clamp(amount, 0, this.max);
    }

    private flashing(): boolean {
        const { flashBelow, flashAbove, flashBelowRatio } = this.config;
        if (
            flashBelowRatio !== undefined &&
            this.amount < this.max * flashBelowRatio
        ) {
            return true;
        }
        if (flashBelow !== undefined && this.amount < flashBelow) return true;
        if (flashAbove !== undefined && this.amount > flashAbove) return true;
        return false;
    }

    private fillColors(flashPulse: number): { base: number; overlay: number } {
        const colors = this.config.colors;
        const ratio = this.displayAmount / this.max;
        let base = hex(colors.base);
        let overlay = hex(colors.overlay);
        if (this.config.gradient) {
            const graded = gradientColors(this.config.gradient, ratio);
            base = graded.base;
            overlay = graded.overlay;
        }
        if (flashPulse > 0) {
            base = colorLerp(base, hex(colors.flashBase), flashPulse);
            overlay = colorLerp(overlay, hex(colors.flashOverlay), flashPulse);
        }
        return { base, overlay };
    }

    /** Lerp display value then fill lengths toward it. */
    tick() {
        this.displayAmount = lerp(this.displayAmount, this.amount, DISPLAY_LERP);

        let baseFill: number;
        let overlayFill: number;
        if (this.split) {
            baseFill =
                clamp(this.displayAmount / (this.max / 2), 0, 1) * BAR_LENGTH;
            overlayFill =
                clamp(
                    (this.displayAmount - this.max / 2) / (this.max / 2),
                    0,
                    1
                ) * BAR_LENGTH;
        } else {
            baseFill = clamp(this.displayAmount / this.max, 0, 1) * BAR_LENGTH;
            overlayFill = 0;
        }

        this.base.width = lerp(this.base.width, baseFill, FILL_LERP);
        this.baseDiff.width = lerp(this.baseDiff.width, baseFill, DIFF_LERP);
        this.overlay.width = lerp(this.overlay.width, overlayFill, FILL_LERP);
        this.overlayDiff.width = lerp(
            this.overlayDiff.width,
            overlayFill,
            DIFF_LERP
        );

        const flash = this.flashing();
        const t = performance.now() / 1000;
        const wave = Math.sin(t * Math.PI * 2 * FLASH_HZ + this.shakePhase);
        const flashPulse = flash ? (wave + 1) / 2 : 0;
        const { base, overlay } = this.fillColors(flashPulse);
        this.base.tint = base;
        this.overlay.tint = overlay;
        this.outline.tint = base;
        this.circle.tint = base;

        if (flash && this.config.shake > 0) {
            this.content.rotation =
                UP + wave * this.config.shake * SHAKE_TO_RAD;
        } else {
            this.content.rotation = UP;
        }
    }
}
