import { spawn, type Subprocess } from "bun";
import { watch } from "node:fs";

let building = false;
let rebuildQueued = false;
let serverProc: Subprocess | undefined;
let staticProc: Subprocess | undefined;
let shuttingDown = false;
/** True while we intentionally killed the server to reload code. */
let serverReload = false;

async function buildClient(): Promise<boolean> {
    const proc = spawn({
        cmd: ["bun", "run", "./build.ts"],
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env, BUNDU_DEBUG: "1" },
    });
    return (await proc.exited) === 0;
}

async function rebuildClient(): Promise<void> {
    if (building) {
        rebuildQueued = true;
        return;
    }
    building = true;
    console.log("\n[dev] rebuilding client…");
    const ok = await buildClient();
    if (ok) console.log("[dev] client ready — refresh the browser");
    building = false;
    if (rebuildQueued) {
        rebuildQueued = false;
        await rebuildClient();
    }
}

function isClientConfigYaml(
    watchRoot: string,
    filename: string | null
): boolean {
    if (!filename || !/\.ya?ml$/i.test(filename)) return false;
    if (watchRoot !== "packages/client") return false;
    return filename.replace(/\\/g, "/").startsWith("src/configs/");
}

function startServer(): Subprocess {
    console.log("[dev] starting game server…");
    return spawn({
        cmd: ["bun", "run", "packages/server/src/index.ts"],
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env, BUNDU_DEBUG: "1" },
    });
}

function requestServerReload(): void {
    if (shuttingDown || !serverProc) return;
    console.log("\n[dev] shared/server changed — reloading game server…");
    serverReload = true;
    try {
        serverProc.kill();
    } catch {
        // already gone
    }
}

function shutdown(signal: string): void {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[dev] shutting down (${signal})…`);
    for (const child of [serverProc, staticProc]) {
        try {
            child?.kill();
        } catch {
            // already gone
        }
    }
    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("[dev] building client…");
if (!(await buildClient())) {
    process.exit(1);
}

serverProc = startServer();
staticProc = spawn({
    cmd: ["bun", "static-server.ts", "--hot"],
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, BUNDU_DEBUG: "1" },
});

const clientWatchTargets = [
    "index.html",
    "build.ts",
    "packages/client",
    "packages/shared",
    "public/style.css",
    "public/assets",
];

let clientDebounce: Timer | undefined;
for (const target of clientWatchTargets) {
    watch(target, { recursive: true }, (_event, filename) => {
        // Display YAML is hot-reloaded in-browser via the static server SSE.
        if (isClientConfigYaml(target, filename)) return;
        clearTimeout(clientDebounce);
        clientDebounce = setTimeout(() => {
            void rebuildClient();
        }, 150);
    });
}

let serverDebounce: Timer | undefined;
for (const target of ["packages/server", "packages/shared"]) {
    watch(target, { recursive: true }, () => {
        clearTimeout(serverDebounce);
        serverDebounce = setTimeout(() => {
            requestServerReload();
        }, 150);
    });
}

const port = process.env.PORT ?? "3000";
const wsPort = process.env.WS_PORT ?? "7777";

console.log(`
[dev] local stack running
  client  http://localhost:${port}/site/
  server  ws://localhost:${wsPort}
  Ctrl+C to stop
`);

void staticProc.exited.then(() => {
    if (!shuttingDown) shutdown("static-exit");
});

// Supervise the game server: reload on code change, or recover from crashes.
while (!shuttingDown) {
    const proc = serverProc;
    if (!proc) break;
    await proc.exited;
    if (shuttingDown) break;
    if (serverReload) {
        serverReload = false;
    } else {
        console.log("[dev] game server exited — restarting…");
    }
    serverProc = startServer();
}
