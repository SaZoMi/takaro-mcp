import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerServerMessagesPrompt(server: McpServer): void {

  server.prompt(
    'build-server-messages',
    'Scaffold a Takaro serverMessages module that sends rotating announcements to all players on a schedule',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `## Overview

The \`serverMessages\` module sends a rotating sequence of messages to all players on a schedule. It's one of the simplest but most practically useful modules — admins configure a list of announcements (rules, Discord links, event reminders, tips) and the module broadcasts them in rotation. Players who missed the last announcement will see it next cycle, and the server feels alive even during quiet periods.

## Proposed Feature Set

### Cronjob
- Fires on a configurable interval and sends the next message in the rotation to all connected players

### Configuration
- \`messages\` (array of strings, required) — the list of messages to rotate through. Supports template variables like \`{serverName}\`, \`{playerCount}\`.
- \`interval\` (string/cron, default: \`"*/15 * * * *"\`) — how often to send a message (every 15 minutes by default)
- \`order\` (string enum: \`"sequential"\` | \`"random"\`, default: \`"sequential"\`) — cycle through messages in order, or pick randomly each time

### Product Enhancement Ideas
- **Dynamic variables in messages**: Support built-in variables that resolve at send time: \`{playerCount}\` (current online count), \`{serverName}\`, \`{nextEvent}\` (if an event system exists). Makes announcements feel dynamic rather than canned.
- **Priority messages**: Allow some messages to be marked as high-priority and appear more frequently in the rotation (e.g. a rule that's particularly important). A simple weight field per message would handle this.
- **Minimum player threshold**: Only send messages if at least N players are online. Sending server announcements to an empty server is pointless and wastes log space.
- **Rich formatting**: Support color codes or bold/italic markers (game-dependent) in messages so important announcements visually stand out from regular chat. Even a simple \`[SERVER]\` prefix in a distinct color helps.
- **Skip if no players**: Silently skip the cronjob tick if no players are currently connected, rather than firing and doing nothing. Small efficiency improvement, but also avoids log noise.

## Acceptance Criteria
- [ ] Messages are broadcast to all connected players at the configured interval
- [ ] Sequential mode cycles through messages in order, wrapping back to the start
- [ ] Random mode selects messages non-deterministically
- [ ] No messages are sent if \`messages\` array is empty
- [ ] Interval is configurable via cron expression

## References
- Built-in module on Takaro: \`serverMessages\``,
          },
        },
      ],
    }),
  );
}
