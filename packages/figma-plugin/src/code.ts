const DEFAULT_RADIUS = 25;
const DEFAULT_ROUNDNESS = 60;
const FRAME_GAP = 64;
const TOUCH_TOLERANCE = 0.01;

const UI = `
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; color: var(--figma-color-text); background: var(--figma-color-bg); font: 12px Inter, sans-serif; }
  form { display: grid; gap: 14px; }
  label { display: grid; gap: 6px; font-weight: 600; }
  input { width: 100%; padding: 8px; border: 1px solid var(--figma-color-border); border-radius: 6px; color: var(--figma-color-text); background: var(--figma-color-bg); font: inherit; }
  .check { display: flex; grid-template-columns: none; align-items: center; gap: 8px; font-weight: 400; }
  .check input { width: auto; margin: 0; }
  fieldset { margin: 0; padding: 0; border: 0; }
  legend { margin-bottom: 6px; font-weight: 600; }
  .switch { display: grid; grid-template-columns: repeat(3, 1fr); overflow: hidden; border: 1px solid var(--figma-color-border); border-radius: 6px; }
  .switch label { display: block; padding: 8px 4px; font-weight: 400; text-align: center; cursor: pointer; }
  .switch label + label { border-left: 1px solid var(--figma-color-border); }
  .switch input { display: none; }
  .switch label:has(input:checked) { background: var(--figma-color-bg-brand); color: var(--figma-color-text-onbrand); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  button { padding: 8px 12px; border: 0; border-radius: 6px; font: 600 12px Inter, sans-serif; cursor: pointer; }
  button[type="submit"] { background: var(--figma-color-bg-brand); color: var(--figma-color-text-onbrand); }
  button[type="button"] { background: var(--figma-color-bg-secondary); color: var(--figma-color-text); }
  #status { min-height: 15px; color: var(--figma-color-text-secondary); }
  #status.success { color: var(--figma-color-text-success); }
  #status.error { color: var(--figma-color-text-danger); }
</style>
<form id="form">
  <label>Corner radius (px)<input id="radius" type="number" min="0" step="1" value="${DEFAULT_RADIUS}" required disabled></label>
  <label class="check"><input id="useObjectSize" type="checkbox" checked>Use object size for radius</label>
  <label>Square-to-circle (%)<input id="roundness" type="number" min="0" max="100" step="1" value="${DEFAULT_ROUNDNESS}" required></label>
  <fieldset>
    <legend>Locked layers</legend>
    <div class="switch">
      <label><input type="radio" name="lockedMode" value="exclude" checked>No copy</label>
      <label><input type="radio" name="lockedMode" value="preserve">Copy only</label>
      <label><input type="radio" name="lockedMode" value="transform">Transform</label>
    </div>
  </fieldset>
  <div id="status">Select exactly one frame.</div>
  <div class="actions">
    <button type="button" id="cancel">Cancel</button>
    <button type="submit">Generate</button>
  </div>
</form>
<script>
  const form = document.getElementById("form");
  const status = document.getElementById("status");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    status.className = "";
    status.textContent = "Generating…";
    parent.postMessage({ pluginMessage: {
      type: "generate",
      radius: Number(document.getElementById("radius").value),
      useObjectSize: document.getElementById("useObjectSize").checked,
      roundness: Number(document.getElementById("roundness").value),
      lockedMode: new FormData(form).get("lockedMode")
    } }, "*");
  });
  document.getElementById("useObjectSize").addEventListener("change", (event) => {
    document.getElementById("radius").disabled = event.target.checked;
  });
  document.getElementById("cancel").addEventListener("click", () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  });
  onmessage = (event) => {
    const message = event.data.pluginMessage;
    if (message?.type === "error" || message?.type === "success") {
      status.className = message.type;
      status.textContent = message.message;
    }
  };
</script>`;

type GenerateMessage = {
    type: "generate";
    radius: number;
    useObjectSize: boolean;
    roundness: number;
    lockedMode: LockedMode;
};

type LockedMode = "exclude" | "preserve" | "transform";

type PluginMessage = GenerateMessage | { type: "cancel" };

type MergeResult = {
    merged: number;
    rounded: number;
    skipped: number;
};

type RadiusSettings = {
    fixedRadius: number;
    useObjectSize: boolean;
    roundness: number;
};

figma.showUI(UI, { height: 354, width: 280, themeColors: true });

figma.ui.onmessage = async (message: PluginMessage) => {
    if (message.type === "cancel") {
        figma.closePlugin();
        return;
    }

    const frame = selectedFrame();
    if (!frame) {
        showError("Select exactly one frame.");
        return;
    }

    if (!validSettings(message)) {
        showError("Use a non-negative radius and roundness from 0–100%.");
        return;
    }

    try {
        const copy = frame.clone();
        copy.name = `${frame.name} — Squircle`;
        placeBeside(frame, copy);

        if (message.lockedMode === "exclude") removeLockedChildren(copy);
        const settings: RadiusSettings = {
            fixedRadius: message.radius,
            useObjectSize: message.useObjectSize,
            roundness: message.roundness / 100,
        };
        const result = mergeRectangles(copy, settings, message.lockedMode);
        figma.currentPage.selection = [copy];
        figma.viewport.scrollAndZoomIntoView([copy]);

        const summary = `${result.rounded} rounded, ${result.merged} merged${result.skipped ? `, ${result.skipped} skipped` : ""}`;
        figma.ui.postMessage({ type: "success", message: `Created ${copy.name}: ${summary}.` });
    } catch (error: unknown) {
        showError(error instanceof Error ? error.message : "Could not generate the frame.");
    }
};

function selectedFrame(): FrameNode | undefined {
    const { selection } = figma.currentPage;
    return selection.length === 1 && selection[0]?.type === "FRAME" ? selection[0] : undefined;
}

function validSettings(message: GenerateMessage): boolean {
    return (
        Number.isFinite(message.radius) &&
        message.radius >= 0 &&
        typeof message.useObjectSize === "boolean" &&
        Number.isFinite(message.roundness) &&
        message.roundness >= 0 &&
        message.roundness <= 100 &&
        ["exclude", "preserve", "transform"].includes(message.lockedMode)
    );
}

function placeBeside(source: FrameNode, copy: FrameNode): void {
    const [, , x] = source.absoluteTransform[0];
    const [, , y] = source.absoluteTransform[1];
    figma.currentPage.appendChild(copy);
    copy.x = x + source.width + FRAME_GAP;
    copy.y = y;
}

function mergeRectangles(frame: FrameNode, settings: RadiusSettings, lockedMode: LockedMode): MergeResult {
    const rectangles = frame
        .findAll((node) => node.type === "RECTANGLE")
        .filter(
            (node): node is RectangleNode =>
                node.type === "RECTANGLE" && isMergeable(node, frame, lockedMode),
        );
    const groups = groupByAppearanceAndOrder(rectangles);
    let merged = 0;
    let rounded = 0;
    let skipped = 0;

    for (const group of groups) {
        const first = group[0];
        if (!first) continue;

        let vector: VectorNode | undefined;
        try {
            const parent = first.parent;
            if (!parent || !("children" in parent)) {
                skipped += group.length;
                continue;
            }

            const index = parent.children.indexOf(first);
            const appearance = getAppearance(first);
            vector = createSquircleVector(group, settings);
            vector.name = first.name;
            setAppearance(vector, appearance);
            parent.insertChild(index, vector);
            for (const rectangle of group) rectangle.remove();
            if (group.length > 1) merged += group.length;
            rounded += 1;
        } catch {
            vector?.remove();
            skipped += group.length;
        }
    }

    return { merged, rounded, skipped };
}

type Point = { x: number; y: number };
type Edge = { start: Point; end: Point };

function createSquircleVector(
    rectangles: ReadonlyArray<RectangleNode>,
    settings: RadiusSettings,
): VectorNode {
    if (rectangles.some((rectangle) => !isAxisAligned(rectangle))) {
        throw new Error("Rotated or skewed rectangles are not supported.");
    }

    const loops = traceUnion(rectangles);
    if (!loops.length) throw new Error("Could not trace rectangle geometry.");

    const minX = Math.min(...loops.flatMap((loop) => loop.map((point) => point.x)));
    const minY = Math.min(...loops.flatMap((loop) => loop.map((point) => point.y)));
    const paths = loops.map((loop) => squirclePath(loop, settings, minX, minY)).join(" ");
    const vector = figma.createVector();
    vector.vectorPaths = [{ windingRule: "NONZERO", data: paths }];
    vector.x = minX;
    vector.y = minY;
    return vector;
}

function isAxisAligned(node: RectangleNode): boolean {
    const [[a, b], [c, d]] = node.relativeTransform;
    return Math.abs(b) < TOUCH_TOLERANCE && Math.abs(c) < TOUCH_TOLERANCE && a > 0 && d > 0;
}

function traceUnion(rectangles: ReadonlyArray<RectangleNode>): Point[][] {
    const xs = uniqueSorted(rectangles.flatMap((rectangle) => [rectangle.x, rectangle.x + rectangle.width]));
    const ys = uniqueSorted(rectangles.flatMap((rectangle) => [rectangle.y, rectangle.y + rectangle.height]));
    const occupied = Array.from({ length: ys.length - 1 }, () =>
        Array.from({ length: xs.length - 1 }, () => false),
    );

    for (let row = 0; row < ys.length - 1; row += 1) {
        for (let column = 0; column < xs.length - 1; column += 1) {
            const x = ((xs[column] ?? 0) + (xs[column + 1] ?? 0)) / 2;
            const y = ((ys[row] ?? 0) + (ys[row + 1] ?? 0)) / 2;
            const occupiedRow = requiredAt(occupied, row);
            occupiedRow[column] = rectangles.some(
                (rectangle) =>
                    x > rectangle.x - TOUCH_TOLERANCE &&
                    x < rectangle.x + rectangle.width + TOUCH_TOLERANCE &&
                    y > rectangle.y - TOUCH_TOLERANCE &&
                    y < rectangle.y + rectangle.height + TOUCH_TOLERANCE,
            );
        }
    }

    const edges: Edge[] = [];
    const filled = (row: number, column: number) => occupied[row]?.[column] ?? false;
    for (let row = 0; row < ys.length - 1; row += 1) {
        for (let column = 0; column < xs.length - 1; column += 1) {
            if (!filled(row, column)) continue;
            const x0 = requiredAt(xs, column);
            const x1 = requiredAt(xs, column + 1);
            const y0 = requiredAt(ys, row);
            const y1 = requiredAt(ys, row + 1);
            if (!filled(row - 1, column)) edges.push({ start: { x: x0, y: y0 }, end: { x: x1, y: y0 } });
            if (!filled(row, column + 1)) edges.push({ start: { x: x1, y: y0 }, end: { x: x1, y: y1 } });
            if (!filled(row + 1, column)) edges.push({ start: { x: x1, y: y1 }, end: { x: x0, y: y1 } });
            if (!filled(row, column - 1)) edges.push({ start: { x: x0, y: y1 }, end: { x: x0, y: y0 } });
        }
    }

    return connectEdges(edges).map(removeCollinear);
}

function uniqueSorted(values: ReadonlyArray<number>): number[] {
    return [...new Set(values)].sort((left, right) => left - right);
}

function connectEdges(edges: ReadonlyArray<Edge>): Point[][] {
    const remaining = new Set(edges);
    const loops: Point[][] = [];

    while (remaining.size) {
        const first = remaining.values().next().value;
        if (!first) break;
        const loop = [first.start];
        const loopStart = first.start;
        let edge = first;
        remaining.delete(edge);

        while (!samePoint(edge.end, loopStart)) {
            loop.push(edge.end);
            const candidates = [...remaining].filter((candidate) => samePoint(candidate.start, edge.end));
            const next = chooseNextEdge(edge, candidates);
            if (!next) throw new Error("Open geometry boundary.");
            remaining.delete(next);
            edge = next;
        }
        loops.push(loop);
    }

    return loops;
}

function chooseNextEdge(incoming: Edge, candidates: ReadonlyArray<Edge>): Edge | undefined {
    const direction = edgeDirection(incoming);
    const priority = [turnRight(direction), direction, turnLeft(direction), opposite(direction)];
    return priority.flatMap((nextDirection) =>
        candidates.filter((candidate) => edgeDirection(candidate) === nextDirection),
    )[0];
}

type Direction = 0 | 1 | 2 | 3;

function edgeDirection(edge: Edge): Direction {
    if (edge.end.x > edge.start.x) return 0;
    if (edge.end.y > edge.start.y) return 1;
    if (edge.end.x < edge.start.x) return 2;
    return 3;
}

function turnRight(direction: Direction): Direction {
    return ((direction + 1) % 4) as Direction;
}

function turnLeft(direction: Direction): Direction {
    return ((direction + 3) % 4) as Direction;
}

function opposite(direction: Direction): Direction {
    return ((direction + 2) % 4) as Direction;
}

function samePoint(left: Point, right: Point): boolean {
    return Math.abs(left.x - right.x) < TOUCH_TOLERANCE && Math.abs(left.y - right.y) < TOUCH_TOLERANCE;
}

function removeCollinear(points: ReadonlyArray<Point>): Point[] {
    return points.filter((point, index) => {
        const previous = requiredAt(points, (index - 1 + points.length) % points.length);
        const next = requiredAt(points, (index + 1) % points.length);
        return !((previous.x === point.x && point.x === next.x) || (previous.y === point.y && point.y === next.y));
    });
}

function squirclePath(
    points: ReadonlyArray<Point>,
    settings: RadiusSettings,
    offsetX: number,
    offsetY: number,
): string {
    if (points.length < 3) throw new Error("Invalid geometry boundary.");
    const corners = points.map((point, index) => {
        const previous = requiredAt(points, (index - 1 + points.length) % points.length);
        const next = requiredAt(points, (index + 1) % points.length);
        const incoming = unit(previous, point);
        const outgoing = unit(point, next);
        // Filled-on-right boundaries: right turns (positive cross in y-down) are convex.
        const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
        const maximum = Math.min(distance(previous, point), distance(point, next)) / 2;
        const radius = Math.min(settings.fixedRadius, maximum);
        const cornerRadius = cross > 0 ? (settings.useObjectSize ? maximum : radius) : 0;
        return { point, incoming, outgoing, radius: cornerRadius };
    });
    const first = requiredAt(corners, 0);
    const start = subtract(first.point, scale(first.incoming, first.radius));
    const commands = [`M ${number(start.x - offsetX)} ${number(start.y - offsetY)}`];

    for (const corner of corners) {
        const before = subtract(corner.point, scale(corner.incoming, corner.radius));
        commands.push(`L ${number(before.x - offsetX)} ${number(before.y - offsetY)}`);
        if (settings.roundness <= 0 || corner.radius <= 0) {
            commands.push(`L ${number(corner.point.x - offsetX)} ${number(corner.point.y - offsetY)}`);
            continue;
        }

        const power = settings.roundness;
        const center = add(subtract(corner.point, scale(corner.incoming, corner.radius)), scale(corner.outgoing, corner.radius));
        const samples = Math.max(6, Math.ceil(corner.radius / 3));
        for (let sample = 1; sample <= samples; sample += 1) {
            const angle = (Math.PI / 2) * (sample / samples);
            const alongIncoming = Math.sin(angle) ** power;
            const againstOutgoing = Math.cos(angle) ** power;
            const point = subtract(
                add(center, scale(corner.incoming, corner.radius * alongIncoming)),
                scale(corner.outgoing, corner.radius * againstOutgoing),
            );
            commands.push(`L ${number(point.x - offsetX)} ${number(point.y - offsetY)}`);
        }
    }
    commands.push("Z");
    return commands.join(" ");
}

function unit(from: Point, to: Point): Point {
    const length = distance(from, to);
    return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

function distance(left: Point, right: Point): number {
    return Math.hypot(right.x - left.x, right.y - left.y);
}

function add(left: Point, right: Point): Point {
    return { x: left.x + right.x, y: left.y + right.y };
}

function subtract(left: Point, right: Point): Point {
    return { x: left.x - right.x, y: left.y - right.y };
}

function scale(point: Point, amount: number): Point {
    return { x: point.x * amount, y: point.y * amount };
}

function number(value: number): string {
    return Number(value.toFixed(3)).toString();
}

function requiredAt<T>(values: ReadonlyArray<T>, index: number): T {
    const value = values[index];
    if (value === undefined) throw new Error("Invalid geometry data.");
    return value;
}

function groupByAppearanceAndOrder(rectangles: ReadonlyArray<RectangleNode>): RectangleNode[][] {
    const candidates = new Map<string, RectangleNode[]>();
    for (const rectangle of rectangles) {
        const key = `${rectangle.parent?.id ?? ""}:${appearanceKey(rectangle)}`;
        const group = candidates.get(key);
        if (group) group.push(rectangle);
        else candidates.set(key, [rectangle]);
    }

    const groups: RectangleNode[][] = [];
    for (const candidatesForAppearance of candidates.values()) {
        const parent = candidatesForAppearance[0]?.parent;
        if (!parent || !("children" in parent)) continue;

        const ordered = [...candidatesForAppearance].sort(
            (left, right) => parent.children.indexOf(left) - parent.children.indexOf(right),
        );
        let current: RectangleNode[] = [];
        let previousIndex = -2;

        for (const rectangle of ordered) {
            const index = parent.children.indexOf(rectangle);
            if (index !== previousIndex + 1 && current.length) {
                groups.push(...touchingComponents(current));
                current = [];
            }
            current.push(rectangle);
            previousIndex = index;
        }
        if (current.length) groups.push(...touchingComponents(current));
    }

    return groups;
}

function touchingComponents(rectangles: ReadonlyArray<RectangleNode>): RectangleNode[][] {
    const remaining = new Set(rectangles);
    const components: RectangleNode[][] = [];

    while (remaining.size) {
        const first = remaining.values().next().value;
        if (!first) break;

        const component: RectangleNode[] = [];
        const pending = [first];
        remaining.delete(first);

        while (pending.length) {
            const rectangle = pending.pop();
            if (!rectangle) continue;
            component.push(rectangle);

            for (const candidate of remaining) {
                if (!touches(rectangle, candidate)) continue;
                remaining.delete(candidate);
                pending.push(candidate);
            }
        }

        components.push(component);
    }

    return components;
}

function touches(left: RectangleNode, right: RectangleNode): boolean {
    const a = left.absoluteBoundingBox;
    const b = right.absoluteBoundingBox;
    if (!a || !b) return false;

    return (
        a.x <= b.x + b.width + TOUCH_TOLERANCE &&
        b.x <= a.x + a.width + TOUCH_TOLERANCE &&
        a.y <= b.y + b.height + TOUCH_TOLERANCE &&
        b.y <= a.y + a.height + TOUCH_TOLERANCE
    );
}

function removeLockedChildren(parent: ChildrenMixin): void {
    for (const child of [...parent.children]) {
        if (child.locked) {
            child.remove();
        } else if ("children" in child) {
            removeLockedChildren(child);
        }
    }
}

function isMergeable(node: RectangleNode, root: FrameNode, lockedMode: LockedMode): boolean {
    let current: BaseNode | null = node;
    while (current && current !== root) {
        if ("visible" in current && !current.visible) return false;
        if ("isMask" in current && current.isMask) return false;
        if (lockedMode !== "transform" && "locked" in current && current.locked) return false;
        current = current.parent;
    }
    return true;
}

function appearanceKey(node: RectangleNode): string {
    return JSON.stringify(getAppearance(node));
}

type Appearance = {
    fills: VectorNode["fills"];
    strokes: VectorNode["strokes"];
    strokeWeight: VectorNode["strokeWeight"];
    strokeAlign: VectorNode["strokeAlign"];
    strokeJoin: VectorNode["strokeJoin"];
    dashPattern: VectorNode["dashPattern"];
    effects: VectorNode["effects"];
    opacity: VectorNode["opacity"];
    blendMode: VectorNode["blendMode"];
};

function getAppearance(node: RectangleNode): Appearance {
    return {
        fills: node.fills,
        strokes: node.strokes,
        strokeWeight: node.strokeWeight,
        strokeAlign: node.strokeAlign,
        strokeJoin: node.strokeJoin,
        dashPattern: node.dashPattern,
        effects: node.effects,
        opacity: node.opacity,
        blendMode: node.blendMode,
    };
}

function setAppearance(node: VectorNode, appearance: Appearance): void {
    node.fills = appearance.fills;
    node.strokes = appearance.strokes;
    node.strokeWeight = appearance.strokeWeight;
    node.strokeAlign = appearance.strokeAlign;
    node.strokeJoin = appearance.strokeJoin;
    node.dashPattern = appearance.dashPattern;
    node.effects = appearance.effects;
    node.opacity = appearance.opacity;
    node.blendMode = appearance.blendMode;
}

function showError(message: string): void {
    figma.ui.postMessage({ type: "error", message });
}
