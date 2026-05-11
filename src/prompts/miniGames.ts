import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerMiniGamesPrompt(server: McpServer): void {

  server.prompt(
    'build-mini-games',
    'Scaffold a Takaro miniGames module with daily puzzles (Wordle, Hangman, Hot/Cold) and live chat rounds (Trivia, Scramble, Math race, Reaction race)',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `# Unified \`miniGames\` Module — Design & Build Plan

## Summary

A single Takaro module that bundles seven skill-based mini-games under one roof: three async daily puzzles (Wordle, Hangman, Hot/Cold) and four live chat rounds (Trivia, Scramble, Math race, Reaction race). Everything routes through a shared **scorer** that awards points, optionally converts points to currency, enforces daily caps, applies a count-based boost-tier permission, and emits big-score events. Content for Wordle, Hangman/Scramble, and Trivia lives in module **variables** (not \`userConfig\`) so admins can paste large banks in without schema-editor pain and without needing to re-version the module. Trivia also supports live Open Trivia Database (OpenTDB) fetches as an alternative to the local bank, lifted from the existing \`7dtd_triviaTime\` module.

The architectural pattern mirrors \`casino\`: one shared keystone helper (ledger → scorer), one config surface, per-server only, chat-native everything.

## Existing module overlap

- **\`7dtd_triviaTime\`** (https://modules.takaro.io/module/7dtd_triviaTime/latest) — standalone trivia module for 7 Days to Die. Uses OpenTDB API, supports sound effects, items-as-rewards. \`miniGames\` deliberately overlaps because unified cross-game stats, shared boost-tier permission, shared daily-point cap, and shared leaderboard are the product. We reuse OpenTDB under the hood so content parity is preserved. **Recommendation:** install one, not both — the \`/answer\` trigger collides. \`7dtd_triviaTime\` remains the right pick for admins who want 7D2D-specific sound integration and item rewards *only* on trivia; \`miniGames\` is for admins who want the integrated multi-game experience across any supported game.
- **\`Hangman\`** (https://modules.takaro.io/module/Hangman/latest) — exists in the community module library. \`miniGames\` absorbs its role. Recommendation: uninstall the standalone \`Hangman\` before installing \`miniGames\`.
- **Other existing mini-games** in the community library (\`8ball\`, etc.) don't conflict functionally — \`8ball\` isn't a scored game.
- **\`casino\`** — gambling (stake-based, chance). \`miniGames\` is skill-based (no stake). They're complementary; both can be installed on the same server.

## Key design decisions (locked)

- **One module, seven games.** Three async daily, four live rounds.
- **Per-server only.** No cross-server aggregation in v1.
- **Points, not currency, are the primary reward.** Optional currency conversion via \`pointsToCurrencyRate\`. \`rate=0\` disables currency output entirely.
- **Content in module variables, not \`userConfig\`.** Lazy-created empty on first read; admins paste banks via the Takaro UI Variables tab or MCP \`variableUpdate\`. Keeps config schema tiny; avoids re-version churn when admins edit word lists.
- **Trivia has two sources:** OpenTDB API (default) with automatic fallback to \`minigames_content_trivia\` variable on any failure. Lifted from \`7dtd_triviaTime\`.
- **Live rounds run on a hybrid cronjob cadence.** Automatic, gated by a minimum online-player count, single shared interval with random game pick.
- **Single active live round at a time.** Shared \`/answer\` command dispatches based on the active round's game.
- **Reaction race uses a \`chat-message\` hook,** not a slash command — racing to type raw chat is the point.
- **Boost tier via count-based permission** (\`MINIGAMES_BOOST\`). Count 1–4 → +25% per tier, capped at 2.0×.
- **Daily point cap at UTC rollover.** Fixed windows, O(1) enforcement.
- **Chat-native everything.** Emoji-prefixed, one-line-per-action where possible.

## Module identity

- **Name:** \`miniGames\`
- **Author:** Takaro (community contribution)
- **supportedGames:** \`all\`
- **Description:** "Unified mini-games module with daily puzzles (Wordle, Hangman, Hot/Cold) and live chat rounds (Trivia, Scramble, Math race, Reaction race). Skill-based, point-scoring, optional currency/item rewards, boost tiers, cross-game leaderboards."

## userConfig (admin-facing — behavioural knobs only, no content)

\`\`\`jsonc
{
  "liveRoundIntervalMinutes":   { "type": "number", "default": 30, "minimum": 5 },
  "minPlayersForLiveRound":     { "type": "number", "default": 2,  "minimum": 1 },
  "liveRoundAnswerWindowSec":   { "type": "number", "default": 60, "minimum": 15,
                                  "description": "How long players have to answer a live round." },

  "pointsToCurrencyRate":       { "type": "number", "default": 0,
                                  "description": "Currency paid per point. 0 disables currency rewards." },
  "dailyPointsCapPerPlayer":    { "type": "number", "default": 0,
                                  "description": "Max points per UTC day per player. 0 = unlimited." },
  "bigScoreThreshold":          { "type": "number", "default": 500,
                                  "description": "Scores at/above this emit a chat+Discord announcement." },

  "pointsWordleBase":           { "type": "number", "default": 100 },
  "pointsHangmanBase":          { "type": "number", "default": 80 },
  "pointsHotColdBase":          { "type": "number", "default": 60 },
  "pointsTriviaWin":            { "type": "number", "default": 40 },
  "pointsScrambleWin":          { "type": "number", "default": 40 },
  "pointsMathRaceWin":          { "type": "number", "default": 40 },
  "pointsReactionRaceWin":      { "type": "number", "default": 20 },

  "triviaQuestionSource":       { "type": "string", "enum": ["api", "custom"], "default": "api",
                                  "description": "Trivia source. 'api' fetches from Open Trivia DB; falls back to custom bank on failure." },
  "triviaApiCategory":          { "type": "array",  "default": ["any"],
                                  "items": { "type": "string" },
                                  "description": "OpenTDB category keys. ['any'] = no category filter. Multiple = random pick per round." },
  "triviaApiDifficulty":        { "type": "string", "enum": ["any","easy","medium","hard"], "default": "any" },
  "triviaApiType":              { "type": "string", "enum": ["any","multiple","boolean"], "default": "any" },

  "games": {
    "type": "object",
    "properties": {
      "wordle":       { "type": "boolean", "default": true },
      "hangman":      { "type": "boolean", "default": true },
      "hotcold":      { "type": "boolean", "default": true },
      "trivia":       { "type": "boolean", "default": true },
      "scramble":     { "type": "boolean", "default": true },
      "mathrace":     { "type": "boolean", "default": true },
      "reactionrace": { "type": "boolean", "default": true }
    }
  }
}
\`\`\`

Cronjob schedules live in \`systemConfig.cronJobs.<name>.temporalValue\` as always. Defaults shown under Cronjobs below.

## Permissions

| Permission | canHaveCount | Purpose |
|---|---|---|
| \`MINIGAMES_PLAY\` | no | Allowed to play. Default-on for all roles. |
| \`MINIGAMES_BOOST\` | **yes** | Point multiplier tier. Count 1–4, each +25%. Tier 1=1.25×, 2=1.5×, 3=1.75×, 4=2.0× (cap). |
| \`MINIGAMES_MANAGE\` | no | Admin commands (ban, reset, skip round, fire round, report). |
| \`MINIGAMES_BANNED\` | no | Explicit play-ban (set by \`/minigamesban\`). Temporary bans stored as variable with expiry, cronjob sweeps. |

## Commands

### Player
| Command | Args | Purpose |
|---|---|---|
| \`minigames\` | \`[game?]\` | Help/overview. If \`game\` given, show that game's rules. |
| \`wordle\` | \`[guess?]\` | No arg → show today's attempts. With 5-letter arg → submit guess. |
| \`hangman\` | \`[letterOrWord?]\` | No arg → show board + letters tried. Letter → guess letter. Word → solve attempt. |
| \`hotcold\` | \`[number?]\` | No arg → show attempts left + warmth trail. Number 1–1000 → guess. |
| \`answer\` | \`<response>\` | Universal answer for the currently-active live round. Dispatches on \`minigames_active_round.game\`. |
| \`minigamestats\` | \`[player?]\` | Lifetime + current-window stats across all games. |
| \`minigamestop\` | \`<points\|wordle\|hangman\|streak>\` | Leaderboards (from cache). |
| \`puzzle\` | — | Status of today's async puzzles: has-played flags, time until rollover. |

### Admin (\`MINIGAMES_MANAGE\`)
| Command | Args | Purpose |
|---|---|---|
| \`minigamesban\` | \`<player> [hours?]\` | Ban (permanent if hours omitted). |
| \`minigamesunban\` | \`<player>\` | Clear ban. |
| \`minigamesresetstats\` | \`<player>\` | Wipe one player's lifetime stats. |
| \`minigamesskiproundnow\` | — | Cancel the currently active live round (no winner, no points). |
| \`minigamesfirenow\` | \`[game?]\` | Fire a live round immediately (optionally pick the game). |
| \`minigamesreport\` | \`[days=7]\` | PM: total rounds, total points awarded, top 5, per-game breakdown. |

Multi-step async games (\`wordle\`, \`hangman\`, \`hotcold\`) use the same command for status and action — no-arg shows state, arg submits guess. Matches how real Wordle implementations feel.

## Hooks

| Hook | Event | Purpose |
|---|---|---|
| \`onChatMessage\` | \`chat-message\` | **Reaction race catch-all.** When a reaction round is active, any chat message whose trimmed-lowercased text equals the round's trigger token wins. Ignored if no reaction round is active or if the message comes from a non-player source. |
| \`onPlayerDisconnect\` | \`player-disconnected\` | Soft cleanup: async puzzle sessions persist (player can resume on reconnect); live rounds continue unless the disconnecting player was the only eligible participant. No refund logic — points aren't staked. |

Trivia/Scramble/Math race answers come through the \`/answer\` command, not a hook — slash commands give us permission checks, cooldowns, and execution events for free. Reaction race is the only game where raw chat typing is the answer.

## Cronjobs

| Name | Default schedule | Purpose |
|---|---|---|
| \`rolloverDailyPuzzles\` | \`0 0 * * *\` | At UTC midnight: pick a new Wordle word from \`minigames_content_wordle.words\` (filtered: 5 letters, a–z), a new Hangman word from \`minigames_content_wordlist.words\`, a new Hot/Cold secret number. Write to \`minigames_puzzle_today\`. Clear yesterday's per-player session variables. If a content bank is empty, skip that game and post a once-per-day admin warning to chat naming the variable key. |
| \`fireLiveRound\` | \`*/5 * * * *\` | Check if \`liveRoundIntervalMinutes\` elapsed since last fire AND \`currentPlayerCount >= minPlayersForLiveRound\`. If so, pick a random enabled live game, generate its prompt, write \`minigames_active_round\`, announce to chat. Update \`minigames_last_round_firedAt\`. |
| \`closeLiveRound\` | \`* * * * *\` | Read \`minigames_active_round\`. If expired with no winner, close it, announce "nobody got it, the answer was X", clear the variable. |
| \`refreshLeaderboards\` | \`*/5 * * * *\` | Scan \`minigames_stats:*\`, recompute top-10s, write to \`minigames_leaderboard_cache\`. |
| \`expireWindows\` | \`0 0 * * *\` | Delete \`minigames_window:*\` older than the prior UTC day — needed for the daily cap. |
| \`expireBans\` | \`0 * * * *\` | Remove temporary bans whose expiry has passed. |

**Why \`fireLiveRound\` ticks every 5 min rather than on the configured interval directly:** the admin's \`liveRoundIntervalMinutes\` is an *elapsed time* check, not a cron expression. A 5-minute tick is granular enough to respect any interval ≥ 5 min without exposing a second cron knob. Same pattern \`dailyRewards\` uses for streak windows.

## The scorer (architectural keystone)

Takaro module components do NOT share code across files — \`module.functions[]\` in every built-in is essentially a holding pen; runtime-sharing isn't real. So the "shared scorer" is **a fixed code block injected at the top of every game component at build time**. Call it \`SCORER_PRELUDE\`. Games declare \`scorer.checkBanAndCap\` and \`scorer.award\` as local functions inside \`main()\`.

### \`scorer.checkBanAndCap({ playerId, gameServerId })\` → throws or returns \`{ remainingToday }\`
1. Read \`minigames_ban:{playerId}\` → throw \`TakaroUserError\` if present and not expired.
2. Read \`userConfig.dailyPointsCapPerPlayer\`. If \`0\`, return \`{ remainingToday: Infinity }\`.
3. Read \`minigames_window:{playerId}:{YYYY-MM-DD}\`; return \`remainingToday = cap − earned\`. If \`<= 0\`, throw \`TakaroUserError("You've hit today's point cap — try again after UTC midnight.")\`.

Called at the start of every async puzzle attempt and at live-round win-settlement. Live-round *participation* doesn't block on the cap (players can still type guesses), but the winner's award is clipped to \`remainingToday\`.

### \`scorer.award({ playerId, gameServerId, game, points, context })\` → \`{ actualPoints, currencyPaid, newTotal }\`
1. Read \`MINIGAMES_BOOST\` tier via \`checkPermission(pog, 'MINIGAMES_BOOST')?.count ?? 0\`. Multiplier = \`1 + min(tier, 4) × 0.25\`.
2. \`boostedPoints = round(points × multiplier)\`.
3. Clip to \`remainingToday\` from \`checkBanAndCap\`.
4. Write \`minigames_window:{playerId}:{YYYY-MM-DD}\`: \`earned += actualPoints\`.
5. Update \`minigames_stats:{playerId}\`: increment \`totalPoints\`, \`perGame[game].{points,plays,wins}\`, update \`biggestScore\` if beaten, update \`streaks\` (consecutive-day Wordle streak, etc).
6. If \`userConfig.pointsToCurrencyRate > 0\`: \`currencyPaid = round(actualPoints × rate)\`; call \`playerOnGameServerControllerAddCurrency\`. Else \`currencyPaid = 0\`.
7. If \`actualPoints >= bigScoreThreshold\`: emit custom event \`minigames-big-score\` with \`{playerId, game, points, context}\` — \`chatBridge\` relays to Discord.
8. Return for the caller to echo in chat.

No \`placeBet\`/\`refund\` equivalents — nothing is staked; nothing to return.

### Scoring formulas

- **Wordle:** solved in \`n\` guesses (n ∈ 1..6) → \`points = round(pointsWordleBase × (7 − n) / 6)\`. 1 guess = base × 1.00, 6 guesses = base × 0.17. Unsolved = 0.
- **Hangman:** solved with \`w\` wrong letters (max 6) → \`points = round(pointsHangmanBase × (7 − w) / 7)\`. Unsolved = 0.
- **Hot/Cold:** solved in \`n\` guesses (max 8) → \`points = round(pointsHotColdBase × (9 − n) / 8)\`. Unsolved = 0.
- **Trivia / Scramble / Math race / Reaction race:** winner gets flat \`pointsXxxWin\`; no partial credit.

All scores pass through \`scorer.award\` so boost tiers and daily cap apply uniformly.

### OpenTDB helpers in \`SCORER_PRELUDE\`

\`SCORER_PRELUDE\` also carries the OpenTDB category map (lifted from \`7dtd_triviaTime\`) and a \`decodeHtmlEntities\` helper, so the \`fireLiveRound\` cronjob can build API URLs and clean up responses:

\`\`\`js
const OPENTDB_CATEGORIES = {
  general_knowledge: 9, books: 10, film: 11, music: 12, musicals_theatres: 13,
  television: 14, video_games: 15, board_games: 16, science_nature: 17,
  computers: 18, mathematics: 19, mythology: 20, sports: 21, geography: 22,
  history: 23, politics: 24, art: 25, celebrities: 26, animals: 27,
  vehicles: 28, comics: 29, gadgets: 30, anime_manga: 31, cartoon_animations: 32
};
function decodeHtmlEntities(s) { /* handles &amp; &quot; &#039; &eacute; etc. */ }
\`\`\`

## Variables (all scoped to \`moduleId + gameServerId\`)

| Key | Shape | Lifetime |
|---|---|---|
| \`minigames_content_wordle\` | \`{ words: string[] }\` | permanent; admin-managed; lazy-created empty on first access |
| \`minigames_content_wordlist\` | \`{ words: string[] }\` — shared by Hangman + Scramble | permanent; admin-managed; lazy-created empty |
| \`minigames_content_trivia\` | \`{ questions: Array<{question, options: string[4], answerIndex: number}> }\` OR \`{ questions: Array<{question, answer: string, incorrectAnswers?: string[], type?: 'multiple'\|'boolean'}> }\` | permanent; admin-managed; lazy-created empty. Both shapes accepted on read (normalised). |
| \`minigames_puzzle_today\` | \`{ date: "YYYY-MM-DD", wordle?: string, hangman?: string, hotcold?: number }\` | rewritten daily by \`rolloverDailyPuzzles\` |
| \`minigames_session:{playerId}:wordle\` | \`{ guesses: string[], solved: boolean, completedAt? }\` | cleared at UTC rollover |
| \`minigames_session:{playerId}:hangman\` | \`{ lettersTried: string[], wrongCount: number, solved: boolean, completedAt? }\` | cleared at UTC rollover |
| \`minigames_session:{playerId}:hotcold\` | \`{ guesses: number[], solved: boolean, completedAt? }\` | cleared at UTC rollover |
| \`minigames_active_round\` | \`{ game, prompt, answer, answerType: 'text'\|'number'\|'rawchat', displayedOptions?: string[], startedAt, expiresAt }\` | short-lived; cleared by \`closeLiveRound\` or first correct answer |
| \`minigames_last_round_firedAt\` | ISO timestamp | rewritten each fire; read by \`fireLiveRound\` to check elapsed interval |
| \`minigames_stats:{playerId}\` | \`{ totalPoints, gamesPlayed, biggestScore:{points,game,at}, perGame:{<game>:{points,plays,wins}}, streaks:{wordle:{current,best,lastSolvedDate}} }\` | permanent |
| \`minigames_window:{playerId}:{YYYY-MM-DD}\` | \`{ earned }\` | expired by \`expireWindows\` |
| \`minigames_leaderboard_cache\` | \`{ topPoints:[], topWordle:[], topHangman:[], topStreak:[], refreshedAt }\` | rewritten every 5 min |
| \`minigames_ban:{playerId}\` | \`{ expiresAt? }\` — presence = banned | removed by \`expireBans\` or admin |
| \`minigames_admin_warned_empty_bank\` | \`{ date: "YYYY-MM-DD", keys: string[] }\` | prevents daily warning spam |

---

## Games (v1 lineup)

Every game either (a) reads content from a \`minigames_content_*\` variable and validates at read time (Wordle, Hangman, Scramble, Trivia-custom) or (b) generates its content (Hot/Cold, Math race, Reaction race).

### 1. Wordle — \`/wordle [guess?]\` 🟩

**What it is:** Daily 5-letter word, 6 guesses, standard feedback markers.

**Components:**
- **Commands:** \`wordle\` (args: \`guess: string\` optional; perm: \`MINIGAMES_PLAY\`).
- **Cronjobs:** none specific (uses shared \`rolloverDailyPuzzles\`).
- **Hooks:** none.

**State variable:** \`minigames_session:{playerId}:wordle = { guesses: ["crane", "slate"], solved: false, completedAt: null }\`

**Flow — no arg (status):** Read today's puzzle and session. Print the player's guesses so far, each with feedback markers. If solved, show the score and streak.

**Flow — with arg (guess):** Validate: exactly 5 a–z letters AND exists in \`minigames_content_wordle.words\` (filtered). Reject unknown words with a \`TakaroUserError\`. Append to session. Compute feedback (🟩 right letter right spot, 🟨 right letter wrong spot, ⬜ not in word). If guess === target → \`scorer.award(pointsWordleBase × (7−n)/6)\`, mark solved, update streak. If \`guesses.length === 6\` and not solved → close, streak resets.

**Chat:**
- \`🟩 /wordle crane → C🟩R⬜A🟨N⬜E⬜ (5/6 left)\`
- \`🟩 /wordle slate → 🟩🟩🟩🟩🟩 SOLVED in 4! +50 points (boost×1.25 → 63). Streak: 7 🔥\`
- \`🟩 /wordle → You've used 3/6. Previous: CRANE, SLATE, TRUCK\`

**Edge cases:** Empty \`minigames_content_wordle.words\` → cronjob posts admin warning; today's Wordle simply doesn't exist, players get a friendly "not configured" message.

---

### 2. Hangman — \`/hangman [letterOrWord?]\` 🎪

**What it is:** Daily word, 6 wrong guesses allowed. Single-letter guesses reveal matching positions; whole-word guesses attempt an instant solve (wrong = instant game over).

**Components:**
- **Commands:** \`hangman\` (args: \`letterOrWord: string\` optional; perm: \`MINIGAMES_PLAY\`).
- **Cronjobs:** none specific.
- **Hooks:** none.

**State variable:** \`minigames_session:{playerId}:hangman = { lettersTried: ["e","a","t"], wrongCount: 1, solved: false, completedAt: null }\`

**Flow — no arg (status):** Show masked word (using \`lettersTried\`), \`wrongCount\`/6, \`lettersTried\`.

**Flow — single letter:** Normalise (lowercase). Reject if already tried. If letter ∈ word → reveal; if now fully revealed → \`scorer.award\` based on \`wrongCount\`, mark solved. Else → \`wrongCount += 1\`; if \`wrongCount === 6\` → close, 0 points.

**Flow — whole word:** If equals target → \`scorer.award\` based on current \`wrongCount\`. Else → \`wrongCount = 6\`, close, 0 points (instant loss is the genre convention).

**Chat:**
- \`🎪 /hangman e → T _ E _ _ _ (wrong 0/6, tried: E)\`
- \`🎪 /hangman takaro → SOLVED! +65 points (boost×1.25 → 81).\`

**Edge cases:** Empty \`minigames_content_wordlist.words\` → admin warning; no daily Hangman.

---

### 3. Hot/Cold — \`/hotcold [number?]\` 🌡️

**What it is:** Daily secret 1–1000, 8 guesses. Each guess gets higher/lower + warmer/colder feedback relative to the previous guess.

**Components:**
- **Commands:** \`hotcold\` (args: \`number: number\` optional; perm: \`MINIGAMES_PLAY\`).
- **Cronjobs:** none specific (secret generated by \`rolloverDailyPuzzles\`).
- **Hooks:** none.

**State variable:** \`minigames_session:{playerId}:hotcold = { guesses: [500, 750], solved: false, completedAt: null }\`

**Flow — no arg:** Show guess trail with warmth/direction markers and attempts remaining.

**Flow — with number:** Validate 1–1000 integer. Append to session. Compute:
- Direction: higher/lower relative to secret.
- Warmth: if this is the first guess, label "Baseline"; else compare \`|secret - guess|\` to \`|secret - previousGuess|\` — smaller = warmer, larger = colder, equal = same.
- If \`guess === secret\` → \`scorer.award(pointsHotColdBase × (9-n)/8)\`, close.
- If \`guesses.length === 8\` and unsolved → close, 0 points.

**Chat:**
- \`🌡️ /hotcold 500 → Higher. Baseline. (7 left)\`
- \`🌡️ /hotcold 750 → Higher. Warmer. (6 left)\`
- \`🌡️ /hotcold 812 → SOLVED in 3! +53 points.\`

**Edge cases:** None specific — content is fully generated.

---

### 4. Trivia — live round with OpenTDB default ❓

**What it is:** Live multi-player trivia. First correct \`/answer\` wins. Supports multiple-choice and true/false. Default source is Open Trivia Database (lifted from \`7dtd_triviaTime\`); falls back to the \`minigames_content_trivia\` variable on any API failure or if \`triviaQuestionSource: "custom"\`.

**Components:**
- **Commands:** none specific — uses the shared \`/answer\` command. \`/answer\` dispatches to the trivia handler when \`minigames_active_round.game === 'trivia'\`.
- **Cronjobs:** none specific (uses shared \`fireLiveRound\` / \`closeLiveRound\`).
- **Hooks:** none.

**Fire logic (in \`fireLiveRound\` when it picks trivia):**
1. If \`triviaQuestionSource === 'api'\`:
   - Build URL \`https://opentdb.com/api.php?amount=1\`, add \`&category=<id>\` if \`triviaApiCategory\` has non-\`any\` entries (pick random category, map via \`OPENTDB_CATEGORIES\`), add \`&difficulty=\` and \`&type=\` if not \`any\`.
   - \`await takaro.axios.get(url)\`. If \`takaro.axios\` unavailable, or \`response_code !== 0\`, or empty results, or any throw → fall through to custom.
   - Decode HTML entities on \`question\`, \`correct_answer\`, and every \`incorrect_answers\` entry.
   - Build \`questionData = { question, answer: correct_answer, type: 'multiple'|'boolean', incorrectAnswers }\`.
2. If falling back or custom: read \`minigames_content_trivia.questions\`. If empty → skip + admin warning. Else pick random question. Normalise shape: if entry is \`{question, options[4], answerIndex}\`, convert to \`{question, answer: options[answerIndex], type: 'multiple', incorrectAnswers: otherThree}\`. If entry is \`{question, answer}\` with no \`incorrectAnswers\` → type \`text\` (free-text answer, no options shown).
3. Shuffle answer + incorrect answers into \`displayedOptions\` (for type \`multiple\` or \`boolean\`).
4. Write \`minigames_active_round = { game: 'trivia', prompt: question, answer: correct, answerType: 'text', displayedOptions, startedAt, expiresAt }\`.
5. Announce to chat:
   - \`multiple\`: \`❓ TRIVIA: Capital of France? Options: London, Paris, Berlin, Madrid — /answer <your choice> (60s)\`
   - \`boolean\`: \`❓ TRIVIA: Is the Earth flat? /answer true or /answer false (60s)\`
   - \`text\` (custom-only path, no incorrect answers known): \`❓ TRIVIA: Capital of France? /answer <your guess> (60s)\`

**Answer logic (in \`/answer\` when active round is trivia):**
1. Normalise player's input: trim, lowercase, strip punctuation.
2. Normalise stored answer the same way.
3. Exact string match. Wrong answers are silently dropped (no chat spam; stored in nothing).
4. First correct match: \`scorer.award(pointsTriviaWin)\`, announce winner server-wide, clear \`minigames_active_round\`.

**Chat on win:** \`❓ CORRECT! @alice wins +40 points. Answer: Paris.\`

**Edge cases:** OpenTDB rate limits via session tokens — ignored in v1; if rate-limited, fall back to custom. Custom bank accepts both our \`{options[4], answerIndex}\` shape AND the \`7dtd_triviaTime\` \`{question, answer}\` shape, so admins migrating banks don't need to reformat.

---

### 5. Scramble — \`/answer <word>\` 🔤

**What it is:** Cronjob posts a scrambled word; first player to unscramble it wins.

**Components:**
- **Commands:** \`/answer\` (shared).
- **Cronjobs:** none specific.
- **Hooks:** none.

**Fire logic:** Read \`minigames_content_wordlist.words\`, filter \`length >= 4\`. If empty → skip + admin warning. Pick random word. Fisher-Yates shuffle; if shuffled result equals original, retry up to 5 times (for very short words, occasionally acceptable). Store \`minigames_active_round = { game: 'scramble', prompt: scrambled, answer: original, answerType: 'text', ... }\`. Announce: \`🔤 SCRAMBLE: RAKATO — /answer <word> (60s)\`.

**Answer logic:** Trim + lowercase compare. First match wins.

**Chat on win:** \`🔤 CORRECT! @bob unscrambled TAKARO. +40 points.\`

---

### 6. Math race — \`/answer <number>\` ➗

**What it is:** Auto-generated arithmetic expression; first correct integer wins.

**Components:**
- **Commands:** \`/answer\` (shared).
- **Cronjobs:** none specific.
- **Hooks:** none.

**Fire logic:** Generate a 2- or 3-operand expression using \`+\`, \`−\`, \`×\`, \`÷\`. Operand ranges tuned so the result is an integer in a sane range:
- \`a op b\` where a,b ∈ [2,30], op random.
- Or \`a op1 b op2 c\`, same ranges; for division, ensure divisor divides numerator evenly.
- Clamp final result to \`[-500, 10_000]\` (reroll otherwise).

Store \`minigames_active_round = { game: 'mathrace', prompt: "17 × 8 + 4", answer: 140, answerType: 'number' }\`. Announce: \`➗ MATH: 17 × 8 + 4 = ? — /answer <number> (60s)\`.

**Answer logic:** \`parseInt(response, 10)\` and exact compare. First match wins.

**Chat on win:** \`➗ CORRECT! @charlie = 140. +40 points.\`

---

### 7. Reaction race — type-the-token ⚡

**What it is:** Cronjob posts a trigger token; first player to **type the token in chat** wins. Uses the chat-message hook, not a slash command.

**Components:**
- **Commands:** none specific.
- **Cronjobs:** none specific.
- **Hooks:** \`onChatMessage\` on \`chat-message\`.

**Fire logic:** Pick a random token from a built-in list: \`["!first", "!go", "!grab", "!now", "!claim"]\`. Store \`minigames_active_round = { game: 'reactionrace', prompt: token, answer: token, answerType: 'rawchat' }\`. Announce: \`⚡ REACTION: first to type !first wins! (60s)\`.

**Hook logic (\`onChatMessage\`):**
1. Read \`minigames_active_round\`. If absent or \`game !== 'reactionrace'\` → return.
2. Normalise incoming \`eventData.msg\`: trim, lowercase.
3. If equals \`minigames_active_round.prompt\` (also lowercased) → winner = \`data.player\`; \`scorer.award(pointsReactionRaceWin)\`, announce, clear \`minigames_active_round\`.
4. Otherwise, do nothing — do NOT spam "wrong answer" replies.

**Chat on win:** \`⚡ FIRST! @dave snapped !first. +20 points.\`

**Edge cases:** If \`data.player\` is absent (e.g. server-sourced message), ignore.

---

### Summary table

| # | Game | Type | Command(s) | State scope | Content source | Points |
|---|---|---|---|---|---|---|
| 1 | Wordle | async daily | \`/wordle\` | per-player session | \`minigames_content_wordle\` | 17–100 |
| 2 | Hangman | async daily | \`/hangman\` | per-player session | \`minigames_content_wordlist\` | 11–80 |
| 3 | Hot/Cold | async daily | \`/hotcold\` | per-player session | auto-generated | 8–60 |
| 4 | Trivia | live round | \`/answer\` | \`minigames_active_round\` | OpenTDB API → \`minigames_content_trivia\` | flat 40 |
| 5 | Scramble | live round | \`/answer\` | \`minigames_active_round\` | \`minigames_content_wordlist\` | flat 40 |
| 6 | Math race | live round | \`/answer\` | \`minigames_active_round\` | auto-generated | flat 40 |
| 7 | Reaction race | live round | chat hook | \`minigames_active_round\` | built-in token list | flat 20 |

## Chat output conventions

- Emoji prefix per game (🟩 wordle, 🎪 hangman, 🌡️ hotcold, ❓ trivia, 🔤 scramble, ➗ mathrace, ⚡ reactionrace).
- One line per action where possible.
- Echo the boosted-and-clipped actual point total in win messages.
- Big scores (≥ \`bigScoreThreshold\`): extra celebratory line server-wide, plus emit event for Discord bridge.
- Live rounds announce server-wide; async puzzles respond in the command's reply context (PM-like).

## Reference modules & patterns being reused

- **\`casino\`** — the architectural template. Ledger-as-prelude pattern → scorer-as-prelude. Count-based permission → boost tier. Daily window variable → daily point cap. Leaderboard cache cronjob → identical. \`chatBridge\` event relay → identical.
- **\`7dtd_triviaTime\`** — direct code lift for OpenTDB integration: URL construction, category map, session token handling (deferred), HTML entity decoding, API-to-custom fallback logic. Reused verbatim where possible.
- **\`lottery\`** — cronjob-driven draw with \`systemConfig.cronJobs.*.temporalValue\`. Template for \`rolloverDailyPuzzles\`.
- **\`dailyRewards\`** — per-player window-key variables with daily rollover and streak tracking. Template for \`minigames_window\` and Wordle streak logic.
- **\`gimme\`** — per-install \`userConfig\` schema with \`x-component: "item"\`. Not used directly (content is in variables, not config), but referenced for admin UI expectations.
- **\`chatBridge\`** — for big-score Discord relay. \`miniGames\` emits events; \`chatBridge\` subscribes. No direct Discord code in \`miniGames\`.

Required component code skeleton (from CLAUDE.md, non-negotiable):
\`\`\`js
import { data, takaro, TakaroUserError, checkPermission } from '@takaro/helpers';
async function main() { /* ... */ }
await main();
\`\`\`

## Build order

1. **Create module skeleton** (\`moduleCreate\`): name, description, \`configSchema\`, \`systemConfigSchema\`, \`uiSchema\`, permissions.
2. **Create \`scorerPrelude\` function** (\`functionCreate\`): scorer helpers + OpenTDB category map + HTML entity decoder. This is the code block injected at build time into every game component.
3. **Ship Wordle first.** Simplest async game, exercises the full scorer path end-to-end: lazy-create content variable → read → validate → session state → \`scorer.award\` → window → boost → stats → streak → big-score event.
4. **Hangman, Hot/Cold.** Remaining async games; reuse Wordle's session + scorer patterns.
5. **\`rolloverDailyPuzzles\` cronjob + \`puzzle\` command.** Close the async-game loop.
6. **Live-round infrastructure:** \`fireLiveRound\` + \`closeLiveRound\` cronjobs, \`minigames_active_round\` variable, shared \`/answer\` command dispatcher.
7. **Math race, Scramble.** Simplest live games — no external dependencies.
8. **Trivia.** Adds OpenTDB integration and custom-bank fallback. Test API path first, then force-fail to verify fallback.
9. **Reaction race + \`onChatMessage\` hook.** Different plumbing (raw chat, not \`/answer\`), build last.
10. **Stats + leaderboards:** \`minigamestats\`, \`minigamestop\`, \`refreshLeaderboards\`, \`expireWindows\`.
11. **Admin tooling:** \`minigamesban\`/\`unban\`/\`resetstats\`/\`skiproundnow\`/\`firenow\`/\`report\`, \`expireBans\`.
12. **Install on a test server, play every game, verify via \`commandGetExecutions\` + \`eventSearch\`.**

## Components to build (MCP tool targets — executable handoff)

All creation goes through the Takaro MCP server — **never** write module code to the local filesystem.

### \`moduleCreate\`
- name \`miniGames\`, author \`Takaro\`, supportedGames \`all\`, configSchema + systemConfigSchema + uiSchema + permissions as specified above.

### \`functionCreate\`
- **\`scorerPrelude\`** — the shared scorer code block (\`scorer.checkBanAndCap\`, \`scorer.award\`), \`OPENTDB_CATEGORIES\` map, \`decodeHtmlEntities\` helper.

### \`commandCreate\` + \`commandCreateArgument\` (14 commands)

| # | trigger | args (name: type, position, helpText) | perm | handler (one-line) |
|---|---|---|---|---|
| 1 | \`minigames\` | \`game: string\` (0, optional) | \`MINIGAMES_PLAY\` | Help/overview, optionally for a specific game. |
| 2 | \`wordle\` | \`guess: string\` (0, optional) | \`MINIGAMES_PLAY\` | No arg → show today's attempts; with arg → submit 5-letter guess through Wordle flow. |
| 3 | \`hangman\` | \`letterOrWord: string\` (0, optional) | \`MINIGAMES_PLAY\` | No arg → show board; single letter → letter guess; word → solve attempt. |
| 4 | \`hotcold\` | \`number: number\` (0, optional) | \`MINIGAMES_PLAY\` | No arg → show trail; number 1–1000 → guess. |
| 5 | \`answer\` | \`response: string\` (0, required, "Your answer to the active live round") | \`MINIGAMES_PLAY\` | Dispatches on \`minigames_active_round.game\`. |
| 6 | \`minigamestats\` | \`player: string\` (0, optional) | \`MINIGAMES_PLAY\` | Lifetime + current-day stats. |
| 7 | \`minigamestop\` | \`category: string\` (0, required, "points\|wordle\|hangman\|streak") | \`MINIGAMES_PLAY\` | Serve from \`minigames_leaderboard_cache\`. |
| 8 | \`puzzle\` | — | \`MINIGAMES_PLAY\` | Status of today's async puzzles. |
| 9 | \`minigamesban\` | \`player: string\` (0, required), \`hours: number\` (1, optional) | \`MINIGAMES_MANAGE\` | Set \`minigames_ban:{pid}\` with optional expiry. |
| 10 | \`minigamesunban\` | \`player: string\` (0, required) | \`MINIGAMES_MANAGE\` | Delete \`minigames_ban:{pid}\`. |
| 11 | \`minigamesresetstats\` | \`player: string\` (0, required) | \`MINIGAMES_MANAGE\` | Delete \`minigames_stats:{pid}\`. |
| 12 | \`minigamesskiproundnow\` | — | \`MINIGAMES_MANAGE\` | Delete \`minigames_active_round\`, announce cancel. |
| 13 | \`minigamesfirenow\` | \`game: string\` (0, optional) | \`MINIGAMES_MANAGE\` | Trigger \`fireLiveRound\` immediately; optionally force a specific game. |
| 14 | \`minigamesreport\` | \`days: number\` (0, optional, default 7) | \`MINIGAMES_MANAGE\` | PM the invoker with aggregated stats. |

### \`hookCreate\` (2)

| # | name | eventType | handler (one-line) |
|---|---|---|---|
| 1 | \`onChatMessage\` | \`chat-message\` | If \`minigames_active_round.game === 'reactionrace'\` and \`eventData.msg\` (normalised) matches the token, award winner + clear round. |
| 2 | \`onPlayerDisconnect\` | \`player-disconnected\` | Soft cleanup; no state change needed in v1 (sessions persist, live rounds continue). Emit debug log for observability. |

### \`cronjobCreate\` (6)

| # | name | default temporalValue | handler (one-line) |
|---|---|---|---|
| 1 | \`rolloverDailyPuzzles\` | \`0 0 * * *\` | Generate new Wordle/Hangman/Hotcold puzzles; clear yesterday's sessions; warn on empty banks. |
| 2 | \`fireLiveRound\` | \`*/5 * * * *\` | If elapsed≥interval AND players≥min, pick enabled live game, prepare prompt (OpenTDB for trivia), write \`minigames_active_round\`, announce. |
| 3 | \`closeLiveRound\` | \`* * * * *\` | If \`minigames_active_round\` expired, announce "answer was X", clear. |
| 4 | \`refreshLeaderboards\` | \`*/5 * * * *\` | Aggregate \`minigames_stats:*\` → \`minigames_leaderboard_cache\`. |
| 5 | \`expireWindows\` | \`0 0 * * *\` | Delete \`minigames_window:*\` from prior day. |
| 6 | \`expireBans\` | \`0 * * * *\` | Remove \`minigames_ban:*\` entries whose expiry has passed. |

### Permissions (4)

| # | permission | friendlyName | canHaveCount | description |
|---|---|---|---|---|
| 1 | \`MINIGAMES_PLAY\` | Play mini-games | no | Allowed to play. |
| 2 | \`MINIGAMES_BOOST\` | Mini-games boost tier | **yes** | +25% points per count (cap 4 = 2.0×). |
| 3 | \`MINIGAMES_MANAGE\` | Manage mini-games | no | Admin commands. |
| 4 | \`MINIGAMES_BANNED\` | Banned from mini-games | no | Marker for explicit play-ban. |

### Variables (lazy-created by code, not by MCP at install)

Listed in full in the Variables section above. The build writer does not create variables directly; game code calls \`variableCreate\` with empty shape on first read.

## Verification plan

Every step verified via MCP — no guessing. Reuse patterns from CLAUDE.md "Debugging Modules".

1. **Content-bank lazy-create:** Install module, confirm no \`minigames_content_*\` variables exist. Trigger \`rolloverDailyPuzzles\` via \`cronjobTrigger\` → admin warning fires in chat naming the empty variable keys.
2. **Admin seeds banks:** \`variableCreate\` \`minigames_content_wordle.words\` with 20 5-letter words; similar for wordlist and trivia. Re-trigger \`rolloverDailyPuzzles\` → \`minigames_puzzle_today\` populated.
3. **Wordle happy path:** \`/wordle crane\` → feedback line; \`/wordle <answer>\` → \`SOLVED\`; \`minigames_stats:{pid}.perGame.wordle.wins === 1\`; \`minigames_window:{pid}:{today}.earned > 0\`; streak incremented.
4. **Wordle invalid word:** \`/wordle zzzzz\` (not in bank) → \`TakaroUserError\` surfaced in chat.
5. **Boost tier:** Grant \`MINIGAMES_BOOST\` count=2 to a role attached to a test player; solve Wordle; verify \`actualPoints = base × 1.5\` (after rounding).
6. **Daily cap:** Set \`dailyPointsCapPerPlayer: 50\`; solve Wordle for 100 base points → clipped to 50. Second game same day awards 0.
7. **Currency conversion:** Set \`pointsToCurrencyRate: 0.5\`; award 100 points; \`playerongameserverGetOne\` balance grew by 50.
8. **Live round fire — enough players:** \`gameserverGetPlayers\` shows ≥ \`minPlayersForLiveRound\`; \`cronjobTrigger fireLiveRound\` → \`minigames_active_round\` written, chat announcement sent.
9. **Live round fire — not enough players:** Drop below threshold; \`cronjobTrigger fireLiveRound\` → skipped silently.
10. **Live round win — trivia API:** Seed \`triviaQuestionSource: "api"\`; fire round; observe OpenTDB fetch in logs; first \`/answer\` correct wins.
11. **Live round win — trivia custom fallback:** Set \`triviaQuestionSource: "api"\` but simulate failure (e.g. set no-network env, or force \`triviaApiCategory\` to unused ID). Verify fallback path reads \`minigames_content_trivia.questions\`.
12. **Live round timeout:** Fire round, let \`closeLiveRound\` run past expiry → announce "answer was X", variable cleared.
13. **Reaction race:** Fire reaction round; generate a \`chat-message\` event with the token; first-to-match wins. Second matching message ignored (round already cleared).
14. **Leaderboard cache:** \`cronjobTrigger refreshLeaderboards\`; \`variableFindOne minigames_leaderboard_cache\`; matches manual aggregation of \`minigames_stats:*\`.
15. **Ban:** \`/minigamesban testplayer 1\` → any game attempt throws \`TakaroUserError\`. After 1h, \`cronjobTrigger expireBans\` clears.
16. **Big-score event:** Force a win with \`points >= bigScoreThreshold\`; \`eventSearch\` shows \`minigames-big-score\` custom event.
17. **Admin report:** \`/minigamesreport 1\` → PM shows total rounds, total points, top 5, per-game breakdown.
18. **Session persistence across disconnect:** Start Wordle, disconnect player, reconnect, \`/wordle\` → session still showing earlier guesses.

## Open assumptions

- **\`takaro.axios\` is available in module code** at build time. \`7dtd_triviaTime\` uses it successfully, so assumed present; fallback to custom-only trivia if not.
- **\`commandCreateArgument\` supports optional arguments.** \`wordle\`/\`hangman\`/\`hotcold\`/several admin commands rely on this.
- **\`checkPermission(pog, name)\` returns \`{ count }\` for count-based permissions** (mirrors casino's \`CASINO_VIP\` usage).
- **Variables can be lazy-created on first read via \`variableCreate\` with an empty payload.** Repeat \`variableCreate\` calls for the same key either succeed idempotently or fail gracefully (the game code handles \`already exists\` errors).
- **The \`chat-message\` event fires for human player chat with a resolvable \`player\` field.** Verify during build; if not, reaction race needs a different trigger (e.g. a \`react\` command).
- **OpenTDB is reachable from the Takaro runtime's outbound network.** \`7dtd_triviaTime\` confirms this is true in production.

## Known limitations

- **Takaro variables are not transactional.** Two simultaneous correct answers to the same live round could both pass the winner check. Mitigation: first writer to clear \`minigames_active_round\` wins; second sees no active round and no-ops. Imperfect; accepted.
- **Single active live round.** By design — two rounds at once would confuse the \`/answer\` dispatcher. Admins who want more throughput lower \`liveRoundIntervalMinutes\`.
- **UTC rollover only.** Non-UTC admins get midnight-UTC rollover. Configurable cron gives partial control over the hour.
- **No cross-server state.** Each game server has its own banks, puzzles, leaderboards. Matches \`casino\` scope.
- **Content quality is the admin's problem.** The module doesn't moderate or dedupe pasted content. Bank validation is shape-only (length, regex, option count).
- **OpenTDB rate limits ignored in v1.** Session tokens could be added later to prevent duplicate questions within a session; deferred.
- **\`7dtd_triviaTime\` command collision.** Both modules define trigger \`answer\`. Admins must pick one.

## Out of scope (v1)

- Cross-server leaderboards or wallets.
- Player-triggered live rounds (\`/startround trivia\` etc.). v1 is cronjob-only to prevent exploitation.
- Per-game custom cron schedules for live rounds. v1 uses one shared interval.
- Tournament formats / elimination brackets.
- Item rewards for mini-games (casino-style item prizes). Currency-or-nothing in v1; item rewards could layer on via milestones in v2.
- Localisation / non-English content. Admin-seeded content is whatever the admin pastes; API content is English-only (OpenTDB).
- UI-side admin dashboard — all admin is via chat commands and MCP.`,
          },
        },
      ],
    }),
  );
}
