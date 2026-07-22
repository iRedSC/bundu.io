import {
    DEFAULT_WORLD_TILES,
    isValidWorldTiles,
    MAX_WORLD_TILES,
    MIN_WORLD_TILES,
    WORLD_TILES,
} from "@bundu/shared/tiles";

const UI_FONT = "'Aoboshi One', serif";

type NewMapResult = { worldTiles: number } | null;

/** Confirm new blank map + choose square world size in tiles. */
export function promptNewMap(): Promise<NewMapResult> {
    return new Promise((resolve) => {
        const overlay = createOverlay();
        const panel = el("div");
        Object.assign(panel.style, {
            width: "min(360px, calc(100vw - 32px))",
            background: "#1a2218",
            border: "1px solid #4a5a40",
            borderRadius: "6px",
            padding: "16px 18px",
            color: "#ffffff",
            fontFamily: UI_FONT,
            boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        } as const);

        const title = el("div");
        title.textContent = "New map";
        Object.assign(title.style, {
            fontSize: "18px",
            marginBottom: "8px",
        } as const);

        const body = el("div");
        body.textContent =
            "Clear the entire map? This removes all ground overlays, decorations, resources, structures, animals, and items, then restores an ocean base. It cannot be undone.";
        Object.assign(body.style, {
            fontSize: "13px",
            lineHeight: "1.35",
            opacity: "0.9",
            marginBottom: "14px",
        } as const);

        const label = el("label");
        label.textContent = `World size (tiles, ${MIN_WORLD_TILES}–${MAX_WORLD_TILES})`;
        Object.assign(label.style, {
            display: "block",
            fontSize: "12px",
            marginBottom: "6px",
            opacity: "0.85",
        } as const);

        const input = document.createElement("input");
        input.type = "number";
        input.min = String(MIN_WORLD_TILES);
        input.max = String(MAX_WORLD_TILES);
        input.step = "1";
        input.value = String(WORLD_TILES || DEFAULT_WORLD_TILES);
        Object.assign(input.style, {
            width: "100%",
            boxSizing: "border-box",
            border: "1px solid #4a5a40",
            borderRadius: "4px",
            background: "#10160f",
            color: "#ffffff",
            fontFamily: UI_FONT,
            fontSize: "14px",
            padding: "6px 8px",
            outline: "none",
            marginBottom: "14px",
        } as const);

        const error = el("div");
        Object.assign(error.style, {
            color: "#f0a0a0",
            fontSize: "12px",
            minHeight: "16px",
            marginBottom: "10px",
        } as const);

        const row = el("div");
        Object.assign(row.style, {
            display: "flex",
            gap: "8px",
            justifyContent: "flex-end",
        } as const);

        const cancel = button("Cancel");
        const confirm = button("Create", true);

        const close = (result: NewMapResult) => {
            overlay.remove();
            window.removeEventListener("keydown", onKey);
            resolve(result);
        };

        const submit = () => {
            const worldTiles = Number(input.value);
            if (!isValidWorldTiles(worldTiles)) {
                error.textContent = `Enter an integer from ${MIN_WORLD_TILES} to ${MAX_WORLD_TILES}.`;
                input.focus();
                return;
            }
            close({ worldTiles });
        };

        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                close(null);
            } else if (event.key === "Enter") {
                event.preventDefault();
                submit();
            }
        };

        cancel.addEventListener("click", () => close(null));
        confirm.addEventListener("click", submit);
        overlay.addEventListener("pointerdown", (event) => {
            if (event.target === overlay) close(null);
        });
        window.addEventListener("keydown", onKey);

        row.append(cancel, confirm);
        panel.append(title, body, label, input, error, row);
        overlay.append(panel);
        document.body.append(overlay);
        input.focus();
        input.select();
    });
}

/** Confirm import that will clear the live map, then open a YAML file picker. */
export async function promptImportMap(): Promise<string | null> {
    const ok = window.confirm(
        "Import a map from file?\n\nThis clears the current map and replaces it with the file contents. It cannot be undone."
    );
    if (!ok) return null;

    const file = await pickYamlFile();
    if (!file) return null;
    return file.text();
}

function pickYamlFile(): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".yml,.yaml,text/yaml,text/plain";
        input.style.display = "none";
        const cleanup = () => {
            input.remove();
        };
        input.addEventListener("change", () => {
            const file = input.files?.[0] ?? null;
            cleanup();
            resolve(file);
        });
        // Cancel is not reliably reported; treat focus-return without a file as cancel.
        window.addEventListener(
            "focus",
            () => {
                window.setTimeout(() => {
                    if (!input.isConnected) return;
                    cleanup();
                    resolve(null);
                }, 400);
            },
            { once: true }
        );
        document.body.append(input);
        input.click();
    });
}

function createOverlay(): HTMLDivElement {
    const overlay = el("div");
    Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        zIndex: "1000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        pointerEvents: "auto",
    } as const);
    overlay.addEventListener("pointerdown", (event) => event.stopPropagation());
    return overlay;
}

function button(label: string, primary = false): HTMLButtonElement {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    Object.assign(node.style, {
        border: primary ? "1px solid #7a9a60" : "1px solid #4a5a40",
        borderRadius: "4px",
        background: primary ? "#3a5a30" : "#243022",
        color: "#ffffff",
        fontFamily: UI_FONT,
        fontSize: "13px",
        padding: "6px 12px",
        cursor: "pointer",
    } as const);
    return node;
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K
): HTMLElementTagNameMap[K] {
    return document.createElement(tag);
}
