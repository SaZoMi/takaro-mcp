import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerChatBridgePrompt(server: McpServer): void {

  server.prompt(
    'build-chat-bridge',
    'Scaffold a Takaro chatBridge module that relays messages between in-game chat and a Discord channel',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `## Overview

The \`chatBridge\` module connects game server chat to a Discord channel (and vice versa). When players talk in-game, their messages appear in Discord; when Discord members type in the linked channel, their messages appear in-game. This is one of the highest-value modules for community building — it keeps Discord active even when members aren't playing, and helps server admins monitor chat without being logged in.

## Proposed Feature Set

### Hooks
- \`GameToDiscord\` — relay in-game chat messages to a configured Discord channel
- \`DiscordToGame\` — relay Discord messages from a linked channel into the game
- \`PlayerConnected\` — optionally announce joins to Discord
- \`PlayerDisconnected\` — optionally announce leaves to Discord

### Configuration
- \`discordChannelId\` (string, required) — the Discord channel to bridge to
- \`sendPlayerConnected\` (boolean, default: true) — post join messages to Discord
- \`sendPlayerDisconnected\` (boolean, default: true) — post leave messages to Discord
- \`filterCommands\` (boolean, default: true) — suppress command messages (starting with \`/\`) from being relayed, to avoid spamming Discord with \`/tp\`, \`/give\` etc.
- \`commandPrefixes\` (array of strings, default: \`["/"]\`) — customize what counts as a command for filtering purposes
- \`filterSystemMessages\` (boolean, default: false) — suppress automated/system messages from relay

### Product Enhancement Ideas
- **Message formatting**: Format relayed messages with a consistent template, e.g. \`[🎮 ServerName] PlayerName: message\` in Discord, and \`[Discord] Username: message\` in-game, so both sides know where messages originated.
- **Monitoring channel**: Optional secondary Discord channel for verbose/debug output (all messages including filtered ones). Useful for admins.
- **Bidirectional on/off toggle**: Config flags to make the bridge one-way only (game→Discord, or Discord→game) for servers that want broadcast-only behavior.

## Acceptance Criteria
- [ ] In-game chat messages appear in the configured Discord channel
- [ ] Discord messages from the linked channel appear in-game
- [ ] Join/leave announcements are sent to Discord (configurable)
- [ ] Command messages are filtered from relay by default
- [ ] All config options are respected

## References
- Built-in module on Takaro: \`chatBridge\`
- Takaro Discord integration docs: https://docs.takaro.io/advanced/discord-integration/

## Testing notes
- The \`GameToDiscord\`, \`PlayerConnected\`, and \`PlayerDisconnected\` hooks can be structurally verified but require a real Discord channel ID and a connected game server to confirm delivery.
- The \`DiscordToGame\` hook is triggered by an incoming Discord event — it cannot be exercised without a live Discord integration. Implement it correctly and note in comments that live testing requires a configured Discord bot.
- Focus verification on: correct module.json structure, hook event types, config schema, and that the relay logic reads \`discordChannelId\` from userConfig before attempting any send.`,
          },
        },
      ],
    }),
  );
}
