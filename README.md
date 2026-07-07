# Clan Leaderboard Bot

A Discord bot for OSRS clans. Tracks loot drops, deaths, SOTW/BOTW competitions, WOM standings, voice channel time, Discord/in-game activity, clan events, member onboarding, and role management — all stored in Supabase so nothing is lost on restart.

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

### Player Stats — `/stats`

| Usage | Who | What |
|---|---|---|
| `/stats rsn` | Everyone | Combined clan profile — loot, deaths, recent achievements, WOM data |

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

### RSN Linking — `/link`

| Usage | Who | What |
|---|---|---|
| `/link rsn` | Everyone | Link your Discord account to your RuneScape username |

Linked RSNs appear in the admin activity panel so staff can cross-reference Discord and in-game activity.

### Raids — `/raid`

| Subcommand | Who | What |
|---|---|---|
| `/raid schedule name timestamp [description]` | Manage Server | Schedule a raid event with sign-up buttons |
| `/raid roster raidid` | Everyone | View the current roster for a raid |

Raid posts have **Sign Up**, **Drop Out**, and **Mark Complete** buttons. Marking complete snapshots the attendee list. The bot sends reminders to signed-up members at 24h and 1h before the raid. The raid ID is shown in the footer of the raid post.

### Events — `/events`

Shows upcoming scheduled raids and active WOM SOTW/BOTW competitions in one embed.

### Announcements — `/announce`

| Subcommand | Who | What |
|---|---|---|
| `/announce schedule #channel time [message] [file]` | Manage Server | Schedule an announcement to post at a unix timestamp |
| `/announce cancel` | Manage Server | Cancel the pending scheduled announcement |

Accepts a plain text message or a `.txt`/`.md` file attachment. The unix timestamp can be raw (`1782749460`) or Discord format (`<t:1782749460:f>`).

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

## Automatic Features

- **Activity tracking** — every Discord message and in-game clan chat message increments a per-user count. Monthly counts reset on the 1st of each month at midnight UTC.
- **Voice channel tracking** — time spent in voice channels is logged in minutes (flushed every 5 minutes). Monthly VC minutes reset on the 1st.
- **Weekly recap** — every Sunday at 8 PM UTC the bot posts the top 3 most active members (Discord messages, in-game messages, VC time) to the configured recap channel.
- **Inactivity alerts** — every Monday at 9 AM UTC the bot posts a list of Discord members who have zero messages this month to the configured inactivity channel.
- **Clan events** — created from the admin website panel. The bot posts an embed with **Going / Can't make it** RSVP buttons; clicking updates Supabase in real time.
- **WOM sync** — the WOM group membership is synced hourly.
- **Death quips** — a random quip is posted (40% chance) to the planks channel when a death is logged.

---

## Setup

### 1. Create the Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Under the **Bot** tab, click **Reset Token** and copy your token.
3. Under **Privileged Gateway Intents**, enable:
   - **Server Members Intent**
   - **Message Content Intent**
4. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`, `Read Message History`, `View Channel`, `Manage Roles`, `Manage Messages`
5. Open the generated URL and invite the bot to your server.
6. From **General Information**, copy the **Application ID** — this is your `CLIENT_ID`.
7. Right-click your server name in Discord (with **Developer Mode** on in User Settings → Advanced) and copy the server ID — this is your `CLAN_GUILD_ID` and `GUILD_IDS`.

### 2. Create a Supabase project

1. Create a free project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, paste and run the contents of `schema.sql` to create all tables and functions.
3. From **Settings → API**, copy your **Project URL** (`SUPABASE_URL`) and **service_role** key (`SUPABASE_SERVICE_ROLE_KEY`).

### 3. Configure environment variables

Create a `.env` file in the project root:

```
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_IDS=your_server_id
CLAN_GUILD_ID=your_server_id

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Wise Old Man (optional — needed for /lookup, /comp stats, WOM sync)
WOM_GROUP_ID=your_wom_group_id
WOM_VERIFICATION_CODE=XXX-XXX-XXX
WOM_USER_AGENT=your_discord_username
WOM_API_KEY=

# TrackScape (optional — needed for in-game chat relay)
TRACKSCAPE_PORT=3001
TRACKSCAPE_HOST=0.0.0.0
TRACKSCAPE_PUBLIC_URL=https://your-bot-url.railway.app
```

`GUILD_IDS` accepts a comma-separated list for instant multi-server command deployment. `CLAN_GUILD_ID` is the single primary guild used for activity tracking and cron jobs.

### 4. Install & run

```bash
npm install
npm run deploy-commands   # registers slash commands with Discord
npm start
```

### 5. Deploy to Railway

1. Push the repo to GitHub.
2. In [Railway](https://railway.app), create a new project from the GitHub repo.
3. Add all environment variables from step 3 under the service's **Variables** tab.
4. The bot uses Supabase for all persistent data — no volume mount needed.

### 6. First-run setup in Discord

Run these once after inviting the bot:

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

Recap and inactivity alert channels are configured from the **Settings** tab in the admin website panel.

Run `/lootboard scrape` once to back-fill the all-time leaderboard from existing channel history.

---

## Bot Role Hierarchy

The bot's role in **Server Settings → Roles** must be positioned **above** any role it needs to assign (Member, Guest, etc.), otherwise role operations will fail silently.

---

## Database Tables

All data is stored in Supabase. Run `schema.sql` to create everything.

| Table | Contents |
|---|---|
| `guild_config` | Per-guild channel IDs and configuration |
| `drops` | Loot drops with player, value, item, and timestamp |
| `planks` | Deaths with player and timestamp |
| `name_changes` | RSN rename history |
| `achievements` | Clan achievement broadcasts from TrackScape |
| `active_polls` | SOTW/BOTW poll state (survives restarts) |
| `discord_activity` | Per-member Discord message counts (all-time + monthly) |
| `ingame_activity` | Per-RSN clan chat message counts (all-time + monthly) |
| `vc_activity` | Per-member voice channel time in minutes (all-time + monthly) |
| `rsn_links` | Discord ID ↔ RSN links set via `/link` |
| `clan_events` | Events created via the admin panel |
| `event_rsvps` | Individual RSVPs per event |
| `bingo_events` | Bingo competition definitions |
| `bingo_tasks` | Bingo board squares |
| `bingo_teams` | Bingo team definitions |
| `bingo_team_members` | RSNs assigned to bingo teams |
| `bingo_submissions` | Bingo task completion submissions |

---

## Project Structure

```
├── index.js                    # Bot entry point, event handlers, cron jobs
├── deploy-commands.js          # Registers slash commands with Discord
├── schema.sql                  # Full Supabase schema — run once to set up
├── commands/
│   ├── comp.js                 # /comp — BOTW and SOTW competitions
│   ├── lookup.js               # /lookup — player WOM overview
│   ├── stats.js                # /stats — combined player clan profile
│   ├── link.js                 # /link — RSN ↔ Discord account linking
│   ├── lootboard.js            # /lootboard — loot leaderboard
│   ├── lootsubmit.js           # /lootsubmit — manual drop submission
│   ├── plankboard.js           # /plankboard — death leaderboard
│   ├── raid.js                 # /raid — raid scheduling and rosters
│   ├── events.js               # /events — upcoming raids + WOM competitions
│   ├── announce.js             # /announce — scheduled announcements
│   ├── namechange.js           # /namechange — rename across all records
│   ├── trackscape.js           # /trackscape — RuneLite plugin integration
│   ├── rolepanel.js            # /rolepanel — self-serve role buttons
│   └── welcome.js              # /welcome — TOS panel and mod approval
└── utils/
    ├── supabase.js             # Supabase client singleton
    ├── activityStorage.js      # Discord/in-game/VC activity logging
    ├── linkStorage.js          # RSN link read/write
    ├── dropStorage.js          # Loot drop storage and helpers
    ├── plankStorage.js         # Death record storage
    ├── storage.js              # SOTW/BOTW win counts (JSON, per guild)
    ├── raidStorage.js          # Raid data (JSON, per guild)
    ├── rolePanelStorage.js     # Role panel config (JSON, per guild)
    ├── welcomeStorage.js       # Welcome config (JSON, per guild)
    ├── lootStorage.js          # Manual submission queue (JSON, per guild)
    ├── pollStorage.js          # BOTW/SOTW poll state (Supabase)
    ├── trackscapeStorage.js    # TrackScape config (JSON, per guild)
    ├── pollHelpers.js          # Poll rolling, boss/skill lists
    ├── messageHelper.js        # isLootEmbed, dateToSnowflake
    ├── constants.js            # Shared constants
    ├── raidEmbed.js            # Raid embed builder
    ├── leaderboardEmbed.js     # Win leaderboard embed
    ├── womEmbeds.js            # WOM competition embeds
    ├── updateLeaderboard.js    # Auto-updates live leaderboard messages
    ├── womClient.js            # WOM API HTTP client
    └── wom.js                  # WOM competition helpers
```
