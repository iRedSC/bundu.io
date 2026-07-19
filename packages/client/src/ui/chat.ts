import {
    applySuggestion,
    suggestCommand,
    tokenizeCommand,
    type CommandRegistryProjection,
    type CommandSuggestion,
    type CommandToken,
} from "@bundu/shared/command";
import { clientRegistries } from "../configs/registries";

const HISTORY_KEY = "bundu.chat_history";
const HISTORY_LIMIT = 50;
const LOG_LIMIT = 80;

type ChatHud = {
    root: HTMLElement;
    log: HTMLElement;
    compose: HTMLElement;
    suggest: HTMLElement;
    highlight: HTMLElement;
    input: HTMLInputElement;
};

function el<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing #${id}`);
    return node as T;
}

function loadHistory(): string[] {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((entry): entry is string => typeof entry === "string");
    } catch {
        return [];
    }
}

function saveHistory(entries: string[]): void {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(-HISTORY_LIMIT)));
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function tokenClass(kind: CommandToken["kind"]): string {
    switch (kind) {
        case "slash":
            return "chat-tok-slash";
        case "command":
            return "chat-tok-command";
        case "arg":
            return "chat-tok-arg";
        case "error":
            return "chat-tok-error";
        case "text":
            return "chat-tok-text";
    }
}

function itemSuggestionIds(): string[] {
    try {
        const ids: string[] = [];
        for (const [location] of clientRegistries().item.entries()) {
            ids.push(location);
            const sep = location.indexOf(":");
            if (sep > 0) ids.push(location.slice(sep + 1));
        }
        return ids;
    } catch {
        return [];
    }
}

export class ChatController {
    private readonly hud: ChatHud;
    private registry: CommandRegistryProjection = { commands: [] };
    private history = loadHistory();
    private historyIndex = -1;
    private draft = "";
    private suggestions: CommandSuggestion[] = [];
    private suggestIndex = 0;
    private open = false;
    /** Dedupe anon-proxy double ChatMessage emits. */
    private lastPlayerLog: { key: string; at: number } | undefined;
    /** Fired when compose closes without sending (e.g. Escape). */
    onComposeClosed: () => void = () => {};

    constructor() {
        this.hud = {
            root: el("chat-hud"),
            log: el("chat-log"),
            compose: el("chat-compose"),
            suggest: el("chat-suggest"),
            highlight: el("chat-highlight"),
            input: el<HTMLInputElement>("chat-input"),
        };

        this.hud.log.classList.add("hidden");

        this.hud.input.addEventListener("input", () => {
            this.historyIndex = -1;
            this.refreshSuggest();
            this.refreshHighlight();
        });
        this.hud.input.addEventListener("keydown", (event) => {
            this.onInputKeyDown(event);
        });
    }

    setVisible(visible: boolean): void {
        this.hud.root.classList.toggle("hidden", !visible);
        if (!visible) this.closeCompose();
    }

    setRegistry(registry: CommandRegistryProjection): void {
        this.registry = registry;
        if (this.open) {
            this.refreshSuggest();
            this.refreshHighlight();
        }
    }

    isOpen(): boolean {
        return this.open;
    }

    openCompose(): void {
        this.open = true;
        this.hud.compose.classList.remove("hidden");
        this.hud.log.classList.remove("hidden");
        this.hud.input.focus();
        this.historyIndex = -1;
        this.draft = "";
        this.refreshSuggest();
        this.refreshHighlight();
        this.hud.log.scrollTop = this.hud.log.scrollHeight;
    }

    closeCompose(clear = true): void {
        const wasOpen = this.open;
        this.open = false;
        if (clear) {
            this.hud.input.value = "";
            this.draft = "";
        }
        this.hud.input.blur();
        this.hud.compose.classList.add("hidden");
        this.hud.log.classList.add("hidden");
        this.hud.suggest.replaceChildren();
        this.suggestions = [];
        this.refreshHighlight();
        if (wasOpen) this.onComposeClosed();
    }

    /** Take current input for send; clears compose. Empty string if blank. */
    takeMessage(): string {
        const trimmed = this.hud.input.value.trim();
        if (trimmed) this.pushHistory(trimmed);
        // Avoid onComposeClosed when Enter is handling the toggle itself.
        this.open = false;
        this.hud.input.value = "";
        this.draft = "";
        this.hud.input.blur();
        this.hud.compose.classList.add("hidden");
        this.hud.log.classList.add("hidden");
        this.hud.suggest.replaceChildren();
        this.suggestions = [];
        this.refreshHighlight();
        return trimmed;
    }

    appendPlayerMessage(name: string, message: string): void {
        const key = `${name}\0${message}`;
        const now = performance.now();
        if (
            this.lastPlayerLog &&
            this.lastPlayerLog.key === key &&
            now - this.lastPlayerLog.at < 50
        ) {
            return;
        }
        this.lastPlayerLog = { key, at: now };
        this.appendLine(
            `<span class="chat-log-name">${escapeHtml(name)}</span>` +
                `<span class="chat-log-sep">: </span>` +
                `<span class="chat-log-msg">${escapeHtml(message)}</span>`
        );
    }

    appendCommandResult(message: string, ok: boolean): void {
        const cls = ok ? "chat-log-ok" : "chat-log-err";
        this.appendLine(
            `<span class="${cls}">${escapeHtml(message)}</span>`
        );
    }

    private appendLine(html: string): void {
        const line = document.createElement("div");
        line.className = "chat-log-line";
        line.innerHTML = html;
        this.hud.log.appendChild(line);
        while (this.hud.log.children.length > LOG_LIMIT) {
            this.hud.log.firstElementChild?.remove();
        }
        if (this.open) {
            this.hud.log.scrollTop = this.hud.log.scrollHeight;
        }
    }

    private pushHistory(entry: string): void {
        const next = this.history.filter((item) => item !== entry);
        next.push(entry);
        this.history = next.slice(-HISTORY_LIMIT);
        saveHistory(this.history);
        this.historyIndex = -1;
    }

    private onInputKeyDown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            event.preventDefault();
            this.closeCompose();
            return;
        }

        const hasSuggest = this.suggestions.length > 0;

        if (event.key === "Tab") {
            event.preventDefault();
            if (!hasSuggest) return;
            if (event.shiftKey) {
                this.moveSuggest(-1);
                this.applyCurrentSuggestion();
                return;
            }
            const sizeBefore = this.suggestions.length;
            const insertBefore =
                this.suggestions[this.suggestIndex]?.insert ?? "";
            this.applyCurrentSuggestion();
            if (!insertBefore) {
                this.moveSuggest(1);
                return;
            }
            // Same completion set — advance highlight for the next Tab.
            if (
                this.suggestions.length === sizeBefore &&
                this.suggestions.some((entry) => entry.insert === insertBefore)
            ) {
                this.moveSuggest(1);
            }
            return;
        }

        if (hasSuggest && event.key === "ArrowDown") {
            event.preventDefault();
            this.moveSuggest(1);
            return;
        }
        if (hasSuggest && event.key === "ArrowUp") {
            event.preventDefault();
            this.moveSuggest(-1);
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            this.historyStep(-1);
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            this.historyStep(1);
        }
    }

    private moveSuggest(delta: number): void {
        if (this.suggestions.length === 0) return;
        const count = this.suggestions.length;
        this.suggestIndex = (this.suggestIndex + delta + count) % count;
        this.renderSuggestList();
        this.scrollActiveSuggestIntoView();
    }

    private historyStep(delta: number): void {
        if (this.history.length === 0) return;
        if (this.historyIndex === -1) {
            this.draft = this.hud.input.value;
            this.historyIndex = this.history.length;
        }
        const next = this.historyIndex + delta;
        if (next < 0) return;
        if (next >= this.history.length) {
            this.historyIndex = -1;
            this.hud.input.value = this.draft;
        } else {
            this.historyIndex = next;
            this.hud.input.value = this.history[next] ?? "";
        }
        const end = this.hud.input.value.length;
        this.hud.input.setSelectionRange(end, end);
        this.refreshSuggest();
        this.refreshHighlight();
    }

    private refreshSuggest(resetIndex = true): void {
        const value = this.hud.input.value;
        const cursor = this.hud.input.selectionStart ?? value.length;
        this.suggestions = value.startsWith("/")
            ? suggestCommand(value, cursor, this.registry, {
                  itemIds: itemSuggestionIds(),
              })
            : [];
        if (resetIndex) this.suggestIndex = 0;
        else if (this.suggestIndex >= this.suggestions.length) {
            this.suggestIndex = Math.max(0, this.suggestions.length - 1);
        }
        this.renderSuggestList();
    }

    private renderSuggestList(): void {
        this.hud.suggest.replaceChildren();
        for (const [index, suggestion] of this.suggestions.entries()) {
            const item = document.createElement("li");
            item.className = "chat-suggest-item";
            if (!suggestion.insert) item.classList.add("chat-suggest-type");
            if (index === this.suggestIndex) item.classList.add("active");

            const label = document.createElement("span");
            label.className = "chat-suggest-label";
            label.textContent = suggestion.label;
            item.appendChild(label);

            if (suggestion.hint) {
                const hint = document.createElement("span");
                hint.className = "chat-suggest-hint";
                hint.textContent = suggestion.hint;
                item.appendChild(hint);
            }

            item.addEventListener("mousedown", (event) => {
                event.preventDefault();
                this.suggestIndex = index;
                this.applyCurrentSuggestion();
            });
            this.hud.suggest.appendChild(item);
        }
    }

    private scrollActiveSuggestIntoView(): void {
        const active = this.hud.suggest.children[this.suggestIndex];
        if (active instanceof HTMLElement) {
            active.scrollIntoView({ block: "nearest" });
        }
    }

    private applyCurrentSuggestion(): void {
        const suggestion = this.suggestions[this.suggestIndex];
        if (!suggestion?.insert) return;
        const cursor = this.hud.input.selectionStart ?? this.hud.input.value.length;
        const next = applySuggestion(this.hud.input.value, cursor, suggestion);
        this.hud.input.value = next.value;
        this.hud.input.setSelectionRange(next.cursor, next.cursor);
        const kept = suggestion.insert;
        this.refreshSuggest(false);
        const idx = this.suggestions.findIndex((entry) => entry.insert === kept);
        this.suggestIndex = idx >= 0 ? idx : 0;
        this.renderSuggestList();
        this.refreshHighlight();
    }

    private refreshHighlight(): void {
        const value = this.hud.input.value;
        if (!value.startsWith("/")) {
            this.hud.highlight.innerHTML = escapeHtml(value);
            return;
        }
        const tokens = tokenizeCommand(value, this.registry);
        let html = "";
        let cursor = 0;
        for (const token of tokens) {
            if (token.start > cursor) {
                html += escapeHtml(value.slice(cursor, token.start));
            }
            html +=
                `<span class="${tokenClass(token.kind)}">` +
                `${escapeHtml(value.slice(token.start, token.end))}</span>`;
            cursor = token.end;
        }
        if (cursor < value.length) html += escapeHtml(value.slice(cursor));
        // Trailing space keeps scroll width matched with the input.
        this.hud.highlight.innerHTML = html || "&nbsp;";
    }
}
