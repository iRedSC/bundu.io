import { Attributes, type AttributesData } from "../components/attributes.js";
import { Inventory } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import { type GameObject, System, type World } from "../engine";
import {
    ClientPacket,
    ServerPacket,
} from "@bundu/shared/packet_definitions.js";
import { isKitId, KITS } from "@bundu/shared/kits";
import {
    clearMissingEquipment,
    emitEquipment,
    emitInventory,
    equipContext,
    receiveItem,
} from "../network/inventory.js";
import { ItemConfigs } from "../configs/loaders/items.js";
import { gameRegistries } from "../configs/registries.js";
import type { GameEventMap } from "../systems/event_map.js";
import { canUseCapability } from "../auth/capabilities.js";

const CREATIVE_ATTR = "creative";
const INSTAKILL_DAMAGE = 10_000;
export const CREATIVE_SPEEDS = [0.5, 1, 2, 4] as const;
export type CreativeSpeed = (typeof CREATIVE_SPEEDS)[number];

type AttrPatch = Parameters<AttributesData["replace"]>[1];

export function canUseCreative(player: GameObject): boolean {
    return canUseCapability(player, "creative");
}

/** Creative inventory chrome is parked during freecam — reject mutations too. */
export function creativeInventoryActive(player: GameObject): boolean {
    const data = PlayerData.get(player);
    return (
        data?.creative === true &&
        data.freecam !== true &&
        canUseCreative(player)
    );
}

/** Vitals frozen + damage ignored (`/godmode` or creative toolbar). */
export function isGodmode(player: GameObject): boolean {
    return PlayerData.get(player)?.godmode === true;
}

/** @deprecated Use {@link isGodmode}. */
export function isCreativeGodmode(player: GameObject): boolean {
    return isGodmode(player);
}

function normalizeSpeed(speed: number): CreativeSpeed {
    if (speed === 0.5 || speed === 1 || speed === 2 || speed === 4) {
        return speed;
    }
    return 1;
}

export function emitCreativeState(player: GameObject, world: World): void {
    const data = PlayerData.get(player);
    if (!data?.creative) return;
    const { playerPacketManager } = world.context;
    playerPacketManager.set(player.id, ServerPacket.CreativeMode, {
        enabled: true,
        godmode: data.godmode === true,
        speed: normalizeSpeed(data.creativeSpeed ?? 1),
        instakill: data.creativeInstakill === true,
    });
}

function applyCreativeAttributes(player: GameObject): void {
    const data = PlayerData.get(player);
    const attrs = Attributes.get(player);
    if (!data || !attrs) return;

    if (!data.creative) {
        attrs.clear(CREATIVE_ATTR);
        return;
    }

    const speed = normalizeSpeed(data.creativeSpeed ?? 1);
    const next: AttrPatch = {};
    if (speed !== 1) {
        next["movement.speed"] = { operation: "multiply", value: speed };
    }
    if (data.creativeInstakill) {
        next["attack.damage"] = {
            operation: "add",
            value: INSTAKILL_DAMAGE,
        };
    }
    attrs.replace(CREATIVE_ATTR, next);
}

function knownItem(itemId: number): boolean {
    try {
        gameRegistries().item.location(itemId as never);
        return true;
    } catch {
        return false;
    }
}

function syncInv(player: GameObject, world: World): void {
    const { playerPacketManager, worldPacketManager } = world.context;
    clearMissingEquipment(player, equipContext(world));
    emitInventory(player, playerPacketManager);
    emitEquipment(player, worldPacketManager);
}

/**
 * Creative mode — item give + cheat toggles.
 * Kept parallel to AdminEditorSystem (freecam map tools).
 */
export class CreativeModeSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [PlayerData], 0);
    }

    toggleCreative(player: GameObject): void {
        const data = PlayerData.get(player);
        if (!data || !canUseCreative(player)) return;

        if (data.creative) {
            leaveCreative(player, data);
            const { playerPacketManager } = this.world.context;
            playerPacketManager.set(player.id, ServerPacket.CreativeMode, {
                enabled: false,
                godmode: false,
                speed: 1,
                instakill: false,
            });
            return;
        }

        data.creative = true;
        data.creativeSpeed = normalizeSpeed(data.creativeSpeed ?? 1);
        data.creativeInstakill = data.creativeInstakill ?? false;
        applyCreativeAttributes(player);
        emitCreativeState(player, this.world);
    }

    /** Toggle vitals-freeze godmode (also used by `/godmode`). */
    setGodmode(player: GameObject, enabled: boolean): void {
        const data = PlayerData.get(player);
        if (!data) return;
        data.godmode = enabled;
        // Drop legacy attack-speed/reach modifiers from the old /godmode.
        Attributes.get(player)?.clear("godmode");
        if (data.creative) emitCreativeState(player, this.world);
    }

    toggleGodmode(player: GameObject): boolean {
        const data = PlayerData.get(player);
        if (!data) return false;
        const next = !data.godmode;
        this.setGodmode(player, next);
        return next;
    }

    creativeGive = (
        playerId: number,
        { itemId, count }: ClientPacket.CreativeGive
    ) => {
        const player = this.world.getObject(playerId);
        if (!player || !creativeInventoryActive(player)) return;
        if (!Inventory.get(player) || !knownItem(itemId)) return;

        receiveItem(player, itemId, count);
        syncInv(player, this.world);
    };

    creativeGiveToCursor = (
        playerId: number,
        { itemId, count }: ClientPacket.CreativeGiveToCursor
    ) => {
        const player = this.world.getObject(playerId);
        if (!player || !creativeInventoryActive(player)) return;
        const inv = Inventory.get(player);
        if (!inv || !knownItem(itemId)) return;

        if (ItemConfigs.get(itemId).function === "backpack") {
            receiveItem(player, itemId, 1);
            syncInv(player, this.world);
            return;
        }

        inv.cursor = { id: itemId, count };
        inv.cursorCreative = true;
        syncInv(player, this.world);
    };

    creativeVoid = (playerId: number, { slot }: ClientPacket.CreativeVoid) => {
        const player = this.world.getObject(playerId);
        if (!player || !creativeInventoryActive(player)) return;
        const inv = Inventory.get(player);
        if (!inv) return;
        if (slot === -1) {
            if (!inv.cursor) return;
            inv.cursor = null;
            inv.cursorCreative = false;
        } else {
            if (slot < 0 || slot >= inv.slots.length) return;
            if (!inv.slots[slot]) return;
            inv.slots[slot] = null;
        }
        syncInv(player, this.world);
    };

    creativeClearInventory = (
        playerId: number,
        _packet: ClientPacket.CreativeClearInventory
    ) => {
        const player = this.world.getObject(playerId);
        if (!player || !creativeInventoryActive(player)) return;
        const inv = Inventory.get(player);
        if (!inv) return;
        for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = null;
        inv.cursor = null;
        inv.cursorCreative = false;
        syncInv(player, this.world);
    };

    creativeGiveKit = (
        playerId: number,
        { kitId }: ClientPacket.CreativeGiveKit
    ) => {
        const player = this.world.getObject(playerId);
        if (!player || !creativeInventoryActive(player)) return;
        if (!Inventory.get(player) || !isKitId(kitId)) return;
        const kit = KITS[kitId]!;
        for (const [itemLoc, count] of Object.entries(kit)) {
            try {
                const id = gameRegistries().item.resolve(itemLoc);
                receiveItem(player, id, count);
            } catch {
                // skip unknown kit entries
            }
        }
        syncInv(player, this.world);
    };

    creativeSetGodmode = (
        playerId: number,
        { enabled }: ClientPacket.CreativeSetGodmode
    ) => {
        const player = this.world.getObject(playerId);
        if (!player || !creativeInventoryActive(player)) return;
        this.setGodmode(player, enabled);
    };

    creativeSetSpeed = (
        playerId: number,
        { speed }: ClientPacket.CreativeSetSpeed
    ) => {
        const player = this.world.getObject(playerId);
        if (!player || !creativeInventoryActive(player)) return;
        const data = PlayerData.get(player);
        if (!data) return;
        data.creativeSpeed = normalizeSpeed(speed);
        applyCreativeAttributes(player);
        emitCreativeState(player, this.world);
    };

    creativeSetInstakill = (
        playerId: number,
        { enabled }: ClientPacket.CreativeSetInstakill
    ) => {
        const player = this.world.getObject(playerId);
        if (!player || !creativeInventoryActive(player)) return;
        const data = PlayerData.get(player);
        if (!data) return;
        data.creativeInstakill = enabled;
        applyCreativeAttributes(player);
        emitCreativeState(player, this.world);
    };

    override exit(player: GameObject): void {
        const data = PlayerData.get(player);
        if (!data?.creative) return;
        leaveCreative(player, data);
    }
}

/** Drop creative cheats — including godmode — when leaving the mode. */
function leaveCreative(
    player: GameObject,
    data: NonNullable<ReturnType<typeof PlayerData.get>>
): void {
    data.creative = false;
    data.creativeSpeed = 1;
    data.creativeInstakill = false;
    data.godmode = false;
    const attrs = Attributes.get(player);
    attrs?.clear(CREATIVE_ATTR);
    attrs?.clear("godmode");
}
