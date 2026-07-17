import { Spiked } from "../components/base.js";
import type { GameObject, World } from "../engine";
import {
    snapshotObject,
    restoreObject,
    type ObjectSnapshot,
} from "../bootstrap/dev_checkpoint.js";
import { syncStructureStates } from "../network/object_state.js";
import { GameEvent, type GameEventMap } from "../systems/event_map.js";

const MAX_STROKES = 64;

/** One reversible editor mutation inside a stroke. */
export type HistoryMutation =
    | { kind: "add"; snapshot: ObjectSnapshot }
    | { kind: "remove"; snapshot: ObjectSnapshot }
    | { kind: "spike"; objectId: number };

type Stroke = HistoryMutation[];

type PlayerHistory = {
    open: Stroke | null;
    undo: Stroke[];
    redo: Stroke[];
};

type HistoryHost = {
    world: World;
    trigger: <T extends keyof GameEventMap>(
        event: T,
        data: GameEventMap[T]
    ) => void;
    broadcastGround: (
        packet: [type: number, x: number, y: number, w: number, h: number]
    ) => void;
    broadcastUnloadGround: (
        packet: [type: number, x: number, y: number, w: number, h: number]
    ) => void;
};

const byPlayer = new Map<number, PlayerHistory>();

function historyFor(playerId: number): PlayerHistory {
    let entry = byPlayer.get(playerId);
    if (!entry) {
        entry = { open: null, undo: [], redo: [] };
        byPlayer.set(playerId, entry);
    }
    return entry;
}

export function clearEditorHistory(playerId: number): void {
    byPlayer.delete(playerId);
}

export function beginStroke(playerId: number): void {
    const history = historyFor(playerId);
    if (history.open?.length) {
        pushStroke(history, history.open);
    }
    history.open = [];
}

export function endStroke(playerId: number): void {
    const history = historyFor(playerId);
    if (!history.open) return;
    if (history.open.length > 0) pushStroke(history, history.open);
    history.open = null;
}

export function recordMutation(
    playerId: number,
    mutation: HistoryMutation
): void {
    const history = historyFor(playerId);
    if (!history.open) history.open = [];
    history.open.push(mutation);
    history.redo = [];
}

export function trySnapshot(object: GameObject): ObjectSnapshot | null {
    try {
        return snapshotObject(object);
    } catch {
        return null;
    }
}

function pushStroke(history: PlayerHistory, stroke: Stroke): void {
    history.undo.push(stroke);
    if (history.undo.length > MAX_STROKES) history.undo.shift();
    history.redo = [];
}

export function undoStroke(playerId: number, host: HistoryHost): void {
    const history = historyFor(playerId);
    if (history.open?.length) {
        pushStroke(history, history.open);
        history.open = null;
    } else {
        history.open = null;
    }
    const stroke = history.undo.pop();
    if (!stroke) return;
    for (let i = stroke.length - 1; i >= 0; i--) {
        const mutation = stroke[i];
        if (mutation) applyUndo(mutation, host);
    }
    history.redo.push(stroke);
}

export function redoStroke(playerId: number, host: HistoryHost): void {
    const history = historyFor(playerId);
    history.open = null;
    const stroke = history.redo.pop();
    if (!stroke) return;
    for (const mutation of stroke) {
        applyRedo(mutation, host);
    }
    history.undo.push(stroke);
    if (history.undo.length > MAX_STROKES) history.undo.shift();
}

function applyUndo(mutation: HistoryMutation, host: HistoryHost): void {
    switch (mutation.kind) {
        case "add":
            removeBySnapshot(mutation.snapshot, host);
            return;
        case "remove":
            restoreWithSync(mutation.snapshot, host);
            return;
        case "spike":
            unspike(mutation.objectId, host);
            return;
    }
}

function applyRedo(mutation: HistoryMutation, host: HistoryHost): void {
    switch (mutation.kind) {
        case "add":
            restoreWithSync(mutation.snapshot, host);
            return;
        case "remove":
            removeBySnapshot(mutation.snapshot, host);
            return;
        case "spike":
            respike(mutation.objectId, host);
            return;
    }
}

function removeBySnapshot(snapshot: ObjectSnapshot, host: HistoryHost): void {
    const object = host.world.getObject(snapshot.id);
    if (!object) return;
    if (snapshot.kind === "ground") {
        const wasActive = object.active;
        host.world.removeObject(object);
        if (wasActive) {
            host.broadcastUnloadGround([
                snapshot.groundType,
                snapshot.x,
                snapshot.y,
                snapshot.width,
                snapshot.height,
            ]);
        }
        return;
    }
    if (object.active) {
        object.active = false;
        host.trigger(GameEvent.DeleteObject, { object });
    }
    host.world.removeObject(object);
}

function restoreWithSync(snapshot: ObjectSnapshot, host: HistoryHost): void {
    const existing = host.world.getObject(snapshot.id);
    if (existing?.active) return;
    if (existing) host.world.removeObject(existing);
    restoreObject(host.world, snapshot);
    if (snapshot.kind === "ground") {
        host.broadcastGround([
            snapshot.groundType,
            snapshot.x,
            snapshot.y,
            snapshot.width,
            snapshot.height,
        ]);
    }
}

function unspike(objectId: number, host: HistoryHost): void {
    const object = host.world.getObject(objectId);
    if (!object?.active || !Spiked.get(object)) return;
    object.remove(Spiked);
    syncStructureStates(host.world, object);
}

function respike(objectId: number, host: HistoryHost): void {
    const object = host.world.getObject(objectId);
    if (!object?.active || Spiked.get(object)) return;
    object.add(new Spiked());
    syncStructureStates(host.world, object);
}
