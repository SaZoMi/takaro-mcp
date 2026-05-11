import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerHighPingKickerPrompt(server: McpServer): void {

  server.prompt(
    'build-high-ping-kicker',
    'Scaffold a Takaro highPingKicker module that auto-kicks players with excessive latency',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `## Overview

The \`highPingKicker\` module monitors player ping and automatically kicks players whose latency exceeds a configured threshold. High-ping players degrade the experience for everyone on a server — they cause rubber-banding, desync, and unfair advantages in PvP. This module automates what admins used to do manually, with a configurable warning system so players get a fair chance to improve their connection before being removed.

## Proposed Feature Set

### Cronjob
- Runs on a configurable interval (e.g. every 30 seconds) to check all connected players' ping values

### Configuration
- \`maxPing\` (number, default: 200) — kick threshold in milliseconds
- \`checkInterval\` (string/cron, default: \`"*/30 * * * * *"\`) — how often to check ping
- \`warningCount\` (number, default: 3) — number of warnings before kicking
- \`warningMessage\` (string) — message sent to the player on each warning (should include current ping and threshold)
- \`kickMessage\` (string) — message sent when the player is kicked
- \`gracePeriod\` (number, default: 60) — seconds after connect before the player is subject to ping checks (gives their connection time to stabilize)

### Permissions
- \`HIGH_PING_KICKER_BYPASS\` — players with this permission are never checked or kicked (for admins, streamers, or VIPs on mobile connections)

### Product Enhancement Ideas
- **Warning escalation**: Rather than a uniform warning message, escalate tone: first warning is informational ("Your ping is high"), second is a caution ("You may be kicked soon"), third is a final notice. Helps players understand the urgency without being jarring.
- **Rolling average**: Instead of checking instant ping (which can spike briefly), compute a rolling average over the last N samples before issuing a warning. This avoids false positives from momentary network blips.
- **Discord admin notification**: When a player is actually kicked (not just warned), send a Discord notification with player name, average ping, and game server. Helps admins track whether the threshold is tuned correctly.
- **Soft cap vs hard cap**: Two thresholds — a "warning" threshold and a "kick" threshold. Players above warning-threshold get warnings, players above kick-threshold get immediately removed without warnings. Handles both "slow but playable" and "completely unplayable" cases.

## Acceptance Criteria
- [ ] Players above \`maxPing\` receive a warning message
- [ ] Players are kicked after \`warningCount\` consecutive warnings without improvement
- [ ] \`gracePeriod\` is respected — new players are not checked immediately
- [ ] Players with \`HIGH_PING_KICKER_BYPASS\` permission are never warned or kicked
- [ ] Kick message is sent to the player before removal

## References
- Built-in module on Takaro: \`highPingKicker\`

## Testing notes
- Ping values come from live game server data — there is no way to simulate a high-ping player without a real connected player whose latency exceeds \`maxPing\`.
- The \`gracePeriod\` logic is time-dependent and cannot be verified without waiting or mocking time.
- Focus verification on: correct module.json structure, config schema, that \`HIGH_PING_KICKER_BYPASS\` is checked before any action, and that the warning counter is stored and incremented correctly in variables.
- The kick action itself requires a live game server connection to confirm execution.`,
          },
        },
      ],
    }),
  );
}
