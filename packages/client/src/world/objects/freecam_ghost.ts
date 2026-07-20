import { rotationLerp } from "@bundu/shared/transforms";
import { clientTime } from "@client/globals";
import { Text, type Point } from "pixi.js";
import { assemble } from "../../models/assemble";
import { bindAnimations } from "../../models/bind";
import { playerDef } from "../../models/defs";
import { AnimationManagers } from "../../animation/animations";
import GameObject from "../game_object";
import type { PositionState } from "../states";

function angleDelta(from: number, to: number): number {
    let delta = to - from;
    delta = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    else if (delta < -Math.PI) delta += 2 * Math.PI;
    return delta;
}

/** Slightly larger than a typical OS cursor (~24–32px). */
export const FREECAM_GHOST_SCREEN_PX = 40;
const NAME_SCREEN_PX = 14;
const CHAT_SCREEN_PX = 12;
const CHAT_OFFSET_PX = 28;
const NAME_OFFSET_PX = 22;
const CHAT_MESSAGE_DURATION = 5_000;
const LABEL_FONT_PX = 40;

/**
 * Networked freecam cursor avatar. Constant screen size; faces movement
 * like animals. Skin uses the player model variant path.
 */
export class FreecamGhost extends GameObject {
    readonly displayName: string;
    name: Text;
    chatMessage: Text;
    private lastTarget = { x: 0, y: 0 };
    private facing = 0;
    private targetFacing = 0;
    private lastVisualAt = clientTime.now();
    private chatTimeout?: ReturnType<typeof setTimeout>;
    private getViewScale: () => number;

    constructor(
        id: number,
        name: Text,
        pos: Point,
        variant: string | undefined,
        getViewScale: () => number
    ) {
        // Tiny interpolator — cursor updates are frequent.
        super(id, pos, 0, 1, 1, 80, 0);
        this.getViewScale = getViewScale;
        this.displayName = name.text;
        this.name = name;
        this.name.roundPixels = true;
        this.name.anchor.set(0.5, 1);
        this.name.zIndex = 100;

        this.chatMessage = new Text({ text: "", style: name.style });
        this.chatMessage.roundPixels = true;
        this.chatMessage.anchor.set(0.5, 1);
        this.chatMessage.zIndex = 102;
        this.chatMessage.visible = false;

        const assembled = assemble(playerDef, this.container, variant);
        const { animations, autoplay } = bindAnimations(
            playerDef,
            assembled.parts
        );
        for (const [animId, animation] of animations) {
            this.animations.set(animId, animation);
        }
        for (const animId of autoplay) {
            this.trigger(animId, AnimationManagers.World);
        }

        this.container.zIndex = 50;
        this.container.alpha = 0.75;
        this.lastTarget = { x: pos.x, y: pos.y };
        this.syncScreenScale();
    }

    override get containers() {
        return [this.container, this.name, this.chatMessage];
    }

    override addPosition(position: PositionState, now?: number): void {
        const dx = position.x - this.lastTarget.x;
        const dy = position.y - this.lastTarget.y;
        if (Math.hypot(dx, dy) > 0.05) {
            this.targetFacing = Math.atan2(dy, dx);
        }
        this.lastTarget = position;
        super.addPosition(position, now);
    }

    showChatMessage(message: string) {
        this.chatMessage.text = message;
        this.chatMessage.visible = true;
        if (this.chatTimeout) clearTimeout(this.chatTimeout);
        this.chatTimeout = setTimeout(() => {
            this.chatMessage.visible = false;
        }, CHAT_MESSAGE_DURATION);
    }

    /** Keep silhouette / labels cursor-sized across zoom. */
    syncScreenScale(): void {
        const vp = Math.abs(this.getViewScale()) || 1;
        // Player parts are unit-normalized (1 world unit at scale 1). Screen px =
        // worldScale * vp, so worldScale = desiredPx / vp. Do NOT divide by
        // TILE_SIZE — that made the silhouette a constant ~0.4px.
        const body = FREECAM_GHOST_SCREEN_PX / vp;
        this.container.scale.set(body);
        this.name.scale.set(NAME_SCREEN_PX / (LABEL_FONT_PX * vp));
        this.chatMessage.scale.set(CHAT_SCREEN_PX / (LABEL_FONT_PX * vp));
    }

    override update(now = clientTime.now()): boolean {
        const done = super.update(now);
        this.syncScreenScale();
        const vp = Math.abs(this.getViewScale()) || 1;
        this.name.position.set(
            this.position.x,
            this.position.y - NAME_OFFSET_PX / vp
        );
        this.chatMessage.position.set(
            this.position.x,
            this.position.y - CHAT_OFFSET_PX / vp
        );

        const elapsed = Math.min(now - this.lastVisualAt, 20);
        this.facing = rotationLerp(
            this.facing,
            this.targetFacing,
            Math.min(1, elapsed / 120)
        );
        this.container.rotation = this.facing;
        this.lastVisualAt = now;
        const turning =
            Math.abs(angleDelta(this.facing, this.targetFacing)) > 0.02;
        return done && !turning;
    }

    override dispose(): void {
        if (this.chatTimeout) clearTimeout(this.chatTimeout);
        AnimationManagers.World.remove(this);
        super.dispose();
    }
}
