import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerBuffManagerPrompt(server: McpServer): void {

  server.prompt(
    'build-buff-manager',
    'Scaffold a Takaro BuffManager module for 7 Days to Die that applies configurable buff packages with role requirements, expiration tracking, and currency costs',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Build a Takaro module called "BuffManager" for 7 Days to Die that manages buff packages with role requirements, expiration tracking, currency costs, and automatic re-application.

## What it does
- Allows players to self-apply buff packages via \`/getbuff\`
- Admins can apply or remove buffs from any player via \`/buffplayer\` and \`/debuffplayer\`
- Buffs auto-apply on player connect if the package has \`autoApplyOnConnect: true\` and the player has the required role
- A maintenance cronjob periodically re-applies non-expired buffs to keep them active
- Each package can have a currency cost, cooldown, role restriction, and expiration duration

## Config

### buffPackages (array)
Each entry is a buff package with:
- \`commandName\` (string) — trigger word used in \`/getbuff <commandName>\`
- \`displayName\` (string) — friendly name shown to players
- \`description\` (string) — package description
- \`buffNames\` (array of strings) — buff codes from buffs.xml (case-sensitive)
- \`requiredRoleId\` (string, optional) — UUID of required Takaro role; empty = everyone
- \`durationMinutes\` (number) — expiry in minutes; 0 = never expires
- \`autoApplyOnConnect\` (boolean) — auto-grant when player connects
- \`currencyCost\` (number) — currency deducted on use
- \`cooldownSeconds\` (number) — per-player cooldown between uses

### maintenanceEnabled (boolean, default: true)
Enables the periodic buff renewal cronjob.

### maintenanceInterval (string/cron, default: \`*/15 * * * *\`)
How often the maintenance cronjob runs.

## Commands

### /getbuff
- Trigger: \`getbuff\`
- Argument: \`packageName\` (string, position 0, optional)
- No permission required (package-level role restriction applies)
- No arg → list available packages the player qualifies for
- With arg → validate role, cooldown, currency; deduct cost; apply buffs; store expiry timestamp

### /buffplayer
- Trigger: \`buffplayer\`
- Arguments: \`playerName\` (string, position 0), \`packageName\` (string, position 1)
- Permission: \`BUFF_ADMIN\`
- Apply any buff package to a named player, bypassing role/cost/cooldown checks

### /debuffplayer
- Trigger: \`debuffplayer\`
- Arguments: \`playerName\` (string, position 0), \`packageName\` (string, position 1, optional)
- Permission: \`BUFF_ADMIN\`
- Remove buff tracking for a specific package, or all packages if none specified

## Hook
- Name: auto-apply buff packages
- Event type: \`player-connected\`
- Logic: iterate all packages with \`autoApplyOnConnect: true\`; check \`requiredRoleId\` if set; apply qualifying buffs and store expiry timestamps

## Cronjob
- Name: checkBuffPackages
- Schedule: driven by \`maintenanceInterval\` config (default \`*/15 * * * *\`)
- Logic: if \`maintenanceEnabled\`, scan all online players; for each player re-apply any packages whose stored expiry timestamp has not yet passed

## Permission
- \`BUFF_ADMIN\` — "Can manage and apply any buff package"; non-countable

## Implementation notes
- Store buff state as variables scoped to playerId + gameServerId + moduleId, keyed like \`buff_expiry:{playerId}:{packageName}\`; value is the expiry ISO timestamp (or null for never-expires)
- Use the 7 Days to Die \`debuff\`/\`buff\` console commands via \`executeServerCommand\` to apply/remove buffs
- Buff names must match buffs.xml exactly (case-sensitive); pass them through without transformation
- Role check: compare \`requiredRoleId\` against the player's assigned roles via the Takaro API
- Cooldown: store last-used timestamp per player per package in a variable and compare before allowing reuse`,
          },
        },
      ],
    }),
  );
}
