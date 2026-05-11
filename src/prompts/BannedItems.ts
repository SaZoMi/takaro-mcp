import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerBannedItemsPrompt(server: McpServer): void {

  server.prompt(
    'build-banned-items',
    'Scaffold a Takaro BannedItems module that detects and punishes players carrying prohibited items',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Build a Takaro module called "BannedItems" that automatically enforces item restrictions on a game server.

## What it does
- Runs a cron job every 5 minutes to check all online players for prohibited items
- Applies a configurable punishment per item: warn, kick, ban, or arrest
- Supports per-item immunity tiers via permissions (admin, vip, moderator, patreon, donor, trusted)
- Sends Discord alerts when enforcement actions occur
- The core check logic lives in a shared function imported by the cronjob

## Config schema (module.json)
- bannedItems (array) — list of banned item definitions, each with: itemName (string), punishmentType (warn/kick/ban/arrest), maxWarnings (number), immunityPermissions (array of permission keys)
- banDuration (number, ms, default 86400000) — how long bans last when punishmentType is 'ban'
- kickMessage (string) — shown to kicked player; supports {item} placeholder
- banMessage (string) — shown to banned player; supports {item} placeholder
- warningMessage (string) — shown as warning; supports {item} placeholder
- arrestMessage (string) — shown on arrest; supports {pname} and {item} placeholders
- discordKickMessage (string) — Discord message on kick; supports {pname} and {item}
- discordBanMessage (string) — Discord message on ban; supports {pname} and {item}
- discordArrestMessage (string) — Discord message on arrest; supports {pname} and {item}
- discordWarningMessage (string) — Discord message on warning; supports {pname}, {item}, {warnings}, {maxWarnings}
- cheaterDetected (string) — Discord channel ID to send alerts to

## Permissions (6 immunity tiers, non-countable)
- banned_items_immunity_admin
- banned_items_immunity_vip
- banned_items_immunity_moderator
- banned_items_immunity_patreon
- banned_items_immunity_donor
- banned_items_immunity_trusted

## Cronjob
- Name: CheckBannedItems
- Schedule: */5 * * * *
- Calls the shared CheckBannedItems function

## Shared function
- Name: CheckBannedItems
- Checks all online players for banned items and applies warnings or punishments
- Import inside cronjob as: import { CheckBannedItems } from './utils';

## Implementation notes
- Use takaro.playerOnGameserver search to get online players and their inventory
- For each player, check their items against the bannedItems config array
- Skip players who have any of the item's immunityPermissions using checkPermission(pog, permission)
- Track warning counts per player per item using variables (scoped to gameServerId + moduleId)
- For 'ban' punishment use the Takaro ban API with the configured banDuration
- Send Discord alerts via the integration tools when cheaterDetected channel ID is set
- Use pog.pm() for player-facing messages, substituting placeholders before sending`,
          },
        },
      ],
    }),
  );
}
