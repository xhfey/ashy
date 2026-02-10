# Mafia (مافيا) - Game Spec For Ashy Bot

This document is a build-ready specification for implementing the `MAFIA` game inside this repository.

Design goals:
- Runs fully in a normal public channel (no private threads required).
- Dead players can still chat, but are blocked from all game UI interactions.
- Night actions are private (ephemeral UI only), day voting is public.
- Works with the repo’s current `/play` lobby + `SessionService` in-memory sessions + `game-runner` registry.

---

## 1) Config (Min/Max + Timers)

### 1.1 Players
- Min players to start: `5`
- Max players:
  - Default: `15` (locked)
  - (Optional future) Support up to: `20` if you re-enable the 20p role table and switch vote UI to select-menus.

### 1.2 Lobby
- Lobby countdown starts immediately when lobby message is posted.
- Default lobby duration: `25s`
- At lobby end:
  - If players `< 5` => cancel session (`NOT_ENOUGH_PLAYERS`).
  - Else => start game runtime.

### 1.3 Phase Timers (Default)
Per round:
- `NIGHT_MAFIA`: `20s`
- `NIGHT_DOCTOR`: `20s`
- `NIGHT_DETECTIVE`: `20s` (only if enabled)
- `DAY_DISCUSS`: `15s`
- `DAY_VOTE`: `20s`

Recommended: keep these in `src/config/timers.config.js` as `MAFIA_TIMERS` for consistency.

---

## 2) Roles, Teams, Win Conditions

### 2.1 Roles
- Mafia (مافيا)
  - At night, all alive mafia members vote to kill 1 player.
- Doctor (طبيب)
  - At night, chooses 1 player to protect (can protect self).
  - Restriction: cannot protect the same player on consecutive nights.
- Detective (محقق)
  - Enabled only if starting players `>= 7`.
  - At night, investigates 1 player and receives a private result.
- Citizen (مواطن)
  - No night action.

### 2.2 Teams
- Team 1 (الفريق الأول): Citizens + Doctor + Detective
- Team 2 (الفريق الثاني): Mafia

### 2.3 Win Conditions
Evaluate after every kill/expel:
- If alive mafia count `=== 0` => Team 1 wins.
- If alive mafia count `=== alive non-mafia count` => Team 2 wins.

---

## 3) Role Distribution (Auto)

Detective strictly requires `>= 7` players.

Default distributions:
- 5 players: `1 Mafia`, `1 Doctor`, `3 Citizens` (Detective disabled)
- 6 players: `2 Mafia`, `1 Doctor`, `3 Citizens` (Detective disabled)
- 7 players: `2 Mafia`, `1 Doctor`, `1 Detective`, `3 Citizens`
- 8–11: `3 Mafia`, `1 Doctor`, `1 Detective`, remaining Citizens
- 12–15: `4 Mafia`, `1 Doctor`, `1 Detective`, remaining Citizens
- 16–20: `5 Mafia`, `1 Doctor`, `1 Detective`, remaining Citizens

Implementation detail:
- Shuffle players with `crypto.randomInt` (like other games).
- Assign roles from the distribution array (e.g., `['MAFIA','MAFIA','DOCTOR', ...]`).

---

## 4) Lobby / Join Phase (Public)

### 4.1 Lobby Embed
Title: `🕵️ مافيا`

Embed body:
- Rules text (short).
- Players list with counter `(X/maxPlayers)`.
- Countdown line: `ستبدأ اللعبة <t:EPOCH:R>` (use existing lobby timestamp pattern).

Buttons (reuse `src/utils/game-embeds.js` lobby buttons):
- ✅ `دخول إلى اللعبة`
- ❌ `اخرج من اللعبة`
- ⚡ `متجر اللعبة` (optional economy entry, already exists)

### 4.2 Join/Leave Rules
- Join adds user to session players.
- Leave removes user only in lobby.
- Edit lobby message after each join/leave (already done by `interactionCreate.js` + `SessionService.joinSession/leaveSession`).

---

## 5) Game Start / Role Reveal

### 5.1 Public Posts
When countdown ends and `startGameForSession()` succeeds:
1. Public message:
   - `✅ تم توزيع الرتب على اللاعبين، ستبدأ الجولة الأولى في بضع ثواني...`
2. Post a “teams banner” image (see **Visuals** section) that shows:
   - Team 1 counts/icons: `مواطن`, `طبيب`, `محقق` (if detective enabled)
   - Team 2 counts/icons: `مافيا`
3. Post a public button for role reveal (no DMs allowed):
   - `🎭 رتبتك (خاص)`
   - Each player must click this once to see their role ephemerally.

### 5.2 Private Role Info (Ephemeral Only, No DMs)
Rule: never DM anything.

Mechanism:
- All secret info is shown via ephemeral replies to button clicks.
- The game provides a persistent public button `🎭 رتبتك (خاص)` during the game.
- Clicking it replies ephemerally with role info:
  - Citizen: role explanation
  - Doctor: protect rules + “cannot protect same player consecutively”
  - Detective (7+): investigate rules
  - Mafia: “you are mafia” + list mafia teammates

Dead players:
- Dead players are blocked from **all** game UI, including role reveal.
- Their role is revealed publicly when they die/are expelled, so they still learn it from the channel log.

---

## 6) Core Runtime Model

### 6.1 Persistent State (SessionService)
Use `session.gameState` to store Mafia game state so handlers always read/write the same object.

Suggested schema (JSON-safe):
```js
session.gameState.mafia = {
  state: 'PLAYING',                  // PLAYING | ENDED
  phase: 'NIGHT_MAFIA',              // see Phase List below
  roundNumber: 1,

  // Players indexed by userId (store minimal info)
  players: {
    "123": { userId: "123", displayName: "X", role: "CITIZEN", alive: true },
    "456": { userId: "456", displayName: "Y", role: "MAFIA", alive: true },
  },

  // Role feature flags
  detectiveEnabled: true,

  // Night (persist only the resolved outcome, not the live votes)
  mafiaKillTargetUserId: null,                         // resolved target
  doctorProtectUserId: null,                           // resolved protection
  detectiveInvestigateUserId: null,                    // resolved investigation
  lastDoctorProtectedUserId: null,                     // restriction

  // Day (persist only the resolved outcome, not the live votes)
  voteExpelledUserId: null,                            // resolved expelled player (or null)
  voteOutcome: null,                                   // 'EXPEL' | 'TIE' | 'SKIP' | null

  // Messaging
  lobbyMessageId: null,
  statusMessageId: null,     // phase status message (edited or replaced)
  voteMessageId: null,       // day vote message (buttons)
};
```

Persistence rule:
- Do not write high-churn vote maps to `session` on every click.
- Keep live votes in runtime memory (see 6.2) and only persist resolved results + deaths + phase transitions.

### 6.2 Runtime State (In-Memory Map)
Use an in-module `activeGames` map for timers and transient handles:
- `turnTimer` / `phaseTimer` (like Dice/Roulette `GameTimer`)
- throttled UI updates (vote counts)
- cached channel/message objects if needed
- live vote state (high churn, not persisted):
  - `mafiaVotes: Map<mafiaUserId, targetUserId>`
  - `doctorProtectUserId: string|null` (current pick during the phase)
  - `detectiveInvestigateUserId: string|null` (current pick during the phase)
  - `dayVotes: Map<voterUserId, targetUserId|'SKIP'>`
  - `hintPurchasesThisRound: Set<userId>`

This should be cleared on:
- normal end
- cancellation (`/stop`)
- message deletion (`messageDelete`)
- error path

---

## 7) Phase State Machine (Round Loop)

Each round executes:
1. `NIGHT_MAFIA (20s)`
2. `NIGHT_DOCTOR (20s)`
3. `NIGHT_DETECTIVE (20s)` (only if detective enabled)
4. `RESOLVE_NIGHT`
5. `DAY_DISCUSS (15s)`
6. `DAY_VOTE (20s)`
7. `RESOLVE_VOTE`
8. `WIN_CHECK`
9. If not ended => `roundNumber++` and loop.

### 7.1 Phase List
- `NIGHT_MAFIA`
- `NIGHT_DOCTOR`
- `NIGHT_DETECTIVE` (optional)
- `RESOLVE_NIGHT`
- `DAY_DISCUSS`
- `DAY_VOTE`
- `RESOLVE_VOTE`
- `ENDED`

---

## 8) Night Phases (Private Actions + Public Status)

### 8.1 Public Status Messages
At the start of each night phase, post/edit a public status message:
- Mafia:
  - `🗡 جاري انتظار المافيا لاختيار شخص لقتله...`
- Doctor:
  - `💊 جاري انتظار الطبيب لاختيار شخص لحمايته...`
- Detective:
  - `🔍 جاري انتظار المحقق لاختيار شخص للتحقق...`

Recommendation: include an “Open Action UI” button visible to all:
- `🌙 إجراءات الليل`
Then in handler:
- If user is alive and has the correct role for the current phase, respond ephemerally with the correct UI.
- Otherwise show ephemeral “ليس دورك” / “أنت لست في اللعبة” / “أنت ميت”.

This avoids relying on DMs for interactive components while still keeping actions private.

### 8.2 Mafia Voting UI (Ephemeral)
Shown only to alive mafia during `NIGHT_MAFIA`:
- Target buttons for all alive non-mafia players.
- Mafia can change vote multiple times.
- Ephemeral confirmation after click:
  - `✅ تم تسجيل تصويتك لقتل @PLAYER`

Vote resolution at phase end:
- Count votes per target.
- If one clear highest => kill that target.
- If tie among top => random among tied targets.
- If no votes => random kill among valid targets (locked).

Public after resolution:
- `🗡 اختارت المافيا الشخص الذي سيتم اغتياله ...`

### 8.3 Doctor Protection UI (Ephemeral)
Shown only to alive doctor during `NIGHT_DOCTOR`:
- Buttons for all alive players including self
- EXCLUDE/HIDE last protected target (`lastDoctorProtectedUserId`) so doctor can’t protect same player consecutively.
- Doctor can change choice before timer ends.
- Ephemeral confirmation:
  - `✅ تم تسجيل حمايتك لـ @PLAYER`

Public after doctor picks:
- `💊 اختار الطبيب الشخص الذي سيحميه من اغتيال المافيا`

Timeout behavior:
- If no pick => no protection.

### 8.4 Detective Investigation UI (Ephemeral, only if enabled)
Shown only to alive detective during `NIGHT_DETECTIVE`:
- Buttons for all alive players (excluding self optional)
- Can change pick before timer ends
- Ephemeral confirmation:
  - `✅ تم تسجيل تحقيقك على @PLAYER`

Ephemeral result shown to detective after selection (no DMs allowed):
- `🔍 نتيجة التحقيق: @X هو (مافيا/مواطن/طبيب/محقق)`

Timeout behavior:
- If no pick => no investigation.

---

## 9) Resolve Night (Public)

At `RESOLVE_NIGHT`, compare:
- `mafiaKillTargetUserId` vs `doctorProtectUserId`

If equal => no death:
- `🛡 فشلت عملية المافيا، لقد تم حماية @PLAYER بواسطة الطبيب`

Else => kill succeeds:
- Mark target player as `alive=false`
- Public:
  - `⚰️ نجحت عملية المافيا وتم قتل @PLAYER وهذا الشخص كان <ROLE>`

Important rule:
- Dead players remain in `players` but are blocked from UI actions.

After resolving:
- Run `WIN_CHECK` immediately.

---

## 10) Day Discussion (Public)

Duration: `15s`

Public:
- `🔎 لديكم 15 ثانية للتحقق بين اللاعبين ومعرفة المافيا للتصويت على طرده من اللعبة`

No UI buttons in this phase.

---

## 11) Day Voting (Public UI + Per-User Hint)

### 11.1 Vote Prompt (Public)
Post/edit a single public message for voting:
- `لديكم 20 ثانية لاختيار شخص لطرده من اللعبة`

Buttons:
- One per alive player:
  - Label should include live count (example): `0 | PlayerName`
- `تخطي` (represents `"SKIP"`)
- `تلميح (100)` (hint purchase)

Voting rules:
- Only alive players can vote.
- Votes can be changed (latest vote overwrites).
- When user votes, optionally send ephemeral confirmation:
  - `✅ تم تسجيل صوتك`

### 11.2 Vote Count Display
To match the screenshot feel, update button labels with counts as votes change.

Implementation note:
- Editing the message on every click can hit rate limits.
- Use throttling:
  - Update at most once every `500ms` (or every `1s`) while the phase is active.

Concurrency note (important for this repo):
- `src/framework/interaction/ButtonRouter.js` currently uses a per-session TTL lock that **drops** contending interactions (it returns early on lock contention).
- Mafia day voting is inherently high concurrency (many alive players click within the same second).
- Implementation must ensure clicks are not silently dropped. Recommended options:
  - Option A (preferred): change ButtonRouter to queue per session (promise chain) instead of dropping on lock contention.
  - Option B: bypass ButtonRouter for Mafia vote/hint actions (use non-`v1:` customIds and handle them in `src/events/interactionCreate.js` with a per-session queue inside Mafia runtime).

### 11.3 Vote Resolution
At phase end:
- Compute totals for each alive player and for `SKIP`.
- If `SKIP` strictly highest => skip:
  - `تم تخطي هذه الجولة، لم يتم طرد أي لاعب`
- Else if tie for highest (player vs player OR player vs skip) => no expel:
  - `تعادل في التصويت، لم يتم طرد أي لاعب هذه الجولة`
- Else expel highest-voted player:
  - Mark expelled `alive=false`
  - Public:
    - `💣 تم التصويت على طرد @PLAYER وكان هذا الشخص <ROLE>`

After resolving:
- Run `WIN_CHECK`.

---

## 12) Hint System (Option A - Locked)

### 12.1 Cost
- Costs `100` Ashy coins.

### 12.2 Availability Rules
- Only usable during `DAY_VOTE`.
- Only alive players can buy.
- Limit: `maxHintPerPlayerPerRound = 1`
  - Track via `hintPurchasesThisRound`.

### 12.3 Effect (Private)
On purchase:
- Choose 1 random alive mafia `M`
- Choose 1 random alive non-mafia `C`
- Privately tell buyer:
  - `🔎 تلميح: أحد هؤلاء مافيا: @M أو @C`

Economy integration:
- Use `CurrencyService.spendCoins(userId, 100, TransactionType.PERK_PURCHASE, 'MAFIA', { sessionId, perkId: 'HINT', roundNumber })`
- On insufficient balance: reply ephemerally with a clear message.

Important for this repo:
- The lobby UI includes `⚡ متجر اللعبة` by default.
- Ensure Mafia does **not** sell Hint in the lobby shop (otherwise users can waste coins early).
  - Set `src/config/perks.config.js` → `MAFIA.HINT.showInShop = false` (recommended).

---

## 13) Game End (Public)

When a win condition is met:
- Set state `ENDED`, cancel timers, disable UI.
- Post win banner image:
  - Team 1 win: `فاز الفريق الاول`
  - Team 2 win: `فاز الفريق الثاني`
- Tag winners:
  - `@A @B ... - 👑 فازوا باللعبة!`

Rewards (locked):
- Winners are the entire winning team (alive + dead).
- Dead winners receive **70% less** than alive winners (30% payout).
  - Formula: `deadReward = floor(aliveReward * 0.30)`
  - Example: aliveReward `10` => deadReward `3`

Implementation in this repo:
- Do **not** use `awardGameWinners()` for Mafia because it assumes one reward amount per session ledger.
- Instead, compute `aliveReward` once (use existing `calculateReward({ playerCount })` or a Mafia-specific reward table).
- Pay per winner with `CurrencyService.awardGameWin(userId, rewardAmount, 'MAFIA', { sessionId, playerCount, roundsPlayed, winnerAlive })`.
  - This keeps idempotency safe via `TransactionService.addGameWinWithStats()` (sessionId-based duplicate prevention per user).
- Record losses for losing-team players via `recordGameResult(..., 'LOSS', { sessionId, ... })`.

---

## 14) Interaction Rules (Must Enforce)

Reject/ignore button clicks if:
- user not in game
- user is dead
- wrong phase/state
- hint already used this round
- insufficient Ashy balance

Also guard against stale UI:
- When phase changes, bump `session.uiVersion` and update `session.phase` to match current phase label.
- Old buttons become invalid via `v1` customId token/phase.

---

## 15) Cancellation + Message Deletion

Must support:
- `/stop` host-only: cancels runtime and session everywhere.
- If the main game message is deleted: cancel the session (`MESSAGE_DELETED`).
- Bot restart: per current repo behavior, ACTIVE sessions are cancelled in `src/events/ready.js` recovery.

---

## 16) Edge Cases (Required)

### 16.1 Player Leaves Mid-Game
If a player leaves the server or becomes unavailable:
- Mark them dead (or remove them) and continue.
- If it was doctor/detective/mafia, the game continues with timeouts applying if needed.
- Run `WIN_CHECK` after marking dead.

### 16.2 Mafia Vote Ties
- If multiple targets tied for highest mafia votes => random among tied.

### 16.3 Day Vote Ties
- Any tie for highest (including skip) => no expel.

### 16.4 Phase Timeouts
- Mafia (locked): random kill among valid targets
- Doctor: no protection
- Detective: no investigation

---

## 17) Visuals (Smart Like Dice/Roulette)

You want Mafia visuals to feel “premium” (like Roulette wheel + Dice backgrounds), but without generating heavy GIFs every phase.

### 17.1 What Should Be Image-Based
Generate PNG images (canvas) for:
- Team distribution banner (start of game) like your screenshot.
- Win banner (end of game) showing winners vs losers.
- Optional: role cards for ephemeral role reveal (Citizen/Doctor/Detective/Mafia).

Keep phase-to-phase updates mostly text + buttons to avoid event-loop blocking and rate limits.

### 17.2 Asset Contract (Designer)
Place assets in a Mafia folder (paths can be adjusted, but keep consistent):
- Background(s)
  - `assets/images/mafia/bg.png` (main background, high-res)
  - Optional overlays:
    - `assets/images/mafia/overlay-vignette.png`
    - `assets/images/mafia/overlay-noise.png`
- Role icons (PNG with transparent background)
  - `assets/images/mafia/icons/mafia.png`
  - `assets/images/mafia/icons/citizen.png`
  - `assets/images/mafia/icons/doctor.png`
  - `assets/images/mafia/icons/detective.png`
- Team label styles (optional)
  - `assets/images/mafia/ui/team1.png` (الفريق الأول)
  - `assets/images/mafia/ui/team2.png` (الفريق الثاني)
- App branding (optional)
  - `assets/images/mafia/ui/logo.png`

Recommended sizes:
- Background: at least `1920x1080` (so we can crop/scale cleanly).
- Icons: `256x256` (or `512x512`) transparent PNG.

### 17.3 Rendering Targets
Match the repo’s existing visual style:
- Output size for banners: `1280x720` (good for Discord previews).
- Supersampling: render at `2x` then downscale (like Roulette config / Dice images).
- Font: Cairo (already in `assets/fonts/`), with stroke + shadow for readability.
- Rounded corners + subtle vignette (similar feel to your screenshot).

### 17.4 Code Layout (Implementation)
Create `src/games/mafia/mafia.images.js` using `canvas`:
- Recommended: add `src/config/mafia.visual.config.js` (same idea as `src/config/wheel.config.js`) so designers can tweak visuals without touching render code.
- `prewarmMafiaAssets()`:
  - loads background + icons into an in-memory cache
  - clears cache periodically (like `src/games/dice/dice.images.js`)
- `generateTeamsBanner({ counts, detectiveEnabled }) -> Buffer(PNG)`:
  - Draw background + team titles (green/red) + role icons + counts/labels.
  - Layout adapts if detective disabled (6p or less).
- `generateWinBanner({ winners, losers, winningTeam }) -> Buffer(PNG)`:
  - Same background
  - Show winner side highlighted
  - Optionally draw player avatars (fetched via `avatarURL`) as circles
    - Cache avatars by URL with TTL and cap size to avoid leaks
    - Fallback to role icons if avatar fetch fails
- `generateRoleCard({ role, mafiaTeammates, doctorRule, detectiveRule }) -> Buffer(PNG)` (optional):
  - Used for the ephemeral `🎭 رتبتك (خاص)` button response.

Performance rules (must follow, based on Lessons Learned):
- Yield during long loops (drawing many avatars/icons).
- Cache loaded images; cap cache size; periodic cleanup with `.unref()`.

### 17.5 Teams Banner Layout (PNG) - Exact Look
Purpose:
- Public start-of-game image that looks like your screenshot.
- Must NOT reveal who is mafia; only shows role counts/icons.

Canvas:
- Output: `1280x720`
- Render scale: `2x` internally (render `2560x1440`, then downscale).
- Rounded corners: radius `42px` (clip path).
- Background: `assets/images/mafia/bg.png` scaled to fill, then apply optional vignette overlay.

Layout (recommended coordinates in output space 1280x720):
- Top titles:
  - Right title (Team 1): `الفريق الأول` in green
    - Position: `x=880, y=90`, align `center`
    - Font: `Cairo Bold 56px`, fill `#3CFF6B`, shadow + soft glow
  - Left title (Team 2): `الفريق الثاني` in red
    - Position: `x=400, y=90`, align `center`
    - Font: `Cairo Bold 56px`, fill `#FF3C3C`
- Role icon rows:
  - Team 1 (right side):
    - Start at `x=760, y=170`
    - Horizontal spacing: `160px`
    - Icon size: `110x110`
    - Under each icon: role label + count (examples: `مواطن ×3`, `طبيب ×1`, `محقق ×1`)
  - Team 2 (left side):
    - Center at `x=400, y=210`
    - Mafia icon size: `130x130` (slightly larger)
    - Under icon: `مافيا ×{count}`
- Bottom objectives:
  - Right bottom (Team 1 objective):
    - `الهدف: كشف المافيا قبل ما يقتلون`
    - Position: `x=980, y=650`, align right
    - Font: `Cairo 24px`, color `#B8FFCE`
  - Left bottom (Team 2 objective):
    - `الهدف: اغتيال جميع اعضاء الشعب`
    - Position: `x=300, y=650`, align left
    - Font: `Cairo 24px`, color `#FFC1C1`
- Optional logo mark:
  - `assets/images/mafia/ui/logo.png` at `x=600, y=560`, size `80x80`

Fallback behavior:
- If any icon missing, draw a colored circle + emoji fallback.

### 17.6 Win Banner Layout (PNG) - Exact Look
Purpose:
- Public end-of-game banner showing winners vs losers like your screenshot.

Canvas:
- Same base as teams banner (1280x720, 2x render scale, rounded corners).

Layout:
- Big winner title (color depends on winning team):
  - Team 1 win: `فاز الفريق الاول` (green)
  - Team 2 win: `فاز الفريق الثاني` (red)
  - Position: `x=640, y=110`, align center, font `Cairo Bold 64px`
- Avatar row:
  - Show winner avatars (circle crop) on the winning side area.
  - Show losers as dimmed/grayscale on the losing side area (optional).
  - Each avatar circle `96px` with subtle border and soft shadow.
- Optional subtitle:
  - `عدد الجولات: {rounds}` at `x=640, y=180`, font `Cairo 26px`, color `#D7D7D7`

### 17.7 Role Cards (PNG, Ephemeral)
Purpose:
- Ephemeral “رتبتك (خاص)” should look premium (no DMs).

Canvas:
- Output: `900x520` (fast + sharp), 2x render scale.
- Background: blurred crop of `bg.png` + dark overlay.
- Big role icon + Arabic role name + 2–4 bullet lines of instructions.
- For Mafia role card: include mafia teammates list as text (no avatars needed).

---

---

## 18) Repo Integration Plan (Where Code Will Live)

To implement this game in this repo (high level):
- Add game module:
  - `src/games/mafia/mafia.game.js` (register handler, start/stop, runtime loop)
  - `src/games/mafia/mafia.constants.js` (roles, strings, timers)
  - `src/games/mafia/mafia.buttons.js` (public vote buttons, open-night-action button, etc.)
  - `src/games/mafia/mafia.embeds.js` (lobby/game embeds if needed)
  - Optional: `src/games/mafia/mafia.images.js` (banners)
- Register in `src/games/registry.js` as `implemented: true`.
- Add to `src/games/public-games.js` if you want it visible in `/play`.
- Ensure `src/config/games.config.js` has:
  - `minPlayers: 5`
  - `maxPlayers: 15`
  - `countdownSeconds: 25` (if adopting the spec default)

---

## 19) Locked Decisions (From You)
- `maxPlayers = 15`
- Lobby timer `25s`
- Mafia timeout: random kill among valid targets
- Private interactions: ephemeral only (no DMs)
- Payout: whole winning team; dead winners get 30% of alive reward
- No “انسحاب” button; only handle server leave/unavailability

---

## 20) UI Walkthrough (Exact Messages + Buttons)

This section is written as an implementation script: what appears in the channel, what appears ephemerally, and which buttons exist in each phase.

Definitions:
- Public = visible to everyone in the channel.
- Ephemeral = visible only to the clicker (“Only you can see this”).
- “Control Panel” message = one public bot message that is edited every phase to show state + provide the 2 always-available buttons:
  - `🎭 رتبتك (خاص)`
  - `🌙 إجراءات الليل` (enabled only in night phases)

### 20.1 `/play` → Lobby Posted (Public)
Public (existing `/play` flow):
- Bot replies with an **embed** titled `🕵️ مافيا` containing:
  - Rules text (from `GAMES.MAFIA.details`).
  - Players list: mention per slot line.
  - Countdown line:
    - `⏱️ ستبدأ اللعبة <t:LOBBY_END_EPOCH:R>`
- Components (from `src/utils/game-embeds.js`):
  - ✅ `دخول إلى اللعبة`
  - ❌ `اخرج من اللعبة`
  - ⚡ `متجر اللعبة`

Join/leave behavior (existing):
- Join updates the lobby embed immediately.
- Leave updates the lobby embed immediately.

At lobby end:
- If `< 5` players:
  - Lobby message edit:
    - `🚫 | تم إلغاء اللعبة لعدم وجود 5 لاعبين على الأقل`
- Else:
  - Lobby message edit (already done by countdown service):
    - `🎮 **بدأت اللعبة!** (X لاعبين)`
  - Lobby components removed.

### 20.2 Start Of Game (Public)
Immediately after runtime starts:
1. Public message:
   - `✅ تم توزيع الرتب على اللاعبين، ستبدأ الجولة الأولى في بضع ثواني...`
2. Public image banner message (Attachment `teams.png`):
   - Caption (public):
     - `🧩 تم تقسيم الأدوار على الفريقين`
   - Image content:
     - Team 1 title: `الفريق الأول` (green)
     - Team 2 title: `الفريق الثاني` (red)
     - Icons + counts for roles (detective included only if enabled)
3. Public “Control Panel” message posted (keep its `messageId` as the session’s `messageId` via `SessionService.setMessageId` so `messageDelete` + `/stop` work reliably):
   - Content template:
     - `🎭 اضغط زر (رتبتك) لمعرفة رتبتك بشكل خاص`
     - `🌙 أثناء الليل اضغط زر (إجراءات الليل) لتنفيذ دورك`
   - Buttons (single row, max 3):
     - `🎭 رتبتك (خاص)` (always enabled; handler blocks dead players)
     - `🌙 إجراءات الليل` (enabled only during night phases)
     - Optional disabled brand button (same style as other games)

### 20.3 `🎭 رتبتك (خاص)` (Ephemeral Role Reveal)
Trigger:
- Any alive player clicks `🎭 رتبتك (خاص)` on the Control Panel.

Validation:
- Not in session => ephemeral: `❌ أنت لست في هذه اللعبة`
- Dead => ephemeral: `💀 أنت ميت ولا يمكنك التفاعل مع اللعبة`
- Game ended => ephemeral: `⏰ انتهت هذه اللعبة`

Ephemeral reply format:
- Optional attachment: `role.png` (generated role card from `mafia.images.js`)
- Content (exact templates):

Citizen:
```
👤 **رتبتك: مواطن**
هدفك: كشف المافيا قبل أن يقتلوكم.
في النهار: ناقش وصوّت لطرد المافيا.
```

Doctor:
```
💊 **رتبتك: طبيب**
كل ليلة اختر لاعبًا لحمايته (يمكنك حماية نفسك).
ممنوع: لا يمكنك حماية نفس اللاعب ليلتين متتاليتين.
```

Detective (only if enabled):
```
🔍 **رتبتك: محقق**
كل ليلة اختر لاعبًا للتحقق منه.
ستظهر لك نتيجة التحقيق بشكل خاص.
```

Mafia:
```
🗡 **رتبتك: مافيا**
اتفقوا على اغتيال لاعب كل ليلة.
أعضاء المافيا: @A، @B، @C
```

### 20.4 Round N Overview (Public)
At the start of every round:
- Public message (optional, recommended for clarity):
  - `🕯️ **الجولة {roundNumber}** بدأت...`

### 20.5 Phase: `NIGHT_MAFIA` (20s)
Public (Control Panel edit):
- Replace content with:
  - `🗡 جاري انتظار المافيا لاختيار شخص لقتله...`
  - `⏱️ ينتهي الوقت <t:PHASE_END_EPOCH:R>`
- Buttons:
  - `🎭 رتبتك (خاص)` enabled
  - `🌙 إجراءات الليل` enabled

Ephemeral (mafia clicks `🌙 إجراءات الليل`):
- If not mafia => `❌ ليس دورك الآن`
- If mafia but dead => `💀 أنت ميت ولا يمكنك التفاعل مع اللعبة`
- If mafia and alive:
  - Ephemeral message content:
    - `🗡 **دور المافيا**`
    - `لديك 20 ثانية لاختيار شخص لاغتياله`
    - `⏱️ ينتهي الوقت <t:PHASE_END_EPOCH:R>`
    - `اختيارك الحالي: (لم تختر بعد)` OR `اختيارك الحالي: @PLAYER`
  - Buttons: all alive **non-mafia** targets (5 per row, up to 3 rows for 15p)
    - Button label: `{slotNumber}. {displayName}` (truncate to 12)
    - Selected target style: `Danger`
    - Others: `Secondary` (or `Primary`)
  - On click:
    - Store vote: `mafiaVotes[mafiaUserId] = targetUserId`
    - Edit the same ephemeral message to update “اختيارك الحالي” and selected button style.

Timeout resolution (end of `NIGHT_MAFIA`):
- If votes exist:
  - pick highest; on tie pick random among tied
- If no votes:
  - random kill among valid non-mafia targets
- Set:
  - `mafiaKillTargetUserId = resolvedTarget`
Public (Control Panel edit after resolve):
- `🗡 اختارت المافيا الشخص الذي سيتم اغتياله ...`

### 20.6 Phase: `NIGHT_DOCTOR` (20s)
Public (Control Panel edit):
- `💊 جاري انتظار الطبيب لاختيار شخص لحمايته...`
- `⏱️ ينتهي الوقت <t:PHASE_END_EPOCH:R>`
- Buttons:
  - `🎭 رتبتك (خاص)` enabled
  - `🌙 إجراءات الليل` enabled

Ephemeral (doctor clicks `🌙 إجراءات الليل`):
- If not doctor => `❌ ليس دورك الآن`
- If doctor and alive:
  - Content:
    - `💊 **أنت الطبيب**`
    - `لديك 20 ثانية لاختيار شخص لحمايته`
    - `⏱️ ينتهي الوقت <t:PHASE_END_EPOCH:R>`
    - `ممنوع: لا يمكنك حماية نفس اللاعب ليلتين متتاليتين`
    - `اختيارك الحالي: ...`
  - Buttons:
    - All alive players **including self**
    - EXCLUDE `lastDoctorProtectedUserId` (hidden button)
    - Style selected target = `Success`
  - On click:
    - `doctorProtectUserId = targetUserId`
    - Edit ephemeral message to update current pick + selected style.

Timeout:
- If no doctor pick => `doctorProtectUserId = null`
Public (Control Panel edit after resolve):
- `💊 اختار الطبيب الشخص الذي سيحميه من اغتيال المافيا`

### 20.7 Phase: `NIGHT_DETECTIVE` (20s, only if enabled)
Public (Control Panel edit):
- `🔍 جاري انتظار المحقق لاختيار شخص للتحقق...`
- `⏱️ ينتهي الوقت <t:PHASE_END_EPOCH:R>`
- Buttons:
  - `🎭 رتبتك (خاص)` enabled
  - `🌙 إجراءات الليل` enabled

Ephemeral (detective clicks `🌙 إجراءات الليل`):
- If not detective => `❌ ليس دورك الآن`
- If detective and alive:
  - Content:
    - `🔍 **أنت المحقق**`
    - `لديك 20 ثانية لاختيار شخص للتحقق`
    - `⏱️ ينتهي الوقت <t:PHASE_END_EPOCH:R>`
    - `اختيارك الحالي: ...`
    - `نتيجة آخر تحقيق: ...` (empty until first selection)
  - Buttons:
    - All alive players excluding self (locked default)
    - Selected style: `Primary`
  - On click:
    - `detectiveInvestigateUserId = targetUserId`
    - Compute result immediately (no DMs allowed):
      - `@X هو (مافيا/مواطن/طبيب/محقق)`
    - Edit the same ephemeral message to set:
      - `اختيارك الحالي: @X`
      - `نتيجة آخر تحقيق: @X هو (...)`

Timeout:
- If no pick => `detectiveInvestigateUserId = null`

### 20.8 Phase: `RESOLVE_NIGHT` (Public)
Public (Control Panel edit during resolve):
- `🌙 يتم الآن تنفيذ أحداث الليل...`

Resolve rules:
- If `mafiaKillTargetUserId === doctorProtectUserId`:
  - Public message:
    - `🛡️ فشلت عملية المافيا، لقد تم حماية @PLAYER بواسطة الطبيب`
- Else:
  - Mark killed player dead
  - Public message:
    - `⚰️ نجحت عملية المافيا وتم قتل @PLAYER وهذا الشخص كان **<ROLE>**`

After resolve:
- Immediately run `WIN_CHECK`.
- If not ended, advance to `DAY_DISCUSS`.

### 20.9 Phase: `DAY_DISCUSS` (15s)
Public (Control Panel edit):
- `🔎 لديكم 15 ثانية للتحقق بين اللاعبين ومعرفة المافيا للتصويت على طرده من اللعبة`
- `⏱️ ينتهي الوقت <t:PHASE_END_EPOCH:R>`
- Buttons:
  - `🎭 رتبتك (خاص)` enabled
  - `🌙 إجراءات الليل` disabled

### 20.10 Phase: `DAY_VOTE` (20s)
Public:
- Post a new public vote message (store `voteMessageId` in mafia state):
  - Content:
    - `🗳️ **التصويت**`
    - `لديكم 20 ثانية لاختيار شخص لطرده من اللعبة`
    - `⏱️ ينتهي الوقت <t:PHASE_END_EPOCH:R>`
  - Buttons layout (max players 15):
    - Rows 1–3: alive player vote buttons (5 per row)
      - Label: `{count} | {displayName}` (truncate name to 12–16)
      - `count` is the live vote count for that player
    - Row 4: actions
      - `countSkip | تخطي`
      - `تلميح (100)`

Voting click rules:
- Only alive players can vote.
- Votes can be changed; only the latest vote is stored.
- On vote click:
  - Store: `dayVotes[voterUserId] = targetUserId` or `"SKIP"`
  - Do not spam ephemeral confirmations; the updated button counts are the feedback.
- Throttle UI edits:
  - Update vote message labels at most once every `500ms` (recommended `750ms`) while phase active.

Hint click rules:
- Validation:
  - Must be in game and alive
  - Must be in `DAY_VOTE`
  - Must not already use hint this round
- On click:
  - Charge 100 via `CurrencyService.spendCoins(...)`
  - On success: ephemeral
    - `✅ تم شراء تلميح (-100 🪙)`
    - `🔎 تلميح: أحد هؤلاء مافيا: @M أو @C`
  - On failure: ephemeral
    - insufficient balance: `❌ رصيدك غير كافٍ! تحتاج: 100 | لديك: {balance}`
    - already used: `❌ استخدمت تلميح هذه الجولة بالفعل`
    - wrong phase: `❌ التلميح متاح فقط أثناء التصويت`

### 20.11 Phase: `RESOLVE_VOTE` (Public)
Public (Control Panel edit):
- `🗳️ يتم الآن احتساب الأصوات...`

Resolve:
- If Skip strictly highest:
  - Public:
    - `تم تخطي هذه الجولة، لم يتم طرد أي لاعب`
- Else if tie for highest (any tie including skip):
  - Public:
    - `تعادل في التصويت، لم يتم طرد أي لاعب هذه الجولة`
- Else expel:
  - Mark expelled dead
  - Public:
    - `💣 تم التصويت على طرد @PLAYER وكان هذا الشخص **<ROLE>**`

After resolve:
- Remove vote message components (disable voting) by editing it to `components: []`.
- Run `WIN_CHECK` immediately.
- If not ended: advance to next round (`NIGHT_MAFIA`).

### 20.12 Phase: `ENDED` (Public)
Public:
- Post win banner image:
  - `🏆 فاز الفريق الاول` OR `🏆 فاز الفريق الثاني`
- Post winners mention line:
  - `@A @B @C - 👑 فازوا باللعبة!`

Cleanup:
- Edit Control Panel message:
  - `🏁 انتهت اللعبة`
  - components removed
- Edit any active vote message to remove components (if still present).

### 20.13 Common Ephemeral Error Strings (Exact)
Use these exact user-facing strings for consistency:
- Not in this game: `❌ أنت لست في هذه اللعبة`
- Game ended/expired: `⏰ انتهت هذه اللعبة`
- Dead player blocked: `💀 أنت ميت ولا يمكنك التفاعل مع اللعبة`
- Wrong phase: `❌ لا يمكنك الضغط الآن`
- Not your role/turn: `❌ ليس دورك الآن`
- Hint only during vote: `❌ التلميح متاح فقط أثناء التصويت`
- Hint already used this round: `❌ استخدمت تلميح هذه الجولة بالفعل`
- Hint insufficient balance: `❌ رصيدك غير كافٍ! تحتاج: 100 | لديك: {balance}`

---

## 21) Button Actions (Names + Routing)

To keep implementation consistent with this repo’s `ButtonRouter` context (`ctx.action`, `ctx.details`), use these action names:
- `role` (no details) => `🎭 رتبتك (خاص)`
- `night_open` (no details) => `🌙 إجراءات الليل`
- `mafia_vote` (details=`targetUserId`)
- `doctor_protect` (details=`targetUserId`)
- `detective_check` (details=`targetUserId`)
- `vote` (details=`targetUserId`)
- `vote_skip` (no details, stores `"SKIP"`)
- `hint` (no details)

Important: do **not** increment `session.uiVersion` on every vote/hint click.
- Only bump `uiVersion` on phase transitions (so old-phase buttons become invalid).
- Vote count updates should only change button labels, not customIds/tokens.

---

## 22) Required Repo Hooks (So Nothing Breaks)

### 22.1 Message Deletion Anchor
After Mafia starts, call `SessionService.setMessageId(session.id, controlPanelMessage.id)` so:
- `src/events/messageDelete.js` cancels the session if that message is deleted.
- `/stop` edits the correct “main” message for cancellation.

### 22.2 Member Leave Handling (No “انسحاب” Button)
Add `src/events/guildMemberRemove.js` (or equivalent) to detect when a participating player leaves:
- Find the active session that contains that user.
- Mark them dead and immediately run `WIN_CHECK` and continue.

Note: current `SessionService` does not expose a fast “session by playerId” lookup.
Recommended additions (implementation task for Codex):
- `SessionService.getSessionByPlayer(userId)` (searches live sessions via internal index) OR
- `SessionService.getAllActiveSessions()` scan + find the session containing that user (acceptable for small counts).
