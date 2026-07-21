import { ClientPacket } from "@bundu/shared/packet_definitions";
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
    ];

    return createModeToolbar(state, defs);
}
