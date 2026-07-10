import { spawn, type Subprocess } from "bun";
import { watch } from "fs";

const children: Subprocess[] = [];
let building = false;
let rebuildQueued = false;

async function buildClient(): Promise<boolean> {
    const proc = spawn({
        cmd: ["bun", "run", "./build.ts"],
        stdout: "inherit",
        stderr: "inherit",
        env: process.env,
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

function start(cmd: string[]): Subprocess {
    const proc = spawn({
        cmd,
        stdout: "inherit",
        stderr: "inherit",
        env: process.env,
    });
    children.push(proc);
    return proc;
}

function shutdown(signal: string): void {
    console.log(`\n[dev] shutting down (${signal})…`);
    for (const child of children) {
        try {
            child.kill();
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

start(["bun", "run", "packages/server/src/index.ts"]);
start(["bun", "static-server.ts", "--hot"]);

const watchTargets = [
    "index.html",
    "build.ts",
    "packages/client",
    "packages/shared",
    "public/style.css",
    "public/assets",
];

let debounce: Timer | undefined;
for (const target of watchTargets) {
    watch(target, { recursive: true }, () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            void rebuildClient();
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

await Promise.race(children.map((child) => child.exited));
shutdown("child-exit");
