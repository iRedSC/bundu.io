import {
    encodeMoveDirection,
    round,
    degrees,
    structureOriginAtPoint,
    type MoveAxes,
} from "@bundu/shared";
import { radians } from "@bundu/shared/transforms";
import { worldToTile, type TilePos, type TileRot } from "@bundu/shared/tiles";
import { ClientPacket } from "@bundu/shared/packet_definitions";
import type { Socket } from "../network/socket";
import type { Player } from "../world/objects/player";
import { KeyboardInputListener } from "./keyboard";
import { MouseInputListener } from "./mouse";
import { clientStructurePlacement } from "../configs/registries";

export type SendPacket = Socket["sendPacket"];

/** Minimal surface InputController needs from the local player / world. */
export type InputPlayerFacade = {
    getLocalPlayer(): Player | undefined;
    markUpdating(player: Player): void;
    screenToWorld(screenX: number, screenY: number): { x: number; y: number };
    setCursorWorld(position: { x: number; y: number }): void;
    isInGame(): boolean;
    /** True when pointer is over inventory UI (skip attack/block). */
    isOverInventory(): boolean;
    /** Last ghost validation from the server (`undefined` = not yet known). */
    isPlacementAllowed(): boolean | undefined;
    /** Freecam mode — suppress body input packets. */
    isFreecam(): boolean;
};

/**
 * Owns input game rules (look throttle, movement encoding, chat, attack/block).
 * Mouse/keyboard listeners only report raw events; this controller decides packets.
 */
export class InputController {
    private readonly mouse = new MouseInputListener();
    private readonly keyboard = new KeyboardInputListener();
    private rotationUpdateTick = 0;
    private placementRotation = 0;
    private placementCursor = { x: 0, y: 0 };
    private lastPlacementState = "";
    private placing = false;
    /** Last origin we already sent a place for during this hold. */
    private lastAttemptKey = "";
    private readonly onPointerDown: (event: PointerEvent) => void;
    private readonly onPointerUp: (event: PointerEvent) => void;
    private readonly onPointerMove: (event: PointerEvent) => void;
    onToggleLeaderboard: () => void = () => {};
    onShowWorldHover: (show: boolean) => void = () => {};

    constructor(
        private readonly sendPacket: SendPacket,
        private readonly facade: InputPlayerFacade
    ) {
        this.mouse.onMouseMove = (mousePos) => this.handleMouseMove(mousePos);
        this.keyboard.onMoveInput = (move) => this.handleMoveInput(move);
        this.keyboard.onSendChat = (message) => this.handleSendChat(message);
        this.keyboard.onRotateStructure = () => this.rotateStructure();
        this.keyboard.onToggleLeaderboard = () => this.onToggleLeaderboard();
        this.keyboard.onShowWorldHover = (show) => this.onShowWorldHover(show);

        this.onPointerDown = (event) => this.handlePointerDown(event);
        this.onPointerUp = (event) => this.handlePointerUp(event);
        this.onPointerMove = (event) => this.handlePointerMove(event);
        document.addEventListener("pointerdown", this.onPointerDown);
        document.addEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointermove", this.onPointerMove);
    }

    closeChat() {
        this.keyboard.closeChat();
    }

    /**
     * While hold-placing, re-sample the fixed screen cursor each frame so
     * walking (camera move) still places under the mouse without wiggling.
     */
    update() {
        if (!this.placing) return;
        if (!this.facade.isInGame()) {
            this.stopPlacing();
            return;
        }
        const [screenX, screenY] = this.mouse.mousePos;
        this.syncCursorFromScreen(screenX, screenY);
        const player = this.facade.getLocalPlayer();
        if (!player?.getStructureGhost()) {
            this.stopPlacing();
            return;
        }
        this.tryPlaceAtCursor(player);
    }

    destroy(): void {
        document.removeEventListener("pointerdown", this.onPointerDown);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.removeEventListener("pointermove", this.onPointerMove);
        this.mouse.destroy();
        this.keyboard.destroy();
    }

    /** Ghost became valid while held — place immediately at the current cursor. */
    onPlacementValidity(allowed: boolean) {
        if (!this.placing || !allowed) return;
        const player = this.facade.getLocalPlayer();
        if (player?.getStructureGhost()) this.tryPlaceAtCursor(player);
    }

    private handlePointerMove(event: PointerEvent) {
        if (!this.placing || (event.buttons & 1) === 0) return;
        this.syncCursorFromScreen(event.clientX, event.clientY);
        const player = this.facade.getLocalPlayer();
        if (!player?.getStructureGhost()) {
            this.stopPlacing();
            return;
        }
        this.tryPlaceAtCursor(player);
    }

    private handleMouseMove(mousePos: [number, number]) {
        if (this.facade.isFreecam()) return;
        const player = this.facade.getLocalPlayer();
        if (!player) return;

        // Screen-space look: zoom must not change aim under a fixed cursor.
        const rotation =
            Math.atan2(
                mousePos[1] - window.innerHeight / 2,
                mousePos[0] - window.innerWidth / 2
            ) - radians(90);
        const previousRotation = player.rotation;
        player.predictLook(rotation);
        this.syncCursorFromScreen(mousePos[0], mousePos[1]);
        const placement = player.getStructureGhost();
        if (placement) {
            if (this.placing) this.tryPlaceAtCursor(player);
        } else {
            this.lastPlacementState = "";
            this.stopPlacing();
        }
        this.facade.markUpdating(player);

        this.rotationUpdateTick++;
        if (
            Math.abs(previousRotation - rotation) > 0.1 ||
            this.rotationUpdateTick > 5
        ) {
            this.rotationUpdateTick = 0;
            this.sendPacket(ClientPacket.Rotation, {
                rotation: round(degrees(rotation)),
            });
        }
    }

    private handleMoveInput(move: MoveAxes) {
        const chat = document.querySelector<HTMLInputElement>("#chat-input");
        if (chat === document.activeElement) return;
        if (this.facade.isFreecam()) {
            this.sendPacket(ClientPacket.Movement, {
                direction: encodeMoveDirection(0, 0),
            });
            return;
        }

        this.sendPacket(ClientPacket.Movement, {
            direction: encodeMoveDirection(move[0], move[1]),
        });
    }

    private handleSendChat(message: string) {
        const trimmed = message.trim();
        if (!trimmed) return;
        this.sendPacket(ClientPacket.ChatMessage, { message: trimmed });
    }

    private handlePointerDown(event: PointerEvent) {
        if (!this.facade.isInGame()) return;
        if (this.facade.isFreecam()) return;
        if (this.facade.isOverInventory()) return;
        if (this.facade.getLocalPlayer()?.isCrafting) return;
        if (event.button === 2) {
            this.sendPacket(ClientPacket.Block, { stop: false });
            return;
        }
        if (event.button !== 0) return;

        const player = this.facade.getLocalPlayer();
        if (player?.getStructureGhost()) {
            this.syncCursorFromScreen(event.clientX, event.clientY);
            this.placing = true;
            this.lastAttemptKey = "";
            this.tryPlaceAtCursor(player);
            return;
        }

        this.sendPacket(ClientPacket.Attack, { stop: false });
    }

    private handlePointerUp(event: PointerEvent) {
        if (!this.facade.isInGame()) return;
        if (this.facade.isFreecam()) return;
        if (this.facade.getLocalPlayer()?.isCrafting) return;
        if (event.button === 2) {
            this.sendPacket(ClientPacket.Block, { stop: true });
        }
        if (event.button === 0) {
            this.stopPlacing();
            if (!this.facade.getLocalPlayer()?.getStructureGhost()) {
                this.sendPacket(ClientPacket.Attack, { stop: true });
            }
        }
    }

    private stopPlacing() {
        this.placing = false;
        this.lastAttemptKey = "";
    }

    private syncCursorFromScreen(screenX: number, screenY: number) {
        const world = this.facade.screenToWorld(screenX, screenY);
        this.facade.setCursorWorld(world);
        this.placementCursor = {
            x: worldToTile(world.x),
            y: worldToTile(world.y),
        };
        const player = this.facade.getLocalPlayer();
        if (!player?.getStructureGhost()) return;
        player.setStructureCursor(this.placementCursor);
        const state = `${player.getStructureGhost()?.id ?? 0},${this.placementRotation},${this.placementCursor.x},${this.placementCursor.y}`;
        if (state !== this.lastPlacementState) {
            this.sendPlacementState(player);
        }
    }

    /**
     * Send one place attempt per origin while held. Skips known-invalid tiles;
     * unknown/valid both attempt so hold-move does not wait on validation.
     */
    private tryPlaceAtCursor(player: Player) {
        const ghost = player.getStructureGhost();
        if (!ghost) return;
        if (this.facade.isPlacementAllowed() === false) return;

        const origin = this.currentOrigin(ghost.id);
        const key = originKey(origin);
        if (key === this.lastAttemptKey) return;

        this.lastAttemptKey = key;
        this.sendPlacementState(player);
        this.sendPacket(ClientPacket.PlaceStructure, {});
    }

    private currentOrigin(structureId: number): TilePos {
        const def = clientStructurePlacement(structureId);
        return structureOriginAtPoint(
            this.placementCursor,
            def.blocked,
            (this.placementRotation % 4) as TileRot
        );
    }

    private rotateStructure() {
        const player = this.facade.getLocalPlayer();
        if (!player?.getStructureGhost()) return;
        this.placementRotation = (this.placementRotation + 1) % 4;
        this.sendPlacementState(player);
    }

    private sendPlacementState(player: Player) {
        player.setStructureRotation(this.placementRotation);
        player.setStructureCursor(this.placementCursor);
        this.lastPlacementState = `${player.getStructureGhost()?.id ?? 0},${this.placementRotation},${this.placementCursor.x},${this.placementCursor.y}`;
        this.sendPacket(ClientPacket.SetStructurePlacement, {
            rotation: this.placementRotation,
            x: this.placementCursor.x,
            y: this.placementCursor.y,
        });
    }
}

function originKey(origin: { x: number; y: number }): string {
    return `${origin.x},${origin.y}`;
}
