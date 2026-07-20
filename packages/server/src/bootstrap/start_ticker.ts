import { SERVER_TICK_MS } from "@bundu/shared";
import { SESSION_ENDED_CLOSE } from "@bundu/shared/session";
import type { World } from "../engine";
import { PlayerData } from "../components/player";
import { Leaderboard } from "../network/leaderboard";

type TickReceiver = {
    process(): void;
    clear(): void;
};

export async function startTicker(world: World, receiver: TickReceiver) {
    const {
        playerPacketManager,
        socketManager,
        worldPacketManager,
        dayCycle,
        pendingSessionEnds,
    } = world.context;
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
        dayCycle.update(world.gameTime, connectedPlayers, playerPacketManager);
        leaderboard.update(connectedPlayers, playerPacketManager, world);
        playerPacketManager.process(
            connectedPlayers,
            socketManager,
            worldPacketManager
        );
        playerPacketManager.clear();
        worldPacketManager.clear();
        receiver.clear();

        // Death closes after flush so the victim still gets this tick's packets.
        if (pendingSessionEnds.length > 0) {
            const ending = pendingSessionEnds.splice(0);
            for (const { playerId } of ending) {
                const socket = socketManager.getSocket(playerId);
                socketManager.deleteClient(playerId);
                socket?.close(SESSION_ENDED_CLOSE, "session ended");
            }
        }

        const elapsed = performance.now() - start;
        await Bun.sleep(Math.max(0, SERVER_TICK_MS - elapsed));
    }
}
