import { describe, expect, test } from "bun:test";
import { MapImportJobs } from "../../../packages/server/src/admin/import_jobs";

const credential = "authorized_credential_1234";
const headers = { Authorization: `Bearer ${credential}` };
const endpoint = "http://server.test/admin/maps/import";

function request(
  method: string,
  path = "",
  body?: string,
  extraHeaders: Record<string, string> = {},
): Request {
  return new Request(`${endpoint}${path}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body,
  });
}

describe("authenticated map import jobs", () => {
  test("authorizes before reading or running an import", async () => {
    let ran = false;
    const jobs = new MapImportJobs({
      authorize: () => undefined,
      run: () => {
        ran = true;
      },
    });
    const response = await jobs.respond(
      new Request(endpoint, {
        method: "POST",
        headers: { Authorization: "Bearer rejected_credential_1234" },
        body: "not: yaml",
      }),
      new URL(endpoint),
    );

    expect(response?.status).toBe(401);
    expect(ran).toBeFalse();
  });

  test("rejects declared and actual payloads above the byte limit", async () => {
    const jobs = new MapImportJobs({
      authorize: () => 7,
      run: () => {},
      maxPayloadBytes: 4,
    });
    const declared = request("POST", "", "x", { "content-length": "5" });
    const actual = request("POST", "", "12345");

    expect((await jobs.respond(declared, new URL(endpoint)))?.status).toBe(413);
    expect((await jobs.respond(actual, new URL(endpoint)))?.status).toBe(413);
  });

  test("bounds concurrency and isolates job status by owner", async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const jobs = new MapImportJobs({
      authorize: (value) => value === credential ? 7 : 8,
      run: () => blocked,
      maxConcurrent: 1,
    });
    const created = await jobs.respond(request("POST", "", "map: one"), new URL(endpoint));
    const first = await created?.json() as { id: string };
    const busy = await jobs.respond(request("POST", "", "map: two"), new URL(endpoint));

    expect(created?.status).toBe(202);
    expect(busy?.status).toBe(429);

    const otherCredential = "another_credential_1234";
    const hidden = await jobs.respond(
      new Request(`${endpoint}/${first.id}`, {
        headers: { Authorization: `Bearer ${otherCredential}` },
      }),
      new URL(`${endpoint}/${first.id}`),
    );
    expect(hidden?.status).toBe(404);
    release?.();
    await Bun.sleep(0);
  });

  test("times out, cleans concurrency, and redacts diagnostics", async () => {
    const jobs = new MapImportJobs({
      authorize: () => 7,
      run: async (_playerId, yaml, signal) => {
        if (yaml === "fail") {
          throw new Error(`credential ${credential} rejected`);
        }
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
      timeoutMs: 5,
    });
    const timed = await jobs.respond(request("POST", "", "hang"), new URL(endpoint));
    const timedJob = await timed?.json() as { id: string };
    await Bun.sleep(10);
    const timedStatus = await jobs.respond(
      request("GET", `/${timedJob.id}`),
      new URL(`${endpoint}/${timedJob.id}`),
    );
    expect(await timedStatus?.json()).toMatchObject({
      state: "cancelled",
      diagnostic: "Import timed out",
    });

    const failed = await jobs.respond(request("POST", "", "fail"), new URL(endpoint));
    const failedJob = await failed?.json() as { id: string };
    await Bun.sleep(0);
    const failedStatus = await jobs.respond(
      request("GET", `/${failedJob.id}`),
      new URL(`${endpoint}/${failedJob.id}`),
    );
    const result = await failedStatus?.json() as {
      state: string;
      diagnostic: string;
    };
    expect(result.state).toBe("failed");
    expect(result.diagnostic).not.toContain(credential);
    expect(result.diagnostic).toContain("[redacted]");
  });
});
