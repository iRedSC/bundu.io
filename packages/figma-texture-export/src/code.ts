import {
    COMPANION_ORIGIN,
    DEFAULT_NAMESPACE,
    isValidNamespace,
    isValidTextureStem,
    parseZonePath,
    textureRelativePath,
} from "./paths";

type Bounds = { x: number; y: number; width: number; height: number };

type Zone = {
    id: string;
    path: string;
    bounds: Bounds;
    area: number;
};

type PlannedTexture = {
    nodeId: string;
    frameName: string;
    relativePath: string;
    zonePath: string;
};

type PreviewMessage = { type: "preview"; namespace: string };
type PushMessage = { type: "push"; namespace: string };
type CancelMessage = { type: "cancel" };
type PluginMessage = PreviewMessage | PushMessage | CancelMessage;

type UiMessage =
    | { type: "preview"; namespace: string; textures: PlannedTexture[]; warnings: string[] }
    | { type: "status"; tone: "info" | "success" | "error"; message: string }
    | {
          type: "exported";
          namespace: string;
          files: Array<{ relativePath: string; svg: string }>;
      };

const UI = `
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; color: var(--figma-color-text); background: var(--figma-color-bg); font: 12px Inter, sans-serif; }
  form { display: grid; gap: 12px; }
  label { display: grid; gap: 6px; font-weight: 600; }
  input { width: 100%; padding: 8px; border: 1px solid var(--figma-color-border); border-radius: 6px; color: var(--figma-color-text); background: var(--figma-color-bg); font: inherit; }
  #companion, #status { min-height: 15px; color: var(--figma-color-text-secondary); }
  #companion.ok, #status.success { color: var(--figma-color-text-success); }
  #companion.bad, #status.error { color: var(--figma-color-text-danger); }
  #list { max-height: 220px; overflow: auto; margin: 0; padding: 8px 8px 8px 22px; border: 1px solid var(--figma-color-border); border-radius: 6px; background: var(--figma-color-bg-secondary); }
  #list:empty::before { content: "Run preview to list textures."; color: var(--figma-color-text-secondary); margin-left: -14px; }
  #list li { margin: 0 0 6px; }
  #list code { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  button { padding: 8px 12px; border: 0; border-radius: 6px; font: 600 12px Inter, sans-serif; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.primary { background: var(--figma-color-bg-brand); color: var(--figma-color-text-onbrand); }
  button.secondary { background: var(--figma-color-bg-secondary); color: var(--figma-color-text); }
</style>
<form id="form">
  <label>Namespace<input id="namespace" type="text" value="${DEFAULT_NAMESPACE}" autocomplete="off" spellcheck="false"></label>
  <div id="companion">Checking companion…</div>
  <ol id="list"></ol>
  <div id="status">Locked rects named @path/to mark folders. Frames inside them export as &lt;frame&gt;.svg.</div>
  <div class="actions">
    <button type="button" class="secondary" id="cancel">Close</button>
    <button type="button" class="secondary" id="preview">Preview</button>
    <button type="submit" class="primary" id="push" disabled>Push</button>
  </div>
</form>
<script>
  const companionEl = document.getElementById("companion");
  const statusEl = document.getElementById("status");
  const listEl = document.getElementById("list");
  const namespaceEl = document.getElementById("namespace");
  const pushBtn = document.getElementById("push");
  const origin = ${JSON.stringify(COMPANION_ORIGIN)};
  let planned = [];
  let companionOk = false;

  function setStatus(tone, message) {
    statusEl.className = tone === "info" ? "" : tone;
    statusEl.textContent = message;
  }

  function setCompanion(ok, detail) {
    companionOk = ok;
    companionEl.className = ok ? "ok" : "bad";
    companionEl.textContent = detail;
    syncPushEnabled();
  }

  function syncPushEnabled() {
    pushBtn.disabled = !(companionOk && planned.length > 0);
  }

  async function checkCompanion() {
    try {
      const response = await fetch(origin + "/health");
      if (!response.ok) throw new Error("Companion returned " + response.status);
      await response.json();
      setCompanion(true, "Companion ready on " + origin);
    } catch {
      setCompanion(false, "Companion offline. Run: bun run figma:textures");
    }
  }

  document.getElementById("cancel").onclick = () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  };

  document.getElementById("preview").onclick = () => {
    planned = [];
    listEl.innerHTML = "";
    syncPushEnabled();
    setStatus("info", "Scanning…");
    parent.postMessage({ pluginMessage: { type: "preview", namespace: namespaceEl.value.trim() } }, "*");
  };

  document.getElementById("form").onsubmit = (event) => {
    event.preventDefault();
    if (!companionOk || !planned.length) return;
    setStatus("info", "Exporting…");
    pushBtn.disabled = true;
    parent.postMessage({ pluginMessage: { type: "push", namespace: namespaceEl.value.trim() } }, "*");
  };

  async function pushFiles(namespace, files) {
    setStatus("info", "Writing " + files.length + " file(s)…");
    try {
      const response = await fetch(origin + "/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namespace, files }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Push failed.");
      const overwritten = body.overwritten?.length ?? 0;
      setStatus(
        "success",
        "Wrote " + body.written.length + " texture(s)" +
          (overwritten ? " (" + overwritten + " replaced)" : "") + ".",
      );
    } catch (error) {
      setStatus("error", error instanceof Error ? error.message : "Push failed.");
    } finally {
      syncPushEnabled();
    }
  }

  onmessage = (event) => {
    const message = event.data.pluginMessage;
    if (!message) return;
    if (message.type === "status") {
      setStatus(message.tone, message.message);
      return;
    }
    if (message.type === "preview") {
      planned = message.textures || [];
      listEl.innerHTML = "";
      for (const texture of planned) {
        const item = document.createElement("li");
        item.innerHTML = "<strong>" + escapeHtml(texture.frameName) + "</strong> → <code>" +
          escapeHtml(message.namespace) + "/" + escapeHtml(texture.relativePath) + "</code>";
        listEl.appendChild(item);
      }
      const warningText = (message.warnings || []).join(" ");
      if (!planned.length) {
        setStatus("error", warningText || "No textures found.");
      } else {
        setStatus(
          "info",
          planned.length + " texture(s) ready." + (warningText ? " " + warningText : "") + " Confirm to replace existing files.",
        );
      }
      syncPushEnabled();
      return;
    }
    if (message.type === "exported") {
      pushFiles(message.namespace, message.files);
    }
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  checkCompanion();
</script>`;

figma.showUI(UI, { width: 420, height: 460, themeColors: true });

let lastPlan: PlannedTexture[] = [];

figma.ui.onmessage = async (message: PluginMessage) => {
    if (message.type === "cancel") {
        figma.closePlugin();
        return;
    }

    if (!isValidNamespace(message.namespace)) {
        postStatus("error", "Namespace must match /^[a-z][a-z0-9_]*$/.");
        return;
    }

    if (message.type === "preview") {
        const { textures, warnings } = planTextures();
        lastPlan = textures;
        figma.ui.postMessage({
            type: "preview",
            namespace: message.namespace,
            textures,
            warnings,
        } satisfies Extract<UiMessage, { type: "preview" }>);
        return;
    }

    if (message.type === "push") {
        if (!lastPlan.length) {
            postStatus("error", "Run preview first.");
            return;
        }

        const files: Array<{ relativePath: string; svg: string }> = [];
        for (const planned of lastPlan) {
            const node = await figma.getNodeByIdAsync(planned.nodeId);
            if (!node || node.type !== "FRAME") {
                postStatus("error", `Missing frame for ${planned.relativePath}.`);
                return;
            }
            const svg = await node.exportAsync({ format: "SVG_STRING" });
            files.push({ relativePath: planned.relativePath, svg });
        }

        figma.ui.postMessage({
            type: "exported",
            namespace: message.namespace,
            files,
        } satisfies Extract<UiMessage, { type: "exported" }>);
    }
};

function planTextures(): { textures: PlannedTexture[]; warnings: string[] } {
    const warnings: string[] = [];
    const zones = findZones();
    if (!zones.length) {
        return { textures: [], warnings: ["No locked rectangles named @path/to on this page."] };
    }

    const frames = figma.currentPage.findAllWithCriteria({ types: ["FRAME"] });
    const byPath = new Map<string, PlannedTexture>();

    for (const frame of frames) {
        if (frame.name.startsWith("@")) continue;
        const bounds = frame.absoluteBoundingBox;
        if (!bounds) continue;

        const zone = zoneForCenter(zones, centerOf(bounds));
        if (!zone) continue;

        if (!isValidTextureStem(frame.name)) {
            warnings.push(`Skipped "${frame.name}" (use [a-z][a-z0-9_]*).`);
            continue;
        }

        const relativePath = textureRelativePath(zone.path, frame.name);
        const existing = byPath.get(relativePath);
        if (existing) {
            warnings.push(`Duplicate path ${relativePath} (${existing.frameName} vs ${frame.name}).`);
            continue;
        }

        byPath.set(relativePath, {
            nodeId: frame.id,
            frameName: frame.name,
            relativePath,
            zonePath: zone.path,
        });
    }

    const textures = [...byPath.values()].sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath),
    );
    if (!textures.length && !warnings.length) {
        warnings.push("Zones found, but no frames with centers inside them.");
    }
    return { textures, warnings };
}

function findZones(): Zone[] {
    const rectangles = figma.currentPage.findAllWithCriteria({ types: ["RECTANGLE"] });
    const zones: Zone[] = [];

    for (const rectangle of rectangles) {
        if (!rectangle.locked) continue;
        const path = parseZonePath(rectangle.name);
        if (!path) continue;
        const bounds = rectangle.absoluteBoundingBox;
        if (!bounds) continue;
        zones.push({
            id: rectangle.id,
            path,
            bounds,
            area: bounds.width * bounds.height,
        });
    }

    return zones.sort((left, right) => left.area - right.area);
}

function zoneForCenter(zones: ReadonlyArray<Zone>, point: { x: number; y: number }): Zone | undefined {
    // zones sorted smallest-first so nested zones win
    return zones.find((zone) => contains(zone.bounds, point));
}

function centerOf(bounds: Bounds): { x: number; y: number } {
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function contains(bounds: Bounds, point: { x: number; y: number }): boolean {
    return (
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
    );
}

function postStatus(tone: "info" | "success" | "error", message: string): void {
    figma.ui.postMessage({ type: "status", tone, message } satisfies Extract<UiMessage, { type: "status" }>);
}
