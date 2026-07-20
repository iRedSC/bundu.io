/**
 * Server debug / cheat surface. Gated by BUNDU_DEBUG=1 at call sites.
 */
export { SERVER_DEBUG } from "./flag.js";
export {
    tryHandleDebugChatCommand,
    buildCommandRegistry,
    effectiveOpLevel,
    emitCommandRegistry,
    emitCommandResult,
} from "./chat_commands.js";
