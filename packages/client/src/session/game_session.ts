import {
    isHardSessionClose,
    SESSION_ENDED_CLOSE,
} from "@bundu/shared/session";
import { ProtocolCodec, type ServerFrame } from "@bundu/shared";
import { serializer } from "../network/serializer";
import { Socket } from "../network/socket";

export type GameSocket = Socket;

export type PacketReceiver = {
    process(packets: ServerFrame): void;
};

export type HardDisconnectInfo = {
    /** True when the server ended a live session (player death). */
    died: boolean;
    code?: number;
};

export type GameSessionHooks = {
    prepareConnection: () => Promise<void>;
    autoReconnect: boolean;
    buildSocketUrl: (username: string) => string;
    getUsername: () => string;
    resetLocalState: () => void;
    setConnecting: (connecting: boolean) => void;
    onConnected: () => void;
    /** Soft blip / supervised reload — keep game UI, reconnect with same token. */
    onSoftDisconnected: () => void;
    /**
     * Called before `resetLocalState` when a live session ends in death so the
     * client can wait for local FX and snapshot the world while it still exists.
     */
    onBeforeDeath?: () => void | Promise<void>;
    /** Death, rejected reclaim, intentional leave — show menu, drop token. */
    onHardDisconnected: (info: HardDisconnectInfo) => void;
};

/**
 * Owns connect lifecycle, socket state, and outbound packet sends.
 * Bootstrap wires hooks; input/UI call sendPacket / isInGame.
 */
export class GameSession {
    private readonly codec = new ProtocolCodec();
    private socket: GameSocket | null = null;
    private connecting = false;
    private generation = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    private reconnectDelay = 250;
    private destroyed = false;
    /** True after a successful open until a hard failure or intentional leave. */
    private hadSession = false;

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

    /** User pressed Play — hard-fail any in-flight soft reconnect and open fresh. */
    connect(): void {
        if (this.destroyed) return;
        if (this.connecting) return;
        if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        void this.open(++this.generation, { soft: false });
    }

    private async open(
        generation: number,
        { soft }: { soft: boolean }
    ): Promise<void> {
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
            if (soft && this.hadSession) {
                this.hooks.onSoftDisconnected();
                this.scheduleReconnect();
            } else {
                this.hadSession = false;
                this.hooks.onHardDisconnected({ died: false });
            }
            console.error("Connection preparation failed", error);
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
            const decoded = this.codec.decodeServerFrame(raw);
            if (!decoded.ok) {
                console.warn("Dropped invalid server frame", decoded.error);
                return;
            }
            this.receiver.process(decoded.value);
        };

        next.onopen = () => {
            if (this.socket !== next) return;
            this.connecting = false;
            this.reconnectDelay = 250;
            this.hadSession = true;
            this.hooks.setConnecting(false);
            this.hooks.onConnected();
        };

        next.onerror = () => {
            // Non-terminal: let onclose own session cleanup.
            if (this.socket !== next) return;
            this.connecting = false;
            this.hooks.setConnecting(false);
        };

        next.onclose = (ev) => {
            this.connecting = false;
            this.hooks.setConnecting(false);
            if (this.socket !== next) return;
            this.socket = null;

            const hard = isHardSessionClose(ev.code);
            const died = this.hadSession && ev.code === SESSION_ENDED_CLOSE;

            if (died) {
                // Keep the world alive briefly so local FX (swings, etc.) finish,
                // then snapshot and tear down. Generation cancels if Play reconnects.
                const generation = this.generation;
                void (async () => {
                    await this.hooks.onBeforeDeath?.();
                    if (this.destroyed || generation !== this.generation) return;
                    this.hooks.resetLocalState();
                    this.hadSession = false;
                    this.hooks.onHardDisconnected({
                        died: true,
                        code: ev.code,
                    });
                })();
                return;
            }

            this.hooks.resetLocalState();

            if (hard || !this.hadSession) {
                this.hadSession = false;
                this.hooks.onHardDisconnected({ died: false, code: ev.code });
                return;
            }

            this.hooks.onSoftDisconnected();
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
            void this.open(++this.generation, { soft: true });
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
