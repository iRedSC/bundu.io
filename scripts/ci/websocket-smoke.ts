import { decode, encode } from "@msgpack/msgpack";
import { ClientPacket, ServerPacket } from "@bundu/shared/packet_definitions";

const timeoutMs = 10_000;
const port = 17_777;
const externalUrl = process.env.WS_SMOKE_URL;
const url = externalUrl ?? `ws://127.0.0.1:${port}`;
const server = externalUrl
    ? undefined
    : Bun.spawn(["bun", "run", "packages/server/src/index.ts"], {
          env: { ...process.env, WS_PORT: String(port) },
          stdout: "inherit",
          stderr: "inherit",
      });

const isPacket = (value: unknown): value is [number, ...unknown[]] =>
    Array.isArray(value) && Number.isSafeInteger(value[0]);

const containsChatReply = (value: unknown) =>
    Array.isArray(value) &&
    value.some(
        (packet) =>
            isPacket(packet) &&
            packet[0] === ServerPacket.ChatMessage &&
            packet[2] === "ci-smoke"
    );

async function connect(deadline: number): Promise<WebSocket> {
    while (Date.now() < deadline) {
        const socket = await new Promise<WebSocket | undefined>((resolve) => {
            const candidate = new WebSocket(
                `${url}?username=ci-smoke&skin_id=0`
            );
            candidate.binaryType = "arraybuffer";
            candidate.addEventListener("open", () => resolve(candidate), {
                once: true,
            });
            candidate.addEventListener("error", () => resolve(undefined), {
                once: true,
            });
        });
        if (socket) return socket;
        await Bun.sleep(100);
    }
    throw new Error(`Could not connect to ${url}`);
}

try {
    const socket = await connect(Date.now() + timeoutMs);
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(new Error(`WebSocket smoke test timed out: ${url}`)),
            timeoutMs
        );
        socket.send(encode([ClientPacket.ChatMessage, "ci-smoke"]));
        socket.addEventListener("message", ({ data }) => {
            if (!(data instanceof ArrayBuffer)) return;
            if (!containsChatReply(decode(data))) return;
            clearTimeout(timeout);
            socket.close();
            resolve();
        });
        socket.addEventListener("error", () => {
            clearTimeout(timeout);
            reject(new Error(`WebSocket round trip failed: ${url}`));
        });
    });
    console.log(`WebSocket round trip passed: ${url}`);
} finally {
    server?.kill();
    await server?.exited;
}
