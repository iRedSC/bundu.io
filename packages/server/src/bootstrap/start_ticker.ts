import { SERVER_TICK_MS } from "@bundu/shared";
import type { World } from "../engine";
import { PlayerData } from "../components/player";

type TickReceiver = {
    process(): void;
    clear(): void;
};

export async function startTicker(world: World, receiver: TickReceiver) {
    const { playerPacketManager, socketManager, worldPacketManager } =
        world.context;

    while (true) {
        const start = performance.now();

        receiver.process();

        world.update();

        playerPacketManager.process(
            world.query([PlayerData]),
            socketManager,
            worldPacketManager
        );
        playerPacketManager.clear();
        worldPacketManager.clear();
        receiver.clear();

        const elapsed = performance.now() - start;
        await Bun.sleep(Math.max(0, SERVER_TICK_MS - elapsed));
    }
}
