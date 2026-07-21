import { Attributes, type AttributesData } from "../components/attributes.js";
import { Inventory } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import { type GameObject, System, type World } from "../engine";
import {
    ClientPacket,
    ServerPacket,
} from "@bundu/shared/packet_definitions.js";
import { emitInventory, receiveItem } from "../network/inventory.js";
import { gameRegistries } from "../configs/registries.js";
import { SERVER_DEBUG } from "../debug/index.js";
import type { GameEventMap } from "../systems/event_map.js";

const CREATIVE_ATTR = "creative";
const INSTAKILL_DAMAGE = 10_000;
export const CREATIVE_SPEEDS = [0.5, 1, 2, 4] as const;
export type CreativeSpeed = (typeof CREATIVE_SPEEDS)[number];

type AttrPatch = Parameters<AttributesData["replace"]>[1];

export function canUseCreative(player: GameObject): boolean {
    const data = PlayerData.get(player);
    if (!data) return false;
    return (data.opLevel ?? 0) >= 4 || data.cheatsEnabled === true || SERVER_DEBUG;
}

export function isCreativeGodmode(player: GameObject): boolean {
    const data = PlayerData.get(player);
    return data?.creative === true && data.creativeGodmode === true;
}

function normalizeSpeed(speed: number): CreativeSpeed {
    if (speed === 0.5 || speed === 1 || speed === 2 || speed === 4) {
        return speed;
    }
    return 1;
}

function emitCreativeState(
    player: GameObject,
    world: World
): void {
    const data = PlayerData.get(player);
    if (!data) return;
    const { playerPacketManager } = world.context;
    playerPacketManager.set(player.id, ServerPacket.CreativeMode, {
        enabled: data.creative === true,
        godmode: data.creativeGodmode === true,
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
            data.creative = false;
            data.creativeGodmode = false;
            data.creativeSpeed = 1;
            data.creativeInstakill = false;
            applyCreativeAttributes(player);
            emitCreativeState(player, this.world);
            return;
        }

        data.creative = true;
        data.creativeGodmode = data.creativeGodmode ?? false;
        data.creativeSpeed = normalizeSpeed(data.creativeSpeed ?? 1);
        data.creativeInstakill = data.creativeInstakill ?? false;
        applyCreativeAttributes(player);
        emitCreativeState(player, this.world);
    }

    creativeGive = (
        playerId: number,
        { itemId, count }: ClientPacket.CreativeGive
    ) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (!data?.creative || !canUseCreative(player)) return;
        if (!Inventory.get(player)) return;
        try {
            gameRegistries().item.location(itemId as never);
        } catch {
            return;
        }

        receiveItem(player, itemId, count);
        emitInventory(player, this.world.context.playerPacketManager);
    };

    creativeSetGodmode = (
        playerId: number,
        { enabled }: ClientPacket.CreativeSetGodmode
    ) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (!data?.creative || !canUseCreative(player)) return;
        data.creativeGodmode = enabled;
        emitCreativeState(player, this.world);
    };

    creativeSetSpeed = (
        playerId: number,
        { speed }: ClientPacket.CreativeSetSpeed
    ) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (!data?.creative || !canUseCreative(player)) return;
        data.creativeSpeed = normalizeSpeed(speed);
        applyCreativeAttributes(player);
        emitCreativeState(player, this.world);
    };

    creativeSetInstakill = (
        playerId: number,
        { enabled }: ClientPacket.CreativeSetInstakill
    ) => {
        const player = this.world.getObject(playerId);
        if (!player) return;
        const data = PlayerData.get(player);
        if (!data?.creative || !canUseCreative(player)) return;
        data.creativeInstakill = enabled;
        applyCreativeAttributes(player);
        emitCreativeState(player, this.world);
    };

    /** Clear creative cheats when the player entity leaves (death / disconnect). */
    override exit(player: GameObject): void {
        const data = PlayerData.get(player);
        if (!data?.creative) return;
        data.creative = false;
        data.creativeGodmode = false;
        data.creativeSpeed = 1;
        data.creativeInstakill = false;
        Attributes.get(player)?.clear(CREATIVE_ATTR);
    }
}
