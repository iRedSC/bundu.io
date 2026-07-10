import type { AnimationManager } from "@bundu/shared/animations";
import type { Container } from "pixi.js";
import {
    Schema,
    type ServerPacketMap,
} from "@bundu/shared/packet_definitions";
import { Serializer } from "@bundu/shared";
import { ClientPacketReceiver } from "./network/client_receiver";
import { createAnimationManagers } from "./animation/animations";
import { createDebugContainer } from "./rendering/debug";

export type ClientSession = {
    readonly receiver: ClientPacketReceiver<
        typeof Schema.Server,
        ServerPacketMap
    >;
    readonly animations: {
        readonly UI: AnimationManager;
        readonly World: AnimationManager;
    };
    readonly debugContainer: Container;
};

/** Per-app session state — not process-wide module singletons. */
export function createClientSession(): ClientSession {
    const serverSerializer = new Serializer<
        typeof Schema.Server,
        ServerPacketMap
    >(Schema.Server);

    return {
        receiver: new ClientPacketReceiver(serverSerializer),
        animations: createAnimationManagers(),
        debugContainer: createDebugContainer(),
    };
}
