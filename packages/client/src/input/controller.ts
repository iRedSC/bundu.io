import {
    encodeMoveDirection,
    round,
    degrees,
    type MoveAxes,
} from "@bundu/shared";
import { radians } from "@bundu/shared/transforms";
import { worldToTile } from "@bundu/shared/tiles";
import { ClientPacket } from "@bundu/shared/packet_definitions";
import type { Socket } from "../network/socket";
import type { Player } from "../world/objects/player";
import { KeyboardInputListener } from "./keyboard";
import { MouseInputListener } from "./mouse";

export type SendPacket = Socket["sendPacket"];

/** Minimal surface InputController needs from the local player / world. */
export type InputPlayerFacade = {
    getLocalPlayer(): Player | undefined;
    markUpdating(player: Player): void;
    screenToWorld(screenX: number, screenY: number): { x: number; y: number };
    setCursorWorld(position: { x: number; y: number }): void;
    isInGame(): boolean;
    /** When set, left-click places this structure id at the cursor tile. */
    getPlaceStructureId(): number | null;
    /** True when pointer is over inventory UI (skip attack/block). */
    isOverInventory(): boolean;
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
    private readonly onPointerDown: (event: PointerEvent) => void;
    private readonly onPointerUp: (event: PointerEvent) => void;
    onToggleLeaderboard: () => void = () => {};

    constructor(
        private readonly sendPacket: SendPacket,
        private readonly facade: InputPlayerFacade
    ) {
        this.mouse.onMouseMove = (mousePos) => this.handleMouseMove(mousePos);
        this.keyboard.onMoveInput = (move) => this.handleMoveInput(move);
        this.keyboard.onSendChat = (message) => this.handleSendChat(message);
        this.keyboard.onRotateStructure = () => this.rotateStructure();
        this.keyboard.onToggleLeaderboard = () => this.onToggleLeaderboard();

        this.onPointerDown = (event) => this.handlePointerDown(event);
        this.onPointerUp = (event) => this.handlePointerUp(event);
        document.addEventListener("pointerdown", this.onPointerDown);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    closeChat() {
        this.keyboard.closeChat();
    }

    private handleMouseMove(mousePos: [number, number]) {
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
        const world = this.facade.screenToWorld(mousePos[0], mousePos[1]);
        this.facade.setCursorWorld(world);
        const cursor = {
            x: worldToTile(world.x),
            y: worldToTile(world.y),
        };
        this.placementCursor = cursor;
        const placement = player.getStructureGhost();
        if (placement) {
            player.setStructureCursor(cursor);
            const state = `${placement.id},${this.placementRotation},${cursor.x},${cursor.y}`;
            if (state !== this.lastPlacementState) {
                this.sendPlacementState(player);
            }
        } else {
            this.lastPlacementState = "";
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
        if (this.facade.isOverInventory()) return;
        if (this.facade.getLocalPlayer()?.isCrafting) return;
        if (event.button === 2) {
            this.sendPacket(ClientPacket.Block, { stop: false });
            return;
        }
        if (event.button !== 0) return;

        const placeId = this.facade.getPlaceStructureId();
        if (placeId !== null) {
            const world = this.facade.screenToWorld(event.clientX, event.clientY);
            this.sendPacket(ClientPacket.PlaceStructureAt, {
                structureId: placeId,
                x: worldToTile(world.x),
                y: worldToTile(world.y),
                rotation: this.placementRotation,
            });
            return;
        }

        const player = this.facade.getLocalPlayer();
        if (player?.getStructureGhost()) {
            this.sendPlacementState(player);
            this.sendPacket(ClientPacket.PlaceStructure, {});
            return;
        }

        this.sendPacket(ClientPacket.Attack, { stop: false });
    }

    private handlePointerUp(event: PointerEvent) {
        if (!this.facade.isInGame()) return;
        if (this.facade.getLocalPlayer()?.isCrafting) return;
        if (event.button === 2) {
            this.sendPacket(ClientPacket.Block, { stop: true });
        }
        if (
            event.button === 0 &&
            this.facade.getPlaceStructureId() === null &&
            !this.facade.getLocalPlayer()?.getStructureGhost()
        ) {
            this.sendPacket(ClientPacket.Attack, { stop: true });
        }
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
