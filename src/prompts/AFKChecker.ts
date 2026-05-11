import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerAFKCheckerPrompt(server: McpServer): void {

  server.prompt(
    'build-afk-checker',
    'Scaffold a Takaro AFKChecker module that detects and kicks inactive players',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Build a Takaro module called "AFKChecker" that automatically kicks AFK players.

## What it does
- Runs on a cron schedule (every 5 minutes by default)
- Tracks how many consecutive checks each online player has been idle
- Sends a warning message before kicking
- Kicks the player when they exceed the configured number of checks
- Players with the AFK_IMMUNITY permission are skipped

## Config schema (module.json)
- minutesBeforeKick (number, default 5) — interval in minutes; should match the cron schedule
- maxAfkChecks (number, default 3) — consecutive idle checks before kick. Total AFK time = minutesBeforeKick × maxAfkChecks
- kickMessage (string) — message shown to kicked player. Supports {minutesAfk} and {minutesUntilKick} placeholders
- sendWarning (boolean, default true) — whether to warn before kicking
- warningMessage (string) — warning message. Supports {minutesAfk} and {minutesUntilKick} placeholders
- globalAnnouncement (boolean, default false) — broadcast warnings/kicks to the whole server

## Permissions
- AFK_IMMUNITY — players with this permission are skipped entirely

## Cronjob
- Name: afkChecker
- Schedule: */5 * * * *
- Description: "checks for afk"

## Implementation notes
- Use a variable (scoped to gameServerId + moduleId) to store a JSON map of playerId → checkCount
- On each cron tick, fetch online players, increment their count, warn or kick as appropriate
- Reset a player's count to 0 on any chat-message or player activity hook if you add one
- Use checkPermission(pog, 'AFK_IMMUNITY') to skip immune players
- Use pog.pm() for private messages, takaro.gameserver.gameServerControllerSendMessage() for global announcements
- Use TakaroUserError only for player-facing errors; log internals with console.log`,
          },
        },
      ],
    }),
  );
}
