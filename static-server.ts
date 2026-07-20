import { file, serve } from "bun";
import path from "node:path";
import fs from "node:fs";

const PUBLIC_DIR = path.join(import.meta.dir, "public");
const PACKS_ROOT = path.join(import.meta.dir, "packs");
const PORT = Number(process.env.PORT ?? 3000);
/** Dev-only model-definition hot reload + browser live-reload. Never in CI/prod. */
const DEV_CONFIG_RELOAD = process.env.BUNDU_DEBUG === "1";

const LIVE_RELOAD_SCRIPT = `<script>(function(){var e=new EventSource("/__dev/live-reload");e.onmessage=function(){location.reload()};})();</script>`;

type PackNamespaceRoots = {
    /** Texture roots by namespace; later packs override earlier ones. */
    textureRoots: ReadonlyMap<string, string[]>;
    modelDirs: readonly string[];
    /** Client gameplay.yml paths; later packs override earlier ones. */
    gameplayFiles: readonly string[];
    /** Client stat_bars.yml paths; later packs override earlier ones. */
    statBarsFiles: readonly string[];
};

function discoverPackAssetRoots(packsRoot: string): PackNamespaceRoots {
    const textureRoots = new Map<string, string[]>();
    const modelDirs: string[] = [];
    const gameplayFiles: string[] = [];
    const statBarsFiles: string[] = [];
    if (!fs.existsSync(packsRoot)) {
        return { textureRoots, modelDirs, gameplayFiles, statBarsFiles };
    }

    const packDirs = fs
        .readdirSync(packsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));

    for (const packName of packDirs) {
        const assetsRoot = path.join(packsRoot, packName, "assets");
        if (!fs.existsSync(assetsRoot)) continue;
        const namespaces = fs
            .readdirSync(assetsRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort((left, right) => left.localeCompare(right));
        for (const namespace of namespaces) {
            const textures = path.join(assetsRoot, namespace, "textures");
            const models = path.join(assetsRoot, namespace, "models");
            const gameplay = path.join(assetsRoot, namespace, "gameplay.yml");
            const statBars = path.join(assetsRoot, namespace, "stat_bars.yml");
            if (fs.existsSync(textures)) {
                const roots = textureRoots.get(namespace) ?? [];
                roots.push(textures);
                textureRoots.set(namespace, roots);
            }
            if (fs.existsSync(models)) modelDirs.push(models);
            if (fs.existsSync(gameplay)) gameplayFiles.push(gameplay);
            if (fs.existsSync(statBars)) statBarsFiles.push(statBars);
        }
    }
    return { textureRoots, modelDirs, gameplayFiles, statBarsFiles };
}

const { textureRoots, modelDirs, gameplayFiles, statBarsFiles } =
    discoverPackAssetRoots(PACKS_ROOT);

type SseClient = {
    write: (chunk: string) => void;
};

const configClients = new Set<SseClient>();
const liveReloadClients = new Set<SseClient>();

function notifySse(clients: Set<SseClient>, data: string, label: string) {
    let live = 0;
    for (const client of [...clients]) {
        try {
            client.write(`data: ${data}\n\n`);
            live++;
        } catch {
            clients.delete(client);
        }
    }
    console.log(
        `[static] ${label}: notified ${live} client(s) (tracked ${clients.size})`
    );
}

function sseStream(clients: Set<SseClient>): Response {
    let client: SseClient | undefined;
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            client = {
                write: (chunk) => controller.enqueue(encoder.encode(chunk)),
            };
            clients.add(client);
            client.write(": connected\n\n");
        },
        cancel() {
            if (client) clients.delete(client);
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

function readModelDefs(directory: string, root = directory): [string, unknown][] {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name))
        .flatMap((entry) => {
            const filepath = path.join(directory, entry.name);
            if (entry.isDirectory()) return readModelDefs(filepath, root);
            if (!/\.ya?ml$/i.test(entry.name)) return [];

            const relative = path.relative(root, filepath).replace(/\\/g, "/");
            const key = relative.slice(0, -path.extname(relative).length);
            return [[key, Bun.YAML.parse(fs.readFileSync(filepath, "utf8"))]];
        });
}

async function modelDefsJson(): Promise<Response> {
    // Dynamic import keeps the slim frontend image free of @bundu/shared
    // (this path only runs when BUNDU_DEBUG=1).
    const { rewritePackTextureRefs } = await import(
        "@bundu/shared/models/texture_paths"
    );
    const defs: Record<string, unknown> = {};
    for (const directory of modelDirs) {
        Object.assign(defs, Object.fromEntries(readModelDefs(directory)));
    }
    // Match game-server sanitization: authored .svg texture keys become .png.
    return Response.json(rewritePackTextureRefs(defs), {
        headers: { "Cache-Control": "no-store" },
    });
}

/** Later pack files override earlier ones (same as resource pack merge). */
function clientGameplayJson(): Response {
    if (gameplayFiles.length === 0) {
        return new Response("Missing client gameplay.yml", { status: 404 });
    }
    const filepath = gameplayFiles[gameplayFiles.length - 1];
    if (!filepath) {
        return new Response("Missing client gameplay.yml", { status: 404 });
    }
    return Response.json(Bun.YAML.parse(fs.readFileSync(filepath, "utf8")), {
        headers: { "Cache-Control": "no-store" },
    });
}

function clientStatBarsJson(): Response {
    if (statBarsFiles.length === 0) {
        return new Response("Missing client stat_bars.yml", { status: 404 });
    }
    const filepath = statBarsFiles[statBarsFiles.length - 1];
    if (!filepath) {
        return new Response("Missing client stat_bars.yml", { status: 404 });
    }
    return Response.json(Bun.YAML.parse(fs.readFileSync(filepath, "utf8")), {
        headers: { "Cache-Control": "no-store" },
    });
}

function resolveTexture(namespace: string, relative: string): string | undefined {
    const roots = textureRoots.get(namespace);
    if (!roots) return undefined;
    // Later packs override earlier ones.
    for (let index = roots.length - 1; index >= 0; index--) {
        const root = roots[index];
        if (!root) continue;
        const filepath = path.join(root, relative);
        if (filepath !== root && !filepath.startsWith(`${root}${path.sep}`)) {
            continue;
        }
        try {
            if (fs.statSync(filepath).isFile()) return filepath;
        } catch {
            // try earlier pack
        }
    }
    return undefined;
}

function staticHeaders(): HeadersInit {
    return DEV_CONFIG_RELOAD ? { "Cache-Control": "no-store" } : {};
}

async function serveHtml(filepath: string): Promise<Response> {
    const html = await Bun.file(filepath).text();
    const body = DEV_CONFIG_RELOAD
        ? html.includes("</head>")
            ? html.replace("</head>", `${LIVE_RELOAD_SCRIPT}</head>`)
            : `${html}${LIVE_RELOAD_SCRIPT}`
        : html;
    return new Response(body, {
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...staticHeaders(),
        },
    });
}

if (DEV_CONFIG_RELOAD) {
    let configDebounce: Timer | undefined;
    const watchYaml = (directory: string) =>
        fs.watch(directory, { recursive: true }, (_event, filename) => {
            if (!filename || !/\.ya?ml$/i.test(filename)) return;
            clearTimeout(configDebounce);
            configDebounce = setTimeout(() => {
                console.log(`[static] configs changed (${filename}) — hot-reload`);
                notifySse(configClients, "reload", "config-reload");
            }, 100);
        });
    for (const directory of modelDirs) watchYaml(directory);
    for (const filepath of gameplayFiles) {
        watchYaml(path.dirname(filepath));
    }
    for (const filepath of statBarsFiles) {
        watchYaml(path.dirname(filepath));
    }

    // Build stamp from build.ts — survives atomic site/ directory swaps.
    let liveDebounce: Timer | undefined;
    fs.watch(PUBLIC_DIR, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const normalized = filename.toString().replaceAll("\\", "/");
        if (normalized !== "site/.dev-reload" && !normalized.endsWith("/site/.dev-reload")) {
            return;
        }
        clearTimeout(liveDebounce);
        liveDebounce = setTimeout(() => {
            console.log("[static] client build ready — live-reload");
            notifySse(liveReloadClients, "reload", "live-reload");
        }, 50);
    });

    // Keep SSE connections alive past Bun's default idle timeout.
    setInterval(() => {
        for (const clients of [configClients, liveReloadClients]) {
            for (const client of [...clients]) {
                try {
                    client.write(": ping\n\n");
                } catch {
                    clients.delete(client);
                }
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
                return sseStream(configClients);
            }
            if (url.pathname === "/__dev/live-reload") {
                return sseStream(liveReloadClients);
            }
            if (url.pathname === "/__dev/model-defs") {
                try {
                    return modelDefsJson();
                } catch (err) {
                    console.error("[static] failed to load model defs", err);
                    return new Response("Definition error", { status: 500 });
                }
            }
            if (url.pathname === "/__dev/client-gameplay") {
                try {
                    return clientGameplayJson();
                } catch (err) {
                    console.error("[static] failed to load client gameplay", err);
                    return new Response("Gameplay error", { status: 500 });
                }
            }
            if (url.pathname === "/__dev/client-stat-bars") {
                try {
                    return clientStatBarsJson();
                } catch (err) {
                    console.error("[static] failed to load client stat bars", err);
                    return new Response("Stat bars error", { status: 500 });
                }
            }
        }

        const pathname = url.pathname.endsWith("/")
            ? `${url.pathname}index.html`
            : url.pathname;

        if (pathname.startsWith("/assets/")) {
            const assetPath = pathname.slice("/assets/".length);
            const slash = assetPath.indexOf("/");
            if (slash <= 0) return new Response("Not Found", { status: 404 });
            const namespace = assetPath.slice(0, slash);
            const relative = assetPath.slice(slash + 1);
            const filepath = resolveTexture(namespace, relative);
            if (!filepath) return new Response("Not Found", { status: 404 });
            return new Response(file(filepath), {
                headers: staticHeaders(),
            });
        }

        const filepath = path.join(PUBLIC_DIR, pathname);
        if (filepath !== PUBLIC_DIR && !filepath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
            return new Response("Forbidden", { status: 403 });
        }

        try {
            const stat = fs.statSync(filepath);
            if (!stat.isFile()) return new Response("Not Found", { status: 404 });
            if (path.extname(filepath).toLowerCase() === ".html") {
                return serveHtml(filepath);
            }
            return new Response(file(filepath), {
                headers: staticHeaders(),
            });
        } catch {
            return new Response("Not Found", { status: 404 });
        }
    },
});

console.log(`Client running at http://localhost:${PORT}/site/`);
if (DEV_CONFIG_RELOAD) {
    console.log(
        `[static] model definition hot-reload enabled (${modelDirs.length} pack namespace(s))`
    );
    console.log("[static] client live-reload enabled");
}
