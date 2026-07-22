/**
 * Minecraft-style entity selectors shared by commands and pack effect targets.
 *
 * Command form: `@a[flag=in_water,type=bundu:player,limit=1,sort=nearest]`
 * Effect target form: `@s`, `@a[distance=0.2..10]`, `@s[flag=near_fire]`
 * Legacy YAML filter form (no @-base): `type=bundu:player,flag=in_water`
 * Bare YAML type keys (`player`, `#living`) are handled by the pack loader.
 */

export type SelectorBase = "s" | "p" | "a" | "e" | "r";

export type SelectorSort = "nearest" | "furthest" | "random" | "arbitrary";

/** Inclusive tile-distance range (`distance=0.2..10`, `..5`, `3..`, or exact `3`). */
export type DistanceRange = {
    min: number;
    max: number;
};

export type SelectorClause =
    | { key: "type"; negate: boolean; value: string }
    | { key: "flag"; negate: boolean; value: string }
    | { key: "name"; negate: boolean; value: string }
    | { key: "mainhand"; negate: boolean; value: string }
    | { key: "offhand"; negate: boolean; value: string }
    | { key: "helmet"; negate: boolean; value: string }
    | { key: "hasitem"; negate: boolean; value: string }
    | { key: "ground"; negate: boolean; value: string }
    | { key: "time"; negate: boolean; value: string }
    | { key: "connected"; negate: boolean; value: boolean }
    | { key: "distance"; negate: boolean; range: DistanceRange }
    | { key: "limit"; value: number }
    | { key: "sort"; value: SelectorSort };

/** Parsed `@a[...]` command selector. */
export type EntitySelector = {
    raw: string;
    base: SelectorBase;
    clauses: readonly SelectorClause[];
};

/** Clause-only filter used by pack YAML target keys. */
export type EntityFilter = {
    raw: string;
    clauses: readonly SelectorClause[];
};

export type ParseOk<T> = { ok: true; value: T };
export type ParseErr = { ok: false; message: string };
export type ParseSelectorResult = ParseOk<EntitySelector> | ParseErr;
export type ParseFilterResult = ParseOk<EntityFilter> | ParseErr;

export type SelectorSuggestContext = {
    flagNames?: readonly string[];
    entityTypeIds?: readonly string[];
    playerNames?: readonly string[];
    itemIds?: readonly string[];
    groundTypeIds?: readonly string[];
    timeNames?: readonly string[];
};

export type SelectorSuggestion = {
    /** Full selector token to insert (replaces the current arg token). */
    insert: string;
    label: string;
    hint?: string;
};

const BASES: readonly SelectorBase[] = ["s", "p", "a", "e", "r"];

const BASE_HINTS: Record<SelectorBase, string> = {
    s: "yourself",
    p: "nearest player",
    a: "all players",
    e: "all living",
    r: "random player",
};

const SORT_VALUES: readonly SelectorSort[] = [
    "nearest",
    "furthest",
    "random",
    "arbitrary",
];

const CLAUSE_KEYS = [
    "type",
    "flag",
    "name",
    "mainhand",
    "offhand",
    "helmet",
    "hasitem",
    "ground",
    "time",
    "connected",
    "distance",
    "limit",
    "sort",
] as const;
type ClauseKey = (typeof CLAUSE_KEYS)[number];

const CLAUSE_HINTS: Record<ClauseKey, string> = {
    type: "entity type or #tag",
    flag: "effective flag",
    name: "player name",
    mainhand: "item id or #tag",
    offhand: "item id or #tag",
    helmet: "item id or #tag",
    hasitem: "item id or #tag in inventory",
    ground: "ground type id or #tag",
    time: "morning|day|evening|night",
    connected: "true|false (has socket)",
    distance: "tiles (N, N.., ..N, N..M)",
    limit: "max matches",
    sort: "nearest|furthest|random|arbitrary",
};

function parseBooleanValue(
    raw: string,
    path: string,
    key: string
): boolean | ParseErr {
    const lower = raw.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
    return {
        ok: false,
        message: `${path}: ${key} must be true|false`,
    };
}

const ITEM_CLAUSE_KEYS = new Set<ClauseKey>([
    "mainhand",
    "offhand",
    "helmet",
    "hasitem",
]);

function isSelectorBase(value: string): value is SelectorBase {
    return (BASES as readonly string[]).includes(value);
}

function isSort(value: string): value is SelectorSort {
    return (SORT_VALUES as readonly string[]).includes(value);
}

function isClauseKey(value: string): value is ClauseKey {
    return (CLAUSE_KEYS as readonly string[]).includes(value);
}

/** Split `a=b,c=d` on commas that are not inside quotes (quotes unsupported → plain split). */
function splitClauses(body: string): string[] {
    if (!body) return [];
    return body.split(",").map((part) => part.trim());
}

function parseFiniteNumber(raw: string, path: string, label: string): number | ParseErr {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
        return { ok: false, message: `${path}: ${label} must be a finite number` };
    }
    if (n < 0) {
        return { ok: false, message: `${path}: ${label} cannot be negative` };
    }
    return n;
}

/** Parse Minecraft-style distance ranges in tiles. */
export function parseDistanceRange(
    raw: string,
    path: string
): ParseOk<DistanceRange> | ParseErr {
    if (!raw.includes("..")) {
        const n = parseFiniteNumber(raw, path, "distance");
        if (typeof n !== "number") return n;
        return { ok: true, value: { min: n, max: n } };
    }
    const sep = raw.indexOf("..");
    const loRaw = raw.slice(0, sep).trim();
    const hiRaw = raw.slice(sep + 2).trim();
    let min = 0;
    let max = Number.POSITIVE_INFINITY;
    if (loRaw) {
        const lo = parseFiniteNumber(loRaw, path, "distance min");
        if (typeof lo !== "number") return lo;
        min = lo;
    }
    if (hiRaw) {
        const hi = parseFiniteNumber(hiRaw, path, "distance max");
        if (typeof hi !== "number") return hi;
        max = hi;
    }
    if (min > max) {
        return { ok: false, message: `${path}: distance min cannot exceed max` };
    }
    return { ok: true, value: { min, max } };
}

function parseClause(raw: string, path: string): SelectorClause | ParseErr {
    const eq = raw.indexOf("=");
    if (eq <= 0) {
        return { ok: false, message: `${path}: expected key=value in "${raw}"` };
    }
    const key = raw.slice(0, eq).trim();
    let value = raw.slice(eq + 1).trim();
    if (!key || !isClauseKey(key)) {
        return {
            ok: false,
            message: `${path}: unknown selector key "${key}" (expected ${CLAUSE_KEYS.join("|")})`,
        };
    }
    if (value === "") {
        return { ok: false, message: `${path}: empty value for ${key}` };
    }

    if (key === "limit") {
        if (value.startsWith("!")) {
            return { ok: false, message: `${path}: limit cannot be negated` };
        }
        const n = Number.parseInt(value, 10);
        if (!Number.isSafeInteger(n) || n < 1) {
            return { ok: false, message: `${path}: limit must be a positive integer` };
        }
        return { key: "limit", value: n };
    }

    if (key === "sort") {
        if (value.startsWith("!")) {
            return { ok: false, message: `${path}: sort cannot be negated` };
        }
        if (!isSort(value)) {
            return {
                ok: false,
                message: `${path}: sort must be ${SORT_VALUES.join("|")}`,
            };
        }
        return { key: "sort", value };
    }

    let negate = false;
    if (value.startsWith("!")) {
        negate = true;
        value = value.slice(1).trim();
        if (!value) {
            return { ok: false, message: `${path}: empty value for ${key}` };
        }
    }

    if (key === "distance") {
        const range = parseDistanceRange(value, path);
        if (!range.ok) return range;
        return { key: "distance", negate, range: range.value };
    }

    if (key === "connected") {
        const bool = parseBooleanValue(value, path, "connected");
        if (typeof bool !== "boolean") return bool;
        return { key: "connected", negate, value: bool };
    }

    if (key === "type") return { key: "type", negate, value };
    if (key === "flag") return { key: "flag", negate, value };
    if (key === "name") return { key: "name", negate, value };
    if (key === "ground") return { key: "ground", negate, value };
    if (key === "time") return { key: "time", negate, value };
    if (ITEM_CLAUSE_KEYS.has(key)) {
        return { key: key as "mainhand" | "offhand" | "helmet" | "hasitem", negate, value };
    }
    return { ok: false, message: `${path}: unhandled selector key "${key}"` };
}

function parseClauseList(
    body: string,
    path: string
): { ok: true; clauses: SelectorClause[] } | ParseErr {
    const clauses: SelectorClause[] = [];
    let sawLimit = false;
    let sawSort = false;
    let sawDistance = false;
    let sawConnected = false;
    for (const part of splitClauses(body)) {
        if (!part) {
            return { ok: false, message: `${path}: empty selector clause` };
        }
        const parsed = parseClause(part, path);
        if ("ok" in parsed && parsed.ok === false) return parsed;
        const clause = parsed as SelectorClause;
        if (clause.key === "limit") {
            if (sawLimit) {
                return { ok: false, message: `${path}: duplicate limit` };
            }
            sawLimit = true;
        }
        if (clause.key === "sort") {
            if (sawSort) {
                return { ok: false, message: `${path}: duplicate sort` };
            }
            sawSort = true;
        }
        if (clause.key === "distance") {
            if (sawDistance) {
                return { ok: false, message: `${path}: duplicate distance` };
            }
            sawDistance = true;
        }
        if (clause.key === "connected") {
            if (sawConnected) {
                return { ok: false, message: `${path}: duplicate connected` };
            }
            sawConnected = true;
        }
        clauses.push(clause);
    }
    return { ok: true, clauses };
}

/**
 * Parse a command selector token.
 * Accepts `@a`, `@a[...]`, or a bare player name (implicit `@a[name=...]`).
 */
export function parseSelector(raw: string): ParseSelectorResult {
    if (!raw) return { ok: false, message: "Missing selector" };

    if (!raw.startsWith("@")) {
        // Bare player name target.
        if (raw.includes("[") || raw.includes("]") || raw.includes("=")) {
            return {
                ok: false,
                message: `Invalid selector "${raw}": use @a/@p/@s/@e/@r or a player name`,
            };
        }
        return {
            ok: true,
            value: {
                raw,
                base: "a",
                clauses: [{ key: "name", negate: false, value: raw }],
            },
        };
    }

    const bodyStart = raw.indexOf("[");
    if (bodyStart === -1) {
        const base = raw.slice(1);
        if (!isSelectorBase(base)) {
            return {
                ok: false,
                message: `Unknown selector @${base} (expected @${BASES.join("|@")})`,
            };
        }
        if (raw.includes("]")) {
            return { ok: false, message: `Invalid selector "${raw}"` };
        }
        return { ok: true, value: { raw, base, clauses: [] } };
    }

    if (!raw.endsWith("]")) {
        return {
            ok: false,
            message: `Invalid selector "${raw}": missing closing ]`,
        };
    }

    const base = raw.slice(1, bodyStart);
    if (!isSelectorBase(base)) {
        return {
            ok: false,
            message: `Unknown selector @${base} (expected @${BASES.join("|@")})`,
        };
    }

    const inner = raw.slice(bodyStart + 1, -1);
    if (inner.includes("[") || inner.includes("]")) {
        return { ok: false, message: `Invalid selector "${raw}"` };
    }

    const parsed = parseClauseList(inner, raw);
    if (!parsed.ok) return parsed;
    return { ok: true, value: { raw, base, clauses: parsed.clauses } };
}

/**
 * Parse a YAML target filter body (`type=…,flag=…`).
 * Does not accept `@` bases — those are command-only.
 */
export function parseEntityFilter(raw: string): ParseFilterResult {
    if (!raw) return { ok: false, message: "Missing filter" };
    if (raw.startsWith("@")) {
        return {
            ok: false,
            message: `${raw}: @-selectors are command-only; use type=/flag= clauses`,
        };
    }
    if (raw.includes("[") || raw.includes("]")) {
        return {
            ok: false,
            message: `${raw}: unexpected [ ] in filter (use type=a,flag=b)`,
        };
    }
    // Must look like key=value list (at least one =).
    if (!raw.includes("=")) {
        return {
            ok: false,
            message: `${raw}: expected key=value filter`,
        };
    }
    const parsed = parseClauseList(raw, raw);
    if (!parsed.ok) return parsed;
    for (const clause of parsed.clauses) {
        if (clause.key === "limit" || clause.key === "sort") {
            return {
                ok: false,
                message: `${raw}: ${clause.key} is not valid in effect target filters`,
            };
        }
    }
    return { ok: true, value: { raw, clauses: parsed.clauses } };
}

/** True when a YAML map key should be parsed as a clause filter. */
export function isEntityFilterKey(key: string): boolean {
    return key.includes("=");
}

function fuzzyRank(value: string, query: string): number | undefined {
    if (!query) return 0;
    const v = value.toLowerCase();
    const q = query.toLowerCase();
    const bare = v.includes(":") ? v.slice(v.indexOf(":") + 1) : v;
    if (bare.startsWith(q) || v.startsWith(q)) return 3000 - bare.length;
    const bareIdx = bare.indexOf(q);
    const fullIdx = bareIdx >= 0 ? bareIdx : v.indexOf(q);
    if (fullIdx >= 0) {
        const at = bareIdx >= 0 ? bareIdx : fullIdx;
        const hay = bareIdx >= 0 ? bare : v;
        const boundary =
            at === 0 || hay[at - 1] === "_" || hay[at - 1] === ":";
        return (boundary ? 2000 : 1000) - at;
    }
    return undefined;
}

function filterFuzzy(values: readonly string[], query: string): string[] {
    const hits: { value: string; rank: number }[] = [];
    for (const value of values) {
        const rank = fuzzyRank(value, query);
        if (rank !== undefined) hits.push({ value, rank });
    }
    hits.sort((a, b) => b.rank - a.rank || a.value.localeCompare(b.value));
    return hits.map((hit) => hit.value);
}

type OpenSelector = {
    /** `@a` */
    head: string;
    /** Completed clauses as `key=value` strings (no trailing comma). */
    completed: string[];
    /** Partial text of the clause currently being typed (may be ""). */
    partialClause: string;
    /** True when token ends with `,` awaiting the next key. */
    awaitingNext: boolean;
};

function parseOpenSelector(partial: string): OpenSelector | undefined {
    if (!partial.startsWith("@")) return undefined;
    const bracket = partial.indexOf("[");
    if (bracket === -1) {
        return undefined;
    }
    if (partial.includes("]", bracket + 1)) {
        // Already closed — only suggest if they deleted and are editing; treat as done.
        return undefined;
    }
    const head = partial.slice(0, bracket);
    const base = head.slice(1);
    if (!isSelectorBase(base)) return undefined;

    const inner = partial.slice(bracket + 1);
    const awaitingNext = inner.endsWith(",");
    const parts = inner === "" ? [] : inner.split(",");
    let partialClause = "";
    const completed: string[] = [];
    if (awaitingNext) {
        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed) completed.push(trimmed);
        }
        partialClause = "";
    } else if (parts.length === 0) {
        partialClause = "";
    } else {
        for (let i = 0; i < parts.length - 1; i++) {
            const trimmed = parts[i]?.trim() ?? "";
            if (trimmed) completed.push(trimmed);
        }
        partialClause = parts[parts.length - 1] ?? "";
    }
    return { head, completed, partialClause, awaitingNext };
}

function joinSelector(head: string, clauses: readonly string[], close: boolean): string {
    const body = clauses.join(",");
    if (close) return `${head}[${body}]`;
    if (body.length === 0) return `${head}[`;
    return `${head}[${body}`;
}

function usedKeys(completed: readonly string[]): Set<string> {
    const keys = new Set<string>();
    for (const entry of completed) {
        const eq = entry.indexOf("=");
        if (eq > 0) keys.add(entry.slice(0, eq));
    }
    return keys;
}

function suggestClauseKeys(
    open: OpenSelector,
    partialKey: string
): SelectorSuggestion[] {
    const used = usedKeys(open.completed);
    const keys = CLAUSE_KEYS.filter((key) => {
        if (
            used.has(key) &&
            (key === "limit" ||
                key === "sort" ||
                key === "distance" ||
                key === "connected")
        ) {
            return false;
        }
        return true;
    });
    return filterFuzzy(keys, partialKey).map((key) => {
        const clause = `${key}=`;
        const clauses = [...open.completed, clause];
        const insert = joinSelector(open.head, clauses, false);
        return {
            insert,
            label: insert,
            hint: CLAUSE_HINTS[key as ClauseKey],
        };
    });
}

function suggestClauseValues(
    open: OpenSelector,
    key: ClauseKey,
    negate: boolean,
    partialValue: string,
    ctx: SelectorSuggestContext
): SelectorSuggestion[] {
    const prefix = negate ? "!" : "";
    const build = (value: string, close: boolean): string => {
        const clause = `${key}=${prefix}${value}`;
        return joinSelector(open.head, [...open.completed, clause], close);
    };

    if (key === "sort") {
        return filterFuzzy(SORT_VALUES, partialValue).map((value) => ({
            insert: build(value, true),
            label: build(value, true),
            hint: "sort",
        }));
    }

    if (key === "limit") {
        const defaults = ["1", "2", "3", "5", "10"];
        const values = partialValue
            ? defaults.filter((v) => v.startsWith(partialValue))
            : defaults;
        if (partialValue && /^\d+$/.test(partialValue) && !values.includes(partialValue)) {
            values.unshift(partialValue);
        }
        return values.map((value) => ({
            insert: build(value, true),
            label: build(value, true),
            hint: "limit",
        }));
    }

    if (key === "distance") {
        const defaults = ["..5", "..10", "0.2..10", "1..", "5"];
        const values = partialValue
            ? defaults.filter((v) => v.startsWith(partialValue))
            : defaults;
        if (partialValue && !values.includes(partialValue)) {
            values.unshift(partialValue);
        }
        return values.map((value) => ({
            insert: build(value, true),
            label: build(value, true),
            hint: "distance",
        }));
    }

    if (key === "connected") {
        const defaults = ["true", "false"];
        const values = partialValue
            ? defaults.filter((v) => v.startsWith(partialValue.toLowerCase()))
            : defaults;
        return values.map((value) => ({
            insert: build(value, true),
            label: build(value, true),
            hint: "connected",
        }));
    }

    let pool: readonly string[] = [];
    let hint = CLAUSE_HINTS[key];
    if (key === "flag") {
        pool = ctx.flagNames ?? [];
        hint = "flag";
    } else if (key === "type") {
        pool = ctx.entityTypeIds ?? [];
        hint = "type";
    } else if (key === "name") {
        pool = ctx.playerNames ?? [];
        hint = "name";
    } else if (ITEM_CLAUSE_KEYS.has(key)) {
        pool = ctx.itemIds ?? [];
        hint = key;
    } else if (key === "ground") {
        pool = ctx.groundTypeIds ?? [];
        hint = "ground";
    } else if (key === "time") {
        pool = ctx.timeNames ?? ["morning", "day", "evening", "night"];
        hint = "time";
    }

    const matches = filterFuzzy(pool, partialValue).slice(0, 40);
    if (matches.length === 0) {
        if (partialValue) {
            const closed = build(partialValue, true);
            const more = `${build(partialValue, false)},`;
            return [
                { insert: closed, label: closed, hint },
                { insert: more, label: more, hint: "add clause" },
            ];
        }
        return [
            {
                insert: joinSelector(
                    open.head,
                    [...open.completed, `${key}=${prefix}`],
                    false
                ),
                label: `${key}=`,
                hint,
            },
        ];
    }

    const out: SelectorSuggestion[] = [];
    for (const value of matches) {
        const closed = build(value, true);
        out.push({ insert: closed, label: closed, hint });
    }
    // Offer continuing with another clause for the top match.
    const top = matches[0];
    if (top) {
        const more = `${build(top, false)},`;
        out.push({ insert: more, label: more, hint: "add clause" });
    }
    return out;
}

/**
 * Autocomplete for a selector argument. Suggestions always insert the full token.
 */
export function suggestSelector(
    partial: string,
    ctx: SelectorSuggestContext = {}
): SelectorSuggestion[] {
    // Player name targets (no @).
    if (partial && !partial.startsWith("@")) {
        const names = filterFuzzy(ctx.playerNames ?? [], partial).slice(0, 20);
        const nameHits = names.map((name) => ({
            insert: name,
            label: name,
            hint: "player",
        }));
        // Also nudge toward @ selectors when partial is a prefix of one.
        const atHits = filterFuzzy(
            BASES.map((b) => `@${b}`),
            partial.startsWith("@") ? partial : `@${partial}`
        ).map((value) => {
            const base = value.slice(1) as SelectorBase;
            return {
                insert: value,
                label: value,
                hint: BASE_HINTS[base],
            };
        });
        return [...atHits, ...nameHits];
    }

    const open = parseOpenSelector(partial);
    if (open) {
        const clause = open.partialClause.trim();
        if (!clause || open.awaitingNext) {
            return suggestClauseKeys(open, open.awaitingNext ? "" : clause);
        }
        const eq = clause.indexOf("=");
        if (eq === -1) {
            return suggestClauseKeys(open, clause);
        }
        const keyRaw = clause.slice(0, eq).trim();
        let valueRaw = clause.slice(eq + 1);
        if (!isClauseKey(keyRaw)) {
            return suggestClauseKeys(open, keyRaw);
        }
        let negate = false;
        if (valueRaw.startsWith("!")) {
            negate = true;
            valueRaw = valueRaw.slice(1);
        }
        return suggestClauseValues(open, keyRaw, negate, valueRaw, ctx);
    }

    // Base selector: "", "@", "@a", "@a…"
    const query = partial.startsWith("@") ? partial.slice(1) : partial;
    const bases = filterFuzzy(
        BASES.map((b) => b),
        query
    );
    const out: SelectorSuggestion[] = [];
    for (const base of bases) {
        const b = base as SelectorBase;
        out.push({
            insert: `@${b}`,
            label: `@${b}`,
            hint: BASE_HINTS[b],
        });
        out.push({
            insert: `@${b}[`,
            label: `@${b}[…]`,
            hint: `${BASE_HINTS[b]} + filter`,
        });
    }
    if (out.length === 0) {
        return BASES.map((b) => ({
            insert: `@${b}`,
            label: `@${b}`,
            hint: BASE_HINTS[b],
        }));
    }
    return out;
}

export function selectorLimit(selector: EntitySelector): number | undefined {
    for (const clause of selector.clauses) {
        if (clause.key === "limit") return clause.value;
    }
    return undefined;
}

export function selectorSort(selector: EntitySelector): SelectorSort {
    for (const clause of selector.clauses) {
        if (clause.key === "sort") return clause.value;
    }
    // Minecraft defaults: @p/@r imply order; we use nearest for @p, arbitrary else.
    if (selector.base === "p") return "nearest";
    if (selector.base === "r") return "random";
    return "arbitrary";
}
