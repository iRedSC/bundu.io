import { file, serve } from "bun";
import path from "node:path";
import fs from "node:fs";

const PUBLIC_DIR = path.join(import.meta.dir, "public");
const PACKS_ROOT = path.join(import.meta.dir, "packs");
const PORT = Number(process.env.PORT ?? 3000);
/** Dev-only visual-definition hot reload. Never enabled in CI/prod images. */
const DEV_CONFIG_RELOAD = process.env.BUNDU_DEBUG === "1";

type PackNamespaceRoots = {
    /** Texture roots by namespace; later packs override earlier ones. */
    textureRoots: ReadonlyMap<string, string[]>;
    visualDirs: readonly string[];
};

function discoverPackAssetRoots(packsRoot: string): PackNamespaceRoots {
    const textureRoots = new Map<string, string[]>();
    const visualDirs: string[] = [];
    if (!fs.existsSync(packsRoot)) {
        return { textureRoots, visualDirs };
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
            const visuals = path.join(assetsRoot, namespace, "visuals");
            if (fs.existsSync(textures)) {
                const roots = textureRoots.get(namespace) ?? [];
                roots.push(textures);
                textureRoots.set(namespace, roots);
            }
            if (fs.existsSync(visuals)) visualDirs.push(visuals);
        }
    }
    return { textureRoots, visualDirs };
}

const { textureRoots, visualDirs } = discoverPackAssetRoots(PACKS_ROOT);

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

function readVisualDefs(directory: string, root = directory): [string, unknown][] {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name))
        .flatMap((entry) => {
            const filepath = path.join(directory, entry.name);
            if (entry.isDirectory()) return readVisualDefs(filepath, root);
            if (!/\.ya?ml$/i.test(entry.name)) return [];

            const relative = path.relative(root, filepath).replace(/\\/g, "/");
            const key = relative.slice(0, -path.extname(relative).length);
            return [[key, Bun.YAML.parse(fs.readFileSync(filepath, "utf8"))]];
        });
}

function visualDefsJson(): Response {
    const defs: Record<string, unknown> = {};
    for (const directory of visualDirs) {
        Object.assign(defs, Object.fromEntries(readVisualDefs(directory)));
    }
    return Response.json(defs, {
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
    for (const directory of visualDirs) watchYaml(directory);

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

        if (pathname.startsWith("/assets/")) {
            const assetPath = pathname.slice("/assets/".length);
            const slash = assetPath.indexOf("/");
            if (slash <= 0) return new Response("Not Found", { status: 404 });
            const namespace = assetPath.slice(0, slash);
            const relative = assetPath.slice(slash + 1);
            const filepath = resolveTexture(namespace, relative);
            if (!filepath) return new Response("Not Found", { status: 404 });
            return new Response(file(filepath));
        }

        const filepath = path.join(PUBLIC_DIR, pathname);
        if (filepath !== PUBLIC_DIR && !filepath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
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
    console.log(
        `[static] visual definition hot-reload enabled (${visualDirs.length} pack namespace(s))`
    );
}
