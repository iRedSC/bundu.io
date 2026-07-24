type ImportJobResponse = {
    id: string;
    state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    diagnostic?: string;
};

const POLL_MS = 100;
const CLIENT_TIMEOUT_MS = 10_000;

function importUrl(websocketUrl: string): URL {
    const base = new URL(websocketUrl);
    base.protocol = base.protocol === "wss:" ? "https:" : "http:";
    base.search = "";
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    return new URL("admin/maps/import", base);
}

export async function importMapJob(
    websocketUrl: string,
    credential: string,
    yaml: string
): Promise<void> {
    const url = importUrl(websocketUrl);
    const headers = {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/yaml",
    };
    const created = await fetch(url, { method: "POST", headers, body: yaml });
    if (!created.ok) throw new Error(`Map import rejected (${created.status})`);
    const job = (await created.json()) as ImportJobResponse;
    url.pathname += `/${job.id}`;

    const deadline = performance.now() + CLIENT_TIMEOUT_MS;
    while (performance.now() < deadline) {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`Map import status failed (${response.status})`);
        }
        const current = (await response.json()) as ImportJobResponse;
        if (current.state === "succeeded") return;
        if (current.state === "failed" || current.state === "cancelled") {
            throw new Error(current.diagnostic ?? `Map import ${current.state}`);
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    await fetch(url, { method: "DELETE", headers });
    throw new Error("Map import timed out");
}
