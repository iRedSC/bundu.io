import type { Schema, ClientPacketMap } from "@bundu/shared/packet_definitions";
import { decodeFromBlob } from "../network/decode";
import type { SerializedPacketArray } from "../network/client_receiver";
import { serializer } from "../network/serializer";
import { Socket } from "../network/socket";

export type GameSocket = Socket<typeof Schema.Client, ClientPacketMap>;

function isPacketArray(data: unknown): data is SerializedPacketArray {
    return Array.isArray(data) && typeof data[0] === "number";
}

export type PacketReceiver = {
    process(packets: SerializedPacketArray): void;
};

export type GameSessionHooks = {
    buildSocketUrl: (username: string) => string;
    getUsername: () => string;
    resetLocalState: () => void;
    setConnecting: (connecting: boolean) => void;
    onConnected: () => void;
    onDisconnected: () => void;
};

/**
 * Owns connect lifecycle, socket state, and outbound packet sends.
 * Bootstrap wires hooks; input/UI call sendPacket / isInGame.
 */
export class GameSession {
    private socket: GameSocket | null = null;
    private connecting = false;

    constructor(
        private readonly receiver: PacketReceiver,
        private readonly hooks: GameSessionHooks
    ) {}

    readonly sendPacket: GameSocket["sendPacket"] = (id, data) => {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.socket.sendPacket(id, data);
    };

    isInGame(): boolean {
        return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
    }

    connect(): void {
        if (this.connecting) return;
        if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

        this.connecting = true;
        this.hooks.setConnecting(true);
        this.hooks.resetLocalState();

        if (this.socket) {
            this.socket.onopen = null;
            this.socket.onclose = null;
            this.socket.onmessage = null;
            this.socket.onerror = null;
            if (
                this.socket.readyState === WebSocket.OPEN ||
                this.socket.readyState === WebSocket.CONNECTING
            ) {
                this.socket.close();
            }
        }

        const next = new Socket(
            this.hooks.buildSocketUrl(this.hooks.getUsername()),
            serializer
        );
        this.socket = next;

        next.onmessage = async (ev) => {
            const data = await decodeFromBlob(ev.data);
            if (this.socket !== next) return;
            if (!isPacketArray(data)) return;
            this.receiver.process(data);
        };

        next.onopen = () => {
            if (this.socket !== next) return;
            this.connecting = false;
            this.hooks.setConnecting(false);
            this.hooks.onConnected();
        };

        next.onerror = () => {
            // Non-terminal: let onclose own session cleanup.
            if (this.socket !== next) return;
            this.connecting = false;
            this.hooks.setConnecting(false);
        };

        next.onclose = () => {
            this.connecting = false;
            this.hooks.setConnecting(false);
            if (this.socket !== next) return;
            this.socket = null;
            this.hooks.resetLocalState();
            this.hooks.onDisconnected();
        };
    }
}
