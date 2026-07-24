import { beforeAll, describe, expect, test } from "bun:test";
import { ResourcePackService } from "../../../packages/server/src/configs/resource_packs";
import { loadConfigs } from "../../../packages/server/src/configs/loaders/load";

let service: ResourcePackService;

beforeAll(async () => {
  loadConfigs();
  service = await ResourcePackService.create();
});

function request(path: string, init?: RequestInit): Response {
  const req = new Request(`http://server.test${path}`, init);
  const response = service.respond(req);
  if (!response) throw new Error(`No response for ${path}`);
  return response;
}

describe("ResourcePackService.respond", () => {
  test("ignores requests outside a packs mount", () => {
    const req = new Request("http://server.test/healthz");
    expect(service.respond(req)).toBeUndefined();
  });

  test("serves the manifest without caching", async () => {
    const response = request("/packs/manifest.json");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toEqual(service.manifest);
  });

  test("serves every hashed JSON document immutably", async () => {
    const documents = [
      [service.manifest.models, service.modelsJson],
      [service.manifest.registries, service.registriesJson],
      [service.manifest.gameplay, service.gameplayJson],
      [service.manifest.statBars, service.statBarsJson],
      [service.manifest.lang, service.langJson],
    ] as const;

    for (const [entry, body] of documents) {
      const response = request(`${entry.url}?hash=${entry.hash}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("cache-control")).toContain("immutable");
      expect(await response.text()).toBe(body);
    }
  });

  test("rejects missing or stale hashes", () => {
    expect(request(service.manifest.models.url).status).toBe(404);
    expect(
      request(`${service.manifest.models.url}?hash=stale`).status,
    ).toBe(404);
  });

  test("supports mounted pack paths and CORS preflight", () => {
    const response = request("/server/na/packs/manifest.json", {
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, OPTIONS",
    );
  });

  test("rejects unsupported methods and unknown resources", () => {
    expect(
      request("/packs/manifest.json", { method: "POST" }).status,
    ).toBe(405);
    expect(request("/packs/unknown.json").status).toBe(404);
  });

  test("serves a manifest asset by its content hash", async () => {
    const entry = service.manifest.assets[0];
    expect(entry).toBeDefined();
    if (!entry) return;

    const response = request(
      `/packs/assets/${entry.path}?hash=${entry.hash}`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect((await response.arrayBuffer()).byteLength).toBe(entry.size);
  });
});
