import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerLobbyAndBackPrompt(server: McpServer): void {

  server.prompt(
    'build-lobby-and-back',
    'Scaffold a Takaro lobbyandback module that teleports players to a lobby and back to their previous position',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Build a Takaro module called "lobbyandback" that provides two teleport commands: one to a fixed lobby location, and one to return to the player's previous position.

## What it does
- \`/lobby\` saves the player's current coordinates and teleports them to a fixed lobby position (0, 40, 0)
- \`/back\` teleports the player to their previously saved coordinates, then deletes the saved location (single-use per lobby visit)

## Commands

### /lobby
- Trigger: \`lobby\`
- Description: "Teleports you to (0,40,0) and saves your current spot for a single-use /back."
- Arguments: none
- Permission: \`LOBBY_TELEPORT_USE\`
- Logic: read player's current position, save it as a variable, teleport player to (0, 40, 0)

### /back
- Trigger: \`back\`
- Description: "Teleports you back once to your last saved spot. After use, the saved spot is deleted."
- Arguments: none
- Permission: \`BACK_TELEPORT_USE\`
- Logic: read the saved position variable, teleport player there, delete the variable. If no saved position exists, inform the player with a TakaroUserError.

## Permissions
- \`LOBBY_TELEPORT_USE\` — required to use \`/lobby\`
- \`BACK_TELEPORT_USE\` — required to use \`/back\`

Both permissions are non-countable.

## Config
No configuration — the lobby coordinates are hardcoded to (0, 40, 0).

## Implementation notes
- Save the player's position using a variable scoped to playerId + gameServerId + moduleId with a key like \`lobby_saved_pos\`
- Store coordinates as JSON: \`{ x, y, z }\`
- Use the Takaro teleport API to move the player
- Delete the variable after \`/back\` is used so the command cannot be reused until \`/lobby\` is called again`,
          },
        },
      ],
    }),
  );
}
