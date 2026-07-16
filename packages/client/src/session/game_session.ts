import { decodePacketData } from "../network/decode";
import type { SerializedPacketArray } from "../network/client_receiver";
import { serializer } from "../network/serializer";
import { Socket } from "../network/socket";

export type GameSocket = Socket;

function isPacketArray(data: unknown): data is SerializedPacketArray {
    return Array.isArray(data) && typeof data[0] === "number";
}

export type PacketReceiver = {
    process(packets: SerializedPacketArray): void;
};

export type GameSessionHooks = {
    /** Re-negotiate packs before each connect (handles server reload / 409). */
    prepareConnection: () => Promise<void>;
    autoReconnect: boolean;
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
    private generation = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    private reconnectDelay = 250;
    private destroyed = false;

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
        if (this.destroyed) return;
        if (this.connecting) return;
        if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

        void this.open(++this.generation);
    }

    private async open(generation: number): Promise<void> {
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

        try {
            await this.hooks.prepareConnection();
        } catch (error) {
            if (generation !== this.generation) return;
            this.connecting = false;
            this.hooks.setConnecting(false);
            this.hooks.onDisconnected();
            console.error("Connection preparation failed", error);
            this.scheduleReconnect();
            return;
        }
        if (generation !== this.generation) return;

        const next = new Socket(
            this.hooks.buildSocketUrl(this.hooks.getUsername()),
            serializer
        );
        this.socket = next;

        next.onmessage = (ev) => {
            if (this.socket !== next) return;
            const raw = ev.data;
            if (!(raw instanceof ArrayBuffer) && !ArrayBuffer.isView(raw)) {
                return;
            }
            const data = decodePacketData(raw);
            if (!isPacketArray(data)) return;
            this.receiver.process(data);
        };

        next.onopen = () => {
            if (this.socket !== next) return;
            this.connecting = false;
            this.reconnectDelay = 250;
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
            this.scheduleReconnect();
        };
    }

    private scheduleReconnect(): void {
        if (!this.hooks.autoReconnect || this.destroyed || this.reconnectTimer) {
            return;
        }
        const delay = this.reconnectDelay;
        this.reconnectDelay = Math.min(2_000, delay * 2);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            this.connect();
        }, delay);
    }

    destroy(): void {
        this.destroyed = true;
        this.generation++;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        const socket = this.socket;
        this.socket = null;
        this.connecting = false;
        if (!socket) return;
        socket.onopen = null;
        socket.onclose = null;
        socket.onmessage = null;
        socket.onerror = null;
        if (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
        ) {
            socket.close();
        }
    }
}
