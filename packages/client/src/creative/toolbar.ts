import { ClientPacket } from "@bundu/shared/packet_definitions";
import { KIT_IDS } from "@bundu/shared/kits";
import {
    createModeToolbar,
    type ModeToolbarDef,
    type ModeToolbarHandle,
} from "../modes/toolbar";
import type { SendPacket } from "../input/controller";
import {
    cycleCreativeSpeed,
    formatSpeedLabel,
} from "./speeds";
import type { CreativeState } from "./state";

export type CreativeToolbarHandle = ModeToolbarHandle;

export function createCreativeToolbar(
    state: CreativeState,
    sendPacket: SendPacket,
    onRefresh: () => void
): CreativeToolbarHandle {
    const defs: ModeToolbarDef<CreativeState>[] = [
        {
            kind: "button",
            id: "godmode",
            label: "Godmode",
            getActive: () => state.godmode,
            onClick: () => {
                state.godmode = !state.godmode;
                sendPacket(ClientPacket.CreativeSetGodmode, {
                    enabled: state.godmode,
                });
                onRefresh();
            },
        },
        {
            kind: "button",
            id: "speed",
            label: formatSpeedLabel(state.speed),
            getLabel: () => formatSpeedLabel(state.speed),
            getActive: () => state.speed !== 1,
            onClick: () => {
                state.speed = cycleCreativeSpeed(state.speed);
                sendPacket(ClientPacket.CreativeSetSpeed, {
                    speed: state.speed,
                });
                onRefresh();
            },
        },
        {
            kind: "button",
            id: "instakill",
            label: "Instakill",
            getActive: () => state.instakill,
            onClick: () => {
                state.instakill = !state.instakill;
                sendPacket(ClientPacket.CreativeSetInstakill, {
                    enabled: state.instakill,
                });
                onRefresh();
            },
        },
        {
            kind: "button",
            id: "search-all",
            label: "Search All",
            getActive: () => state.searchAll,
            onClick: () => {
                state.searchAll = !state.searchAll;
                onRefresh();
            },
        },
        {
            kind: "dropdown",
            id: "kits",
            label: "Kits",
            options: KIT_IDS.map((kitId) => ({
                id: kitId,
                label: kitId[0]!.toUpperCase() + kitId.slice(1),
                onClick: () => {
                    sendPacket(ClientPacket.CreativeGiveKit, { kitId });
                },
            })),
        },
        {
            kind: "button",
            id: "clear",
            label: "Clear Inv",
            onClick: () => {
                if (
                    !window.confirm(
                        "Clear your entire inventory and cursor?"
                    )
                ) {
                    return;
                }
                sendPacket(ClientPacket.CreativeClearInventory, {});
            },
        },
    ];

    return createModeToolbar(state, defs);
}
