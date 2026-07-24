import { file, serve } from "bun";
import path from "node:path";
import fs from "node:fs";

const PUBLIC_DIR = path.join(import.meta.dir, "public");
const DOCS_DIR = path.join(PUBLIC_DIR, "docs");
const PACKS_ROOT = path.join(import.meta.dir, "packs");
const PORT = Number(process.env.PORT ?? 3000);
/** Dev-only model-definition hot reload + browser live-reload. Never in CI/prod. */
const DEV_CONFIG_RELOAD = process.env.BUNDU_DEBUG === "1";
/** Hostnames that serve VitePress from public/docs as site root (comma-separated). */
const DOCS_HOSTS = new Set(
    (process.env.DOCS_HOST ?? "wiki.bundu.io")
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
);
/** Public origin used when redirecting /docs on the game host. */
const DOCS_PUBLIC_ORIGIN = process.env.DOCS_PUBLIC_ORIGIN ?? "https://wiki.bundu.io";

const LIVE_RELOAD_SCRIPT = `<script>(function(){var e=new EventSource("/__dev/live-reload");e.onmessage=function(){location.reload()};})();</script>`;

type LangFile = { namespace: string; locale: string; filepath: string };

type PackNamespaceRoots = {
    /** Texture roots by namespace; later packs override earlier ones. */
    textureRoots: ReadonlyMap<string, string[]>;
    modelDirs: readonly string[];
    /** Client gameplay.yml paths; later packs override earlier ones. */
    gameplayFiles: readonly string[];
    /** Client stat_bars.yml paths; later packs override earlier ones. */
    statBarsFiles: readonly string[];
    /** Client lang YAML files in pack/namespace order. */
    langFiles: readonly LangFile[];
};

function discoverPackAssetRoots(packsRoot: string): PackNamespaceRoots {
    const textureRoots = new Map<string, string[]>();
    const modelDirs: string[] = [];
    const gameplayFiles: string[] = [];
    const statBarsFiles: string[] = [];
    const langFiles: LangFile[] = [];
    if (!fs.existsSync(packsRoot)) {
        return {
            textureRoots,
            modelDirs,
            gameplayFiles,
            statBarsFiles,
            langFiles,
        };
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
            const langRoot = path.join(assetsRoot, namespace, "lang");
            if (fs.existsSync(textures)) {
                const roots = textureRoots.get(namespace) ?? [];
                roots.push(textures);
                textureRoots.set(namespace, roots);
            }
            if (fs.existsSync(models)) modelDirs.push(models);
            if (fs.existsSync(gameplay)) gameplayFiles.push(gameplay);
            if (fs.existsSync(statBars)) statBarsFiles.push(statBars);
            if (fs.existsSync(langRoot)) {
                for (const name of fs
                    .readdirSync(langRoot)
                    .filter((file) => /\.ya?ml$/i.test(file))
                    .sort((left, right) => left.localeCompare(right))) {
                    langFiles.push({
                        namespace,
                        locale: name.replace(/\.ya?ml$/i, "").toLowerCase(),
                        filepath: path.join(langRoot, name),
                    });
                }
            }
        }
    }
    return {
        textureRoots,
        modelDirs,
        gameplayFiles,
        statBarsFiles,
        langFiles,
    };
}

const { textureRoots, modelDirs, gameplayFiles, statBarsFiles, langFiles } =
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

async function clientLangJson(): Promise<Response> {
    if (langFiles.length === 0) {
        return new Response("Missing client lang yml", { status: 404 });
    }
    const { flattenLangDocument, LANG_PAYLOAD_FORMAT, mergeLangStrings } =
        await import("./packages/shared/src/lang");
    const byLocale = new Map<string, Record<string, string>>();
    for (const file of langFiles) {
        const flattened = flattenLangDocument(
            Bun.YAML.parse(fs.readFileSync(file.filepath, "utf8")),
            file.namespace,
            file.filepath
        );
        byLocale.set(
            file.locale,
            mergeLangStrings(byLocale.get(file.locale) ?? {}, flattened)
        );
    }
    const locale = byLocale.has("en")
        ? "en"
        : [...byLocale.keys()].sort((a, b) => a.localeCompare(b))[0];
    if (!locale) {
        return new Response("Missing client lang yml", { status: 404 });
    }
    return Response.json(
        {
            format: LANG_PAYLOAD_FORMAT,
            locale,
            strings: byLocale.get(locale) ?? {},
        },
        { headers: { "Cache-Control": "no-store" } }
    );
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

function requestHost(req: Request): string {
    const forwarded = req.headers.get("x-forwarded-host");
    const raw = forwarded?.split(",")[0]?.trim() || req.headers.get("host") || "";
    return raw.split(":")[0]?.toLowerCase() ?? "";
}

function isDocsHost(host: string): boolean {
    return DOCS_HOSTS.has(host);
}

function healthResponse(): Response {
    return Response.json(
        { status: "ok" },
        { headers: { "Cache-Control": "no-store" } }
    );
}

function readinessResponse(): Response {
    const siteReady = fs.existsSync(path.join(PUBLIC_DIR, "site", "index.html"));
    const docsReady = fs.existsSync(path.join(DOCS_DIR, "index.html"));
    return Response.json(
        {
            status: siteReady && docsReady ? "ready" : "not_ready",
            checks: { site: siteReady, docs: docsReady },
        },
        {
            status: siteReady && docsReady ? 200 : 503,
            headers: { "Cache-Control": "no-store" },
        }
    );
}

/** Resolve a URL path under rootDir. Supports VitePress cleanUrls. */
function resolvePublicFile(
    pathname: string,
    rootDir: string
): string | null | "forbidden" {
    const candidates: string[] = [];
    if (pathname.endsWith("/")) {
        candidates.push(`${pathname}index.html`);
    } else {
        candidates.push(pathname);
        if (path.extname(pathname) === "") {
            candidates.push(`${pathname}.html`, `${pathname}/index.html`);
        }
    }

    for (const candidate of candidates) {
        const filepath = path.join(rootDir, candidate);
        if (filepath !== rootDir && !filepath.startsWith(`${rootDir}${path.sep}`)) {
            return "forbidden";
        }
        try {
            if (fs.statSync(filepath).isFile()) return filepath;
        } catch {
            // try next candidate
        }
    }
    return null;
}

function responseForPublicFile(
    filepath: string | null | "forbidden"
): Response | Promise<Response> {
    if (filepath === "forbidden") {
        return new Response("Forbidden", { status: 403 });
    }
    if (!filepath) {
        return new Response("Not Found", { status: 404 });
    }
    if (path.extname(filepath).toLowerCase() === ".html") {
        return serveHtml(filepath);
    }
    return new Response(file(filepath), {
        headers: staticHeaders(),
    });
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
    for (const file of langFiles) {
        watchYaml(path.dirname(file.filepath));
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
        const host = requestHost(req);

        if (url.pathname === "/healthz") return healthResponse();
        if (url.pathname === "/readyz") return readinessResponse();

        // wiki.bundu.io (etc.): public/docs as site root, including /assets.
        if (isDocsHost(host)) {
            return responseForPublicFile(resolvePublicFile(url.pathname, DOCS_DIR));
        }

        // Game host: send /docs traffic to the wiki origin (links use root paths).
        if (url.pathname === "/docs" || url.pathname.startsWith("/docs/")) {
            const suffix =
                url.pathname === "/docs" || url.pathname === "/docs/"
                    ? "/"
                    : url.pathname.slice("/docs".length);
            return Response.redirect(new URL(`${suffix}${url.search}`, DOCS_PUBLIC_ORIGIN), 302);
        }

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
            if (url.pathname === "/__dev/client-lang") {
                try {
                    return await clientLangJson();
                } catch (err) {
                    console.error("[static] failed to load client lang", err);
                    return new Response("Lang error", { status: 500 });
                }
            }
        }

        if (url.pathname.startsWith("/assets/")) {
            const assetPath = url.pathname.slice("/assets/".length);
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

        return responseForPublicFile(resolvePublicFile(url.pathname, PUBLIC_DIR));
    },
});

console.log(`Client running at http://localhost:${PORT}/site/`);
console.log(
    `Docs hosts ${[...DOCS_HOSTS].join(", ") || "(none)"} → ${DOCS_DIR} (public ${DOCS_PUBLIC_ORIGIN})`
);
if (DEV_CONFIG_RELOAD) {
    console.log(
        `[static] model definition hot-reload enabled (${modelDirs.length} pack namespace(s))`
    );
    console.log("[static] client live-reload enabled");
}
