import { file, serve } from "bun";
import path from "node:path";
import fs from "node:fs";

const PUBLIC_DIR = path.join(import.meta.dir, "public");
const VISUAL_DEFS_DIR = path.join(
    import.meta.dir,
    "packs/bundu/assets/bundu/visuals"
);
const TEXTURE_DIR = path.join(
    import.meta.dir,
    "packs/bundu/assets/bundu/textures"
);
const ASSET_ROOTS: Readonly<Record<string, string>> = {
    bundu: TEXTURE_DIR,
};
const PORT = Number(process.env.PORT ?? 3000);
/** Dev-only visual-definition hot reload. Never enabled in CI/prod images. */
const DEV_CONFIG_RELOAD = process.env.BUNDU_DEBUG === "1";

type SseClient = {
    write: (chunk: string) => void;
};

const sseClients = new Set<SseClient>();

function notifyConfigReload() {
    let live = 0;
    for (const client of [...sseClients]) {
        try {
            client.write("data: reload\n\n");
            live++;
        } catch {
            sseClients.delete(client);
        }
    }
    console.log(
        `[static] notified ${live} client(s) (tracked ${sseClients.size})`
    );
}

function configReloadSse(): Response {
    let client: SseClient | undefined;
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            client = {
                write: (chunk) => controller.enqueue(encoder.encode(chunk)),
            };
            sseClients.add(client);
            client.write(": connected\n\n");
        },
        cancel() {
            if (client) {
                sseClients.delete(client);
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}

function visualDefsJson(): Response {
    const defs = Object.fromEntries(readVisualDefs(VISUAL_DEFS_DIR));
    return Response.json(defs, {
        headers: { "Cache-Control": "no-store" },
    });
}

function readVisualDefs(directory: string): [string, unknown][] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filepath = path.join(directory, entry.name);
        if (entry.isDirectory()) return readVisualDefs(filepath);
        if (!/\.ya?ml$/i.test(entry.name)) return [];

        const relative = path
            .relative(VISUAL_DEFS_DIR, filepath)
            .replace(/\\/g, "/");
        const key = relative.slice(0, -path.extname(relative).length);
        return [[key, Bun.YAML.parse(fs.readFileSync(filepath, "utf8"))]];
    });
}

if (DEV_CONFIG_RELOAD) {
    let debounce: Timer | undefined;
    const watchYaml = (directory: string) =>
        fs.watch(directory, { recursive: true }, (_event, filename) => {
        if (!filename || !/\.ya?ml$/i.test(filename)) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            console.log(`[static] configs changed (${filename}) — hot-reload`);
            notifyConfigReload();
        }, 100);
        });
    watchYaml(VISUAL_DEFS_DIR);

    // Keep SSE connections alive past Bun's default idle timeout.
    setInterval(() => {
        for (const client of [...sseClients]) {
            try {
                client.write(": ping\n\n");
            } catch {
                sseClients.delete(client);
            }
        }
    }, 15_000);
}

serve({
    port: PORT,
    // SSE stays open; default idleTimeout (10s) drops the hot-reload channel.
    ...(DEV_CONFIG_RELOAD ? { idleTimeout: 0 } : {}),
    async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/") {
            return Response.redirect(new URL("/site/", url), 302);
        }

        if (DEV_CONFIG_RELOAD) {
            if (url.pathname === "/__dev/config-reload") {
                return configReloadSse();
            }
            if (url.pathname === "/__dev/visual-defs") {
                try {
                    return visualDefsJson();
                } catch (err) {
                    console.error("[static] failed to load visual defs", err);
                    return new Response("Definition error", { status: 500 });
                }
            }
        }

        const pathname = url.pathname.endsWith("/")
            ? `${url.pathname}index.html`
            : url.pathname;
        const assetPath = pathname.startsWith("/assets/")
            ? pathname.slice("/assets/".length)
            : undefined;
        const [namespace, ...assetParts] = assetPath?.split("/") ?? [];
        const root = namespace ? ASSET_ROOTS[namespace] : PUBLIC_DIR;
        if (!root) return new Response("Not Found", { status: 404 });
        const relative = assetPath ? assetParts.join("/") : pathname;
        const filepath = path.join(root, relative);

        // Security: prevent directory traversal
        if (filepath !== root && !filepath.startsWith(`${root}${path.sep}`)) {
            return new Response("Forbidden", { status: 403 });
        }

        try {
            const stat = fs.statSync(filepath);
            if (stat.isFile()) return new Response(file(filepath));
            return new Response("Not Found", { status: 404 });
        } catch {
            return new Response("Not Found", { status: 404 });
        }
    },
});

console.log(`Client running at http://localhost:${PORT}/site/`);
if (DEV_CONFIG_RELOAD) {
    console.log("[static] visual definition hot-reload enabled");
}
