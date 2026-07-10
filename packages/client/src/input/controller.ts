import {
    encodeMoveDirection,
    round,
    degrees,
    type MoveAxes,
} from "@bundu/shared";
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
    isInGame(): boolean;
    /** When set, left-click places this structure id at the cursor tile. */
    getPlaceStructureId(): number | null;
};

/**
 * Owns input game rules (look throttle, movement encoding, chat, attack/block).
 * Mouse/keyboard listeners only report raw events; this controller decides packets
 * and local prediction via the player facade.
 */
export class InputController {
    private readonly mouse = new MouseInputListener();
    private readonly keyboard = new KeyboardInputListener();
    private rotationUpdateTick = 0;
    private readonly onPointerDown: (event: PointerEvent) => void;
    private readonly onPointerUp: (event: PointerEvent) => void;

    constructor(
        private readonly sendPacket: SendPacket,
        private readonly facade: InputPlayerFacade
    ) {
        this.mouse.onMouseMove = (mousePos) => this.handleMouseMove(mousePos);
        this.keyboard.onMoveInput = (move) => this.handleMoveInput(move);
        this.keyboard.onSendChat = (message) => this.handleSendChat(message);

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

        const worldPos = this.facade.screenToWorld(mousePos[0], mousePos[1]);
        const rotation = player.predictLook(worldPos);
        this.facade.markUpdating(player);

        this.rotationUpdateTick++;
        if (
            Math.abs(player.rotation - rotation) > 0.1 ||
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
                rotation: 0,
            });
            return;
        }

        this.sendPacket(ClientPacket.Attack, { stop: false });
    }

    private handlePointerUp(event: PointerEvent) {
        if (!this.facade.isInGame()) return;
        if (event.button === 2) {
            this.sendPacket(ClientPacket.Block, { stop: true });
        }
        if (event.button === 0 && this.facade.getPlaceStructureId() === null) {
            this.sendPacket(ClientPacket.Attack, { stop: true });
        }
    }
}
