/**
 * Lightweight Brigadier-style command defs: shared parse / suggest / tokenize.
 * Server attaches `run`; client hydrates the projection for UX only.
 */

export type CommandArgTypeId = "enum" | "integer" | "float" | "word" | "item";

export type CommandArgProjection = {
    name: string;
    type: CommandArgTypeId;
    optional?: boolean;
    values?: readonly string[];
    min?: number;
    max?: number;
};

export type CommandProjection = {
    name: string;
    opLevel: number;
    args: readonly CommandArgProjection[];
};

export type CommandRegistryProjection = {
    commands: readonly CommandProjection[];
};

export type TokenKind = "slash" | "command" | "arg" | "error" | "text";

export type CommandToken = {
    start: number;
    end: number;
    kind: TokenKind;
};

export type ParseSuccess = {
    ok: true;
    name: string;
    args: Record<string, string | number>;
};

export type ParseFailure = {
    ok: false;
    message: string;
};

export type ParseResult = ParseSuccess | ParseFailure;

export type SuggestContext = {
    /** Item path suggestions (`copper_sword` or `bundu:copper_sword`). */
    itemIds?: readonly string[];
};

/** One autocomplete row. Type-only rows have an empty `insert`. */
export type CommandSuggestion = {
    /** Text written into the input when applied. */
    insert: string;
    /** Primary text in the list. */
    label: string;
    /** Type / usage hint shown beside the label (e.g. `<int>`). */
    hint?: string;
};

function argTypeToken(arg: CommandArgProjection): string {
    switch (arg.type) {
        case "integer":
            return "<int>";
        case "float":
            return "<float>";
        case "word":
            return `<${arg.name}>`;
        case "item":
            return "<item>";
        case "enum":
            return `<${arg.name}>`;
    }
}

/** Keyed type hint, e.g. `amount: <int>`. */
function argTypeHint(arg: CommandArgProjection): string {
    return `${arg.name}: ${argTypeToken(arg)}`;
}

function commandUsageHint(command: CommandProjection): string | undefined {
    if (command.args.length === 0) return undefined;
    return command.args
        .map((arg) => {
            const hint = argTypeHint(arg);
            return arg.optional ? `[${hint}]` : hint;
        })
        .join(" ");
}

class StringReader {
    readonly input: string;
    cursor = 0;

    constructor(input: string) {
        this.input = input;
    }

    get remaining(): string {
        return this.input.slice(this.cursor);
    }

    canRead(length = 1): boolean {
        return this.cursor + length <= this.input.length;
    }

    peek(): string {
        return this.input[this.cursor] ?? "";
    }

    skip(): void {
        this.cursor++;
    }

    skipWhitespace(): void {
        while (this.canRead() && this.peek() === " ") this.skip();
    }

    readUntilSpace(): { start: number; end: number; value: string } {
        const start = this.cursor;
        while (this.canRead() && this.peek() !== " ") this.skip();
        const end = this.cursor;
        return { start, end, value: this.input.slice(start, end) };
    }
}

function filterPrefix(values: readonly string[], prefix: string): string[] {
    const lower = prefix.toLowerCase();
    return values.filter((value) => value.toLowerCase().startsWith(lower));
}

function parseNumberArg(
    raw: string,
    arg: CommandArgProjection,
    integer: boolean
): number | string {
    const value = integer ? Number.parseInt(raw, 10) : Number(raw);
    if (!Number.isFinite(value) || (integer && !Number.isSafeInteger(value))) {
        return `Invalid ${arg.name}: expected ${integer ? "integer" : "number"}`;
    }
    if (arg.min !== undefined && value < arg.min) {
        return `Invalid ${arg.name}: min ${arg.min}`;
    }
    if (arg.max !== undefined && value > arg.max) {
        return `Invalid ${arg.name}: max ${arg.max}`;
    }
    return value;
}

function parseArgValue(
    raw: string,
    arg: CommandArgProjection
): string | number | { error: string } {
    switch (arg.type) {
        case "enum": {
            const values = arg.values ?? [];
            if (!values.includes(raw)) {
                return {
                    error: `Invalid ${arg.name}: expected ${values.join("|")}`,
                };
            }
            return raw;
        }
        case "integer": {
            const result = parseNumberArg(raw, arg, true);
            return typeof result === "string" ? { error: result } : result;
        }
        case "float": {
            const result = parseNumberArg(raw, arg, false);
            return typeof result === "string" ? { error: result } : result;
        }
        case "word":
        case "item":
            if (!raw) return { error: `Missing ${arg.name}` };
            return raw;
    }
}

function suggestionsForArg(
    arg: CommandArgProjection,
    partial: string,
    ctx: SuggestContext
): CommandSuggestion[] {
    const hint = argTypeHint(arg);
    switch (arg.type) {
        case "enum":
            return filterPrefix(arg.values ?? [], partial).map((value) => ({
                insert: value,
                label: value,
                hint,
            }));
        case "item": {
            const items = filterPrefix(ctx.itemIds ?? [], partial)
                .slice(0, 40)
                .map((value) => ({
                    insert: value,
                    label: value,
                    hint,
                }));
            if (items.length === 0) {
                return [{ insert: "", label: hint }];
            }
            return items;
        }
        case "integer":
        case "float":
        case "word":
            return [{ insert: "", label: hint }];
    }
}

export function findCommand(
    registry: CommandRegistryProjection,
    name: string
): CommandProjection | undefined {
    return registry.commands.find((command) => command.name === name);
}

/** Parse a slash command against a registry (leading `/` optional). */
export function parseCommand(
    input: string,
    registry: CommandRegistryProjection
): ParseResult {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) {
        return { ok: false, message: "Not a command" };
    }

    const reader = new StringReader(trimmed);
    if (reader.peek() === "/") reader.skip();
    reader.skipWhitespace();

    const nameTok = reader.readUntilSpace();
    if (!nameTok.value) return { ok: false, message: "Missing command" };

    const command = findCommand(registry, nameTok.value);
    if (!command) return { ok: false, message: `Unknown command: /${nameTok.value}` };

    const args: Record<string, string | number> = {};
    for (const arg of command.args) {
        reader.skipWhitespace();
        if (!reader.canRead()) {
            if (arg.optional) break;
            return { ok: false, message: `Missing ${arg.name}` };
        }
        const tok = reader.readUntilSpace();
        const parsed = parseArgValue(tok.value, arg);
        if (typeof parsed === "object") return { ok: false, message: parsed.error };
        args[arg.name] = parsed;
    }

    reader.skipWhitespace();
    if (reader.canRead()) {
        return { ok: false, message: "Too many arguments" };
    }

    return { ok: true, name: command.name, args };
}

/**
 * Completions for the token under `cursor` (0..length).
 * Command names include a usage `hint`; typed args include `<int>`-style hints.
 */
export function suggestCommand(
    input: string,
    cursor: number,
    registry: CommandRegistryProjection,
    ctx: SuggestContext = {}
): CommandSuggestion[] {
    const clamped = Math.max(0, Math.min(cursor, input.length));
    const before = input.slice(0, clamped);
    if (!before.startsWith("/")) return [];

    const reader = new StringReader(before);
    reader.skip(); // `/`
    reader.skipWhitespace();

    const nameTok = reader.readUntilSpace();

    // Still typing the command name (or only `/`).
    if (
        before === "/" ||
        (!before.slice(1).trimStart().includes(" ") && !before.endsWith(" "))
    ) {
        const partial = nameTok.value;
        return filterPrefix(
            registry.commands.map((command) => command.name),
            partial
        ).flatMap((name) => {
            const command = findCommand(registry, name);
            if (!command) return [];
            return [
                {
                    insert: `/${name}`,
                    label: name,
                    hint: commandUsageHint(command),
                },
            ];
        });
    }

    const command = findCommand(registry, nameTok.value);
    if (!command) return [];

    let argIndex = 0;
    let partial = "";
    for (; argIndex < command.args.length; argIndex++) {
        reader.skipWhitespace();
        if (reader.cursor >= before.length) {
            partial = "";
            break;
        }
        const tok = reader.readUntilSpace();
        if (reader.cursor >= before.length && !before.endsWith(" ")) {
            partial = tok.value;
            break;
        }
        // Completed this arg; move on.
        partial = "";
    }

    if (argIndex >= command.args.length) return [];
    const arg = command.args[argIndex];
    if (!arg) return [];
    return suggestionsForArg(arg, partial, ctx);
}

/** Token ranges for syntax highlighting. */
export function tokenizeCommand(
    input: string,
    registry: CommandRegistryProjection
): CommandToken[] {
    if (!input.startsWith("/")) {
        return input
            ? [{ start: 0, end: input.length, kind: "text" }]
            : [];
    }

    const tokens: CommandToken[] = [{ start: 0, end: 1, kind: "slash" }];
    const reader = new StringReader(input);
    reader.skip();
    reader.skipWhitespace();

    if (!reader.canRead()) return tokens;

    const nameTok = reader.readUntilSpace();
    const command = findCommand(registry, nameTok.value);
    tokens.push({
        start: nameTok.start,
        end: nameTok.end,
        kind: command ? "command" : "error",
    });

    if (!command) {
        if (reader.canRead()) {
            reader.skipWhitespace();
            if (reader.canRead()) {
                tokens.push({
                    start: reader.cursor,
                    end: input.length,
                    kind: "error",
                });
            }
        }
        return tokens;
    }

    let failed = false;
    for (const arg of command.args) {
        reader.skipWhitespace();
        if (!reader.canRead()) break;
        const tok = reader.readUntilSpace();
        if (failed) {
            tokens.push({ start: tok.start, end: tok.end, kind: "error" });
            continue;
        }
        const parsed = parseArgValue(tok.value, arg);
        if (typeof parsed === "object") {
            tokens.push({ start: tok.start, end: tok.end, kind: "error" });
            failed = true;
        } else {
            tokens.push({ start: tok.start, end: tok.end, kind: "arg" });
        }
    }

    reader.skipWhitespace();
    if (reader.canRead()) {
        tokens.push({
            start: reader.cursor,
            end: input.length,
            kind: "error",
        });
    }

    return tokens;
}

export function filterRegistryByOpLevel(
    registry: CommandRegistryProjection,
    opLevel: number
): CommandRegistryProjection {
    return {
        commands: registry.commands.filter(
            (command) => command.opLevel <= opLevel
        ),
    };
}

/** Apply a suggestion into `input` at `cursor`; returns new value + cursor. */
export function applySuggestion(
    input: string,
    cursor: number,
    suggestion: string | CommandSuggestion
): { value: string; cursor: number } {
    const insert =
        typeof suggestion === "string" ? suggestion : suggestion.insert;
    if (!insert) return { value: input, cursor };

    const clamped = Math.max(0, Math.min(cursor, input.length));
    const before = input.slice(0, clamped);
    const after = input.slice(clamped);

    if (insert.startsWith("/")) {
        const space = before.indexOf(" ");
        const headEnd = space === -1 ? before.length : space;
        const value = `${insert}${before.slice(headEnd)}${after}`;
        return { value, cursor: insert.length };
    }

    let i = clamped;
    while (i > 0 && before[i - 1] !== " " && before[i - 1] !== "/") i--;
    let j = 0;
    while (j < after.length && after[j] !== " ") j++;
    const value = `${before.slice(0, i)}${insert}${after.slice(j)}`;
    const nextCursor = i + insert.length;
    return { value, cursor: nextCursor };
}
