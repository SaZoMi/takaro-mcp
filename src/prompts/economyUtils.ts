import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerEconomyUtilsPrompt(server: McpServer): void {

  server.prompt(
    'build-economy-utils',
    'Scaffold a Takaro economyUtils module that gives players in-game commands to manage their currency',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `## Overview

The \`economyUtils\` module gives players a set of commands to interact with Takaro's built-in economy system. Without this module, currency exists as a backend concept but players have no in-game way to check their balance, send money to friends, or see who's richest on the server. This module is the player-facing layer on top of the economy system.

## Proposed Feature Set

### Commands
- \`/balance\` — show the player their current currency balance
- \`/pay <player> <amount>\` — transfer currency to another online player
- \`/richlist\` — show a leaderboard of the top N wealthiest players on the server (configurable count)

### Configuration
- \`transferTax\` (number, default: 0) — percentage taken as a fee on \`/pay\` transfers (e.g. 5 = 5%). Useful for servers that want a currency sink.
- \`richlistSize\` (number, default: 10) — how many players to show on the leaderboard
- \`minTransferAmount\` (number, default: 1) — minimum amount for a transfer, to prevent spam

### Permissions
- \`ECONOMY_UTILS_TRANSFER\` — required to use \`/pay\`. Lets admins disable transfers if desired (e.g. during events or for free-to-play servers).

### Product Enhancement Ideas
- **Transfer confirmation**: For large transfers (configurable threshold), require the sending player to confirm with a second command before the currency moves. Prevents mis-typed amounts wiping someone's balance.
- **Transfer history**: A \`/transactions\` command showing the last N sends/receives for the player — useful for dispute resolution and gives players a sense of their economic activity.
- **Balance formatting**: Auto-format large numbers with commas or abbreviations (10,000 → \`10k\`) so the output stays readable regardless of inflation.
- **Self-pay guard**: Prevent players from paying themselves (currently possible if not explicitly blocked, which just creates confusing no-op transactions).

## Acceptance Criteria
- [ ] \`/balance\` shows the player's current balance
- [ ] \`/pay\` transfers currency between players with validation (sufficient funds, valid target, above minimum)
- [ ] \`/richlist\` shows the top N players by balance
- [ ] Transfer tax is applied and the fee amount is shown in the confirmation message
- [ ] Players without \`ECONOMY_UTILS_TRANSFER\` permission cannot use \`/pay\`

## References
- Built-in module on Takaro: \`economyUtils\`
- Takaro economy docs: https://docs.takaro.io/economy/`,
          },
        },
      ],
    }),
  );
}
