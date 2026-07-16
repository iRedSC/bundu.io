import { SERVER_TICK_MS } from "@bundu/shared";
import type { World } from "../engine";
import { PlayerData } from "../components/player";
import { Leaderboard } from "../network/leaderboard";

type TickReceiver = {
    process(): void;
    clear(): void;
};

export async function startTicker(world: World, receiver: TickReceiver) {
    const { playerPacketManager, socketManager, worldPacketManager } =
        world.context;
    const leaderboard = new Leaderboard();

    while (true) {
        const start = performance.now();

        receiver.process();

        // Exactly one fixed sim step per flush — never 0/2/3 catch-up moves.
        world.step(SERVER_TICK_MS);

        const players = world.query([PlayerData]);
        const connectedPlayers = players.filter((player) =>
            socketManager.getSocket(player.id)
        );
        leaderboard.update(connectedPlayers, playerPacketManager);
        playerPacketManager.process(
            connectedPlayers,
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
