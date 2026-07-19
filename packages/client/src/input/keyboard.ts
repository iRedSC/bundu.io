import { Keystrokes } from "@rwh/keystrokes";
import {
    axesFromPressedKeys,
    type MoveAxes,
} from "@bundu/shared";
import type { ChatController } from "../ui/chat";

export class KeyboardInputListener {
    keybinds: Keystrokes;
    chatOpen: boolean;

    private pressed = {
        up: false,
        down: false,
        left: false,
        right: false,
    };

    private chat?: ChatController;

    /** Blocks browser focus-steal on Tab while playing. */
    private readonly onTabKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Tab" || this.chatOpen) return;
        event.preventDefault();
    };

    /** Open command compose with a leading `/`. */
    private readonly onSlashKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }
        if (this.chatOpen || !this.chat) return;
        const active = document.activeElement;
        if (
            active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement ||
            (active instanceof HTMLElement && active.isContentEditable)
        ) {
            return;
        }
        event.preventDefault();
        this.chatOpen = true;
        this.chat.openCompose("/");
    };

    onMoveInput: (direction: MoveAxes) => void = () => {};
    onSendChat: (message: string) => void = () => {};
    onRotateStructure: () => void = () => {};
    onToggleLeaderboard: () => void = () => {};
    /** Hold Tab: reveal every structure health bar (world hover). */
    onShowWorldHover: (show: boolean) => void = () => {};

    constructor() {
        this.keybinds = new Keystrokes({
            keyRemap: {
                w: "up",
                a: "left",
                s: "down",
                d: "right",
                enter: "chat",
                r: "placement_rotate",
                tab: "world_hover",
            },
        });

        this.chatOpen = false;
        document.addEventListener("keydown", this.onTabKeyDown);
        document.addEventListener("keydown", this.onSlashKeyDown);

        const emitMove = () => {
            this.onMoveInput(axesFromPressedKeys(this.pressed));
        };

        this.keybinds.bindKey("up", {
            onPressed: () => {
                this.pressed.up = true;
                emitMove();
            },
            onReleased: () => {
                this.pressed.up = false;
                emitMove();
            },
        });
        this.keybinds.bindKey("left", {
            onPressed: () => {
                this.pressed.left = true;
                emitMove();
            },
            onReleased: () => {
                this.pressed.left = false;
                emitMove();
            },
        });
        this.keybinds.bindKey("down", {
            onPressed: () => {
                this.pressed.down = true;
                emitMove();
            },
            onReleased: () => {
                this.pressed.down = false;
                emitMove();
            },
        });
        this.keybinds.bindKey("right", {
            onPressed: () => {
                this.pressed.right = true;
                emitMove();
            },
            onReleased: () => {
                this.pressed.right = false;
                emitMove();
            },
        });

        this.keybinds.bindKey("chat", {
            onReleased: () => {
                // Enter in other inputs (e.g. username) must not toggle chat.
                const active = document.activeElement;
                if (
                    active instanceof HTMLInputElement &&
                    active.id !== "chat-input"
                ) {
                    return;
                }

                if (!this.chat) return;

                if (this.chatOpen) {
                    // Tab cycles/fills suggestions; Enter always sends.
                    this.chatOpen = false;
                    const message = this.chat.takeMessage();
                    if (message) this.onSendChat(message);
                    return;
                }

                this.chatOpen = true;
                this.chat.openCompose();
            },
        });
        this.keybinds.bindKey("placement_rotate", {
            onPressed: () => {
                if (!this.chatOpen) this.onRotateStructure();
            },
        });
        this.keybinds.bindKey("world_hover", {
            onPressed: () => {
                if (!this.chatOpen) this.onShowWorldHover(true);
            },
            onReleased: () => {
                this.onShowWorldHover(false);
            },
        });
    }

    bindChat(chat: ChatController): void {
        this.chat = chat;
        chat.onComposeClosed = () => {
            this.chatOpen = false;
        };
    }

    closeChat() {
        this.chatOpen = false;
        this.chat?.closeCompose();
    }

    destroy(): void {
        document.removeEventListener("keydown", this.onTabKeyDown);
        document.removeEventListener("keydown", this.onSlashKeyDown);
        this.onShowWorldHover(false);
        this.keybinds.unbindEnvironment();
    }
}
