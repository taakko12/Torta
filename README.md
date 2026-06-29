# Torta Clan Bot

A Discord bot for OSRS clans. Tracks SOTW/BOTW wins, loot drops, deaths, raid sign-ups, WOM standings, role management, and member onboarding — across multiple servers independently. Data stored in Supabase (PostgreSQL).

---

## Commands

### Competitions — `/comp`

Covers both Boss of the Week and Skill of the Week. Replace `botw` with `sotw` for skill competitions.

| Subcommand | Who | What |
|---|---|---|
| `/comp botw stats [username]` | Everyone | Live WOM standings (top 3 or a specific player) |
| `/comp botw wins [@user]` | Everyone | Check your own or someone's all-time win count |
| `/comp botw roll` | Manage Server | Roll 3 options for a community vote poll |
| `/comp botw leaderboard` | Manage Server | Post the live win leaderboard (auto-updates) |
| `/comp botw add @user [amount]` | Manage Server | Add wins to a member |
| `/comp botw remove @user [amount]` | Manage Server | Remove wins from a member |
| `/comp botw set @user amount` | Manage Server | Set a member's win count directly |

Rolling a poll posts 3 vote buttons. The community votes and the winner is locked in automatically 10 minutes before the competition window starts.

### Player Lookup — `/lookup`

| Subcommand | Who | What |
|---|---|---|
| `/lookup player username` | Everyone | WOM snapshot — total level, XP, EHP, EHB |
| `/lookup gained username` | Everyone | EHP and EHB gained this month |

### Loot Tracking — `/lootboard` & `/lootsubmit`

Tracks loot value automatically from Dink webhooks. Mobile players can submit drops manually via `/lootsubmit submit`.

| Command | Who | What |
|---|---|---|
| `/lootboard show` | Everyone | Monthly + all-time loot leaderboard |
| `/lootboard search rsn` | Everyone | Look up a player's top drops and total loot |
| `/lootboard setchannel #channel` | Manage Server | Set the channel to watch for Dink loot webhooks |
| `/lootboard scrape [period]` | Manage Server | Scrape channel history and import drops (deduplicates) |
| `/lootboard backfillimages [period]` | Manage Server | Copy Dink screenshots onto records missing images |
| `/lootboard reset` | Manage Server | Reset monthly totals (all-time unaffected) |
| `/lootsubmit submit rsn value [item] [screenshot]` | Everyone | Submit a drop for mod approval |
| `/lootsubmit setchannel #channel` | Manage Server | Set the channel where submission reviews are posted |

Manual `/lootsubmit submit` entries go to a review channel — a mod must approve before they count. Submitters cannot approve their own entries.

### Death Tracking — `/plankboard`

Tracks deaths from Dink webhook messages. Resets monthly.

| Subcommand | Who | What |
|---|---|---|
| `/plankboard show` | Everyone | Monthly death leaderboard |
| `/plankboard setchannel #channel` | Manage Server | Set the channel to watch for Dink death webhooks |
| `/plankboard reset` | Manage Server | Reset monthly death counts |

**Important:** run `/plankboard setchannel` once per guild. The channel ID is persisted in Supabase and survives restarts.

### Raids — `/raid`

| Subcommand | Who | What |
|---|---|---|
| `/raid schedule name timestamp [description]` | Manage Server | Schedule a raid event with sign-up buttons |
| `/raid roster raidid` | Everyone | View the current roster for a raid |

Raid posts have **Sign Up**, **Drop Out**, and **Mark Complete** buttons. Marking complete snapshots the attendee list. The bot sends reminders to signed-up members at 24h and 1h before the raid. The raid ID is shown in the footer of the raid post.

### Events — `/events`

Shows upcoming scheduled raids and active WOM SOTW/BOTW competitions in one embed.

### Name Change — `/namechange`

| Usage | Who | What |
|---|---|---|
| `/namechange oldname newname` | Manage Server | Rename a player across all loot and death records |

Merges totals if the new name already exists in the data.

### TrackScape Integration — `/trackscape`

| Subcommand | Who | What |
|---|---|---|
| `/trackscape setup [clanchat] [broadcasts]` | Manage Server | Configure clan chat relay and broadcast channels, generates a plugin code |

Connects the bot to the TrackScape RuneLite plugin for real-time in-game clan chat relay and achievement broadcasts.

### Role Panel — `/rolepanel`

| Subcommand | Who | What |
|---|---|---|
| `/rolepanel create` | Manage Server | Post the role selection panel |
| `/rolepanel add role emoji [label]` | Manage Server | Add a role button to the panel |
| `/rolepanel remove role` | Manage Server | Remove a role from the panel |
| `/rolepanel list` | Manage Server | List all roles on the panel |

Members click buttons to toggle roles. The panel auto-updates when roles are added or removed.

### Welcome & TOS — `/welcome`

| Subcommand | Who | What |
|---|---|---|
| `/welcome post` | Manage Server | Post the clan rules embed with an I Agree button |
| `/welcome setrole @role` | Manage Server | Set the role granted on approval |
| `/welcome setmodchannel #channel` | Manage Server | Set the channel where approval requests are posted |

When a new member clicks **I Agree**, a request is posted to the mod channel with Approve/Reject buttons. Approving grants the configured role and DMs the member.

**Tip — hide #welcome from members:** In Discord, go to the channel's Permission settings, add your Member role, and set **View Channel → Deny**. New members (no role) can see it; approved members can't.

---

## Setup

### 1. Create the Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Under the **Bot** tab, click **Reset Token** and copy your token.
3. Under **Privileged Gateway Intents**, enable **Message Content Intent**.
4. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`, `Read Message History`, `View Channel`, `Manage Roles`, `Manage Messages`
5. Open the generated URL and invite the bot to your server.
6. From **General Information**, copy the **Application ID** (your `CLIENT_ID`).

### 2. Create a Supabase project

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run the contents of `schema.sql` to create the tables and functions.
3. From **Settings → API**, copy your **Project URL** and **service_role** key.

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_IDS=your_server_id,optional_second_server_id

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

WOM_GROUP_ID=your_wom_group_id
WOM_GROUP_VERIFICATION_CODE=XXX-XXX-XXX
WOM_USER_AGENT=your_discord_name
WOM_API_KEY=
```

`GUILD_IDS` accepts a comma-separated list for instant multi-server command deployment.

### 4. Install & deploy

```bash
npm install
npm run deploy-commands   # registers slash commands with Discord
npm start
```

### 5. First-run setup in Discord

Run these once per server after inviting the bot:

```
/welcome setrole @Guest
/welcome setmodchannel #mod-approvals
/welcome post

/rolepanel add role:@PvM emoji:⚔️
/rolepanel create

/lootboard setchannel #dink-loot
/lootsubmit setchannel #loot-submissions
/plankboard setchannel #dink-deaths

/comp sotw leaderboard
/comp botw leaderboard
```

Run `/lootboard scrape` once to back-fill the all-time leaderboard from existing channel history.

---

## Bot Role Hierarchy

The bot's role in **Server Settings → Roles** must be positioned **above** any role it needs to assign (Member, Guest, etc.), otherwise role operations will fail with a permissions error.

---

## Storage

All loot and death data is stored in Supabase (PostgreSQL) — no persistent disk needed on Railway or other hosts.

| Table | Contents |
|---|---|
| `guild_config` | Per-guild channel IDs (drops, planks) |
| `drops` | All loot drops with player, value, item, and timestamp |
| `planks` | All deaths with player and timestamp |
| `name_changes` | RSN rename history for leaderboard merging |

SOTW/BOTW win counts, raid data, role panels, and welcome config are stored as JSON files under `data/{guildId}/`. If deploying to Railway, mount a persistent volume at `/app/data`.

---

## Project Structure

```
├── index.js                    # Bot entry point, message parsing, button interactions
├── deploy-commands.js          # Registers slash commands with Discord
├── commands/
│   ├── comp.js                 # /comp — BOTW and SOTW competitions
│   ├── lookup.js               # /lookup — player overview and monthly gains
│   ├── lootboard.js            # /lootboard — loot leaderboard and channel management
│   ├── lootsubmit.js           # /lootsubmit — manual drop submission with mod approval
│   ├── plankboard.js           # /plankboard — death leaderboard
│   ├── raid.js                 # /raid — schedule raids and view rosters
│   ├── events.js               # /events — upcoming raids + active WOM competitions
│   ├── namechange.js           # /namechange — rename a player across all records
│   ├── trackscape.js           # /trackscape — RuneLite plugin integration
│   ├── rolepanel.js            # /rolepanel — role selection panel
│   └── welcome.js              # /welcome — TOS panel and mod approval flow
└── utils/
    ├── supabase.js             # Supabase client singleton
    ├── dropStorage.js          # Loot drop read/write + parsing helpers
    ├── plankStorage.js         # Death record read/write
    ├── storage.js              # SOTW/BOTW win counts (JSON, per guild)
    ├── raidStorage.js          # Raid data (JSON, per guild)
    ├── rolePanelStorage.js     # Role panel config (JSON, per guild)
    ├── welcomeStorage.js       # Welcome config + pending approvals (JSON, per guild)
    ├── lootStorage.js          # Manual submission queue (JSON, per guild)
    ├── pollStorage.js          # BOTW/SOTW poll state (Supabase)
    ├── trackscapeStorage.js    # TrackScape config (JSON, per guild)
    ├── pollHelpers.js          # Poll rolling, boss/skill lists, embed builders
    ├── messageHelper.js        # isLootEmbed, dateToSnowflake
    ├── constants.js            # Shared constants (MEDALS)
    ├── raidEmbed.js            # Raid embed + button builder
    ├── leaderboardEmbed.js     # Win leaderboard embed builder
    ├── womEmbeds.js            # WOM competition embed builders
    ├── updateLeaderboard.js    # Auto-updates live leaderboard messages
    ├── womClient.js            # WOM API HTTP client
    └── wom.js                  # WOM competition helpers
```
