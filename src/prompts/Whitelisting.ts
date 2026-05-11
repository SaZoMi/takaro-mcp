import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerWhitelistingPrompt(server: McpServer): void {

  server.prompt(
    'build-whitelisting',
    'Scaffold a Takaro Whitelisting module that restricts server access to players with a specific permission',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Build a Takaro module called "Whitelisting" that restricts server access to players who have been granted the \`WHITELIST_ACCESS\` permission.

## What it does
- Listens for the \`player-connected\` event
- When a player connects, checks if they have the \`WHITELIST_ACCESS\` permission
- If they do not have it, kicks them with a configurable message

## Config
- \`kickMessage\` (string, default: "You do not have permission to join this server.") — message shown to kicked players

## Hook
- Name: \`whitelisting\`
- Event type: \`player-connected\`
- Logic: check \`checkPermission(pog, 'WHITELIST_ACCESS')\`; if false, kick the player with the configured \`kickMessage\`

## Permission
- \`WHITELIST_ACCESS\` — "Players with this permission can join the whitelisted server"; non-countable

## Implementation notes
- No commands or cronjobs
- Admins grant \`WHITELIST_ACCESS\` to a role via the Takaro UI or API; the module itself only enforces it
- Use \`TakaroUserError\` or the kick API to remove the player on connect if the permission check fails`,
          },
        },
      ],
    }),
  );
}
