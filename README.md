# Torta Clan Bot

A Discord bot for OSRS clans. Tracks SOTW/BOTW wins, loot drops, deaths, raid sign-ups, WOM standings, role management, and member onboarding — across multiple servers independently.

---

## Commands

### Skill of the Week — `/sotw`

| Subcommand | Who | What |
|---|---|---|
| `/sotw check [@user]` | Everyone | Check your own or someone's SOTW win count |
| `/sotw stats [username]` | Everyone | WOM SOTW standings (top 3 or specific player) |
| `/sotw add @user [amount]` | Manage Server | Add SOTW wins |
| `/sotw remove @user [amount]` | Manage Server | Remove SOTW wins |
| `/sotw set @user amount` | Manage Server | Set SOTW wins directly |
| `/sotw leaderboard` | Manage Server | Post the live SOTW wins leaderboard (auto-updates) |

### Boss of the Week — `/botw`

| Subcommand | Who | What |
|---|---|---|
| `/botw check [@user]` | Everyone | Check your own or someone's BOTW win count |
| `/botw stats [username]` | Everyone | WOM BOTW standings (top 3 or specific player) |
| `/botw add @user [amount]` | Manage Server | Add BOTW wins |
| `/botw remove @user [amount]` | Manage Server | Remove BOTW wins |
| `/botw set @user amount` | Manage Server | Set BOTW wins directly |
| `/botw leaderboard` | Manage Server | Post the live BOTW wins leaderboard (auto-updates) |

### Player Lookup — `/lookup`

| Subcommand | Who | What |
|---|---|---|
| `/lookup player username` | Everyone | WOM snapshot (total level, XP, EHP, EHB) |
| `/lookup ehp username` | Everyone | Total EHP for a player |
| `/lookup ehb username` | Everyone | Total EHB for a player |

### Loot Tracking — `/lootboard` & `/loot`

Tracks loot value from Dink webhooks automatically. Mobile players can submit manually via `/loot submit`.

| Command | Who | What |
|---|---|---|
| `/lootboard show` | Everyone | Monthly loot leaderboard |
| `/lootboard showall` | Everyone | All-time loot leaderboard |
| `/lootboard setchannel #channel` | Manage Server | Set channel to watch for Dink loot notifications |
| `/lootboard scrape` | Manage Server | Scrape full channel history to build all-time leaderboard |
| `/lootboard reset` | Manage Server | Reset monthly totals (all-time unaffected) |
| `/loot setchannel #channel` | Manage Server | Set channel where manual submissions are reviewed |
| `/loot submit rsn value [item] [screenshot]` | Everyone | Submit a drop for mod approval |

Manual `/loot submit` entries go to a review channel — a mod must approve before they count. Submitters cannot approve their own entries.

### Death Tracking — `/plankboard`

Tracks deaths from Dink webhook messages. Resets monthly.

| Subcommand | Who | What |
|---|---|---|
| `/plankboard show` | Everyone | Monthly death leaderboard |
| `/plankboard setchannel #channel` | Manage Server | Set channel to watch for Dink death notifications |
| `/plankboard reset` | Manage Server | Reset monthly death counts |

### Raids — `/raidschedule` & `/raidroster`

| Command | Who | What |
|---|---|---|
| `/raidschedule name timestamp [description]` | Manage Server | Schedule a raid with sign-up buttons |
| `/raidroster raidid` | Everyone | View the current roster for a raid |

Raid posts have **Sign Up**, **Drop Out**, and **Mark Complete** buttons. Marking complete snapshots the attendee list. The bot sends reminders to signed-up members at 24h and 1h before the raid.

### Events — `/events`

Shows upcoming scheduled raids and active WOM SOTW/BOTW competitions in one embed.

### Role Panel — `/rolepanel`

| Subcommand | Who | What |
|---|---|---|
| `/rolepanel create` | Manage Server | Post the role selection panel |
| `/rolepanel add role emoji [label]` | Manage Server | Add a role button to the panel |
| `/rolepanel remove role` | Manage Server | Remove a role from the panel |
| `/rolepanel list` | Manage Server | List all roles on the panel |

Members click buttons to toggle roles. The panel auto-updates when roles are added/removed.

### Welcome & TOS — `/welcome`

| Subcommand | Who | What |
|---|---|---|
| `/welcome post` | Manage Server | Post the clan rules embed with an I Agree button |
| `/welcome setrole @role` | Manage Server | Set the role granted on approval |
| `/welcome setmodchannel #channel` | Manage Server | Set the channel where approval requests go |

When a new member clicks **I Agree**, a request is posted to the mod channel with Approve/Reject buttons. Approving grants the configured role and DMs the member. The TOS embed is left untouched.

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

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_IDS=your_server_id,optional_second_server_id
WOM_GROUP_ID=your_wom_group_id
```

`GUILD_IDS` supports comma-separated IDs for instant multi-server deploy.

### 3. Install & deploy

```bash
npm install
npm run deploy-commands
npm start
```

### 4. First-run setup in Discord

```
/welcome setrole @Guest
/welcome setmodchannel #mod-approvals
/welcome post

/rolepanel add role:@PvM emoji:⚔️
/rolepanel create

/lootboard setchannel #dink-loot
/loot setchannel #loot-submissions
/plankboard setchannel #dink-deaths

/sotw leaderboard
/botw leaderboard
```

Run `/lootboard scrape` once to back-fill the all-time leaderboard from existing channel history.

---

## Bot Role Hierarchy

The bot's role in **Server Settings → Roles** must be positioned **above** any role it needs to assign (Member, Guest, etc.), otherwise role operations will fail with a permissions error.

---

## Persistent Storage

All data is stored as JSON files under `data/{guildId}/`:

| File | Contents |
|---|---|
| `wins.json` | SOTW/BOTW win counts and leaderboard message locations |
| `drops.json` | Monthly + all-time loot totals, configured channel |
| `planks.json` | Monthly death counts, configured channel |
| `raids.json` | Scheduled raids, sign-ups, attendees |
| `rolepanel.json` | Role panel config and role list |
| `welcome.json` | TOS panel config, pending approvals |
| `loot.json` | Pending manual loot submissions |

**On cloud hosts (Railway, Render, etc.):** Mount a persistent volume at `data/` so data survives restarts. Most hosts offer this as an add-on ("Volumes" or "Persistent Disks").

---

## Project Structure

```
├── index.js                    # Bot entry point, interactions, Dink message parsing
├── deploy-commands.js          # Registers slash commands with Discord
├── commands/
│   ├── sotw.js                 # SOTW wins + WOM standings
│   ├── botw.js                 # BOTW wins + WOM standings
│   ├── lookup.js               # Player lookup, EHP, EHB
│   ├── lootboard.js            # Loot leaderboard (monthly + all-time + scrape)
│   ├── loot.js                 # Manual loot submission with mod approval
│   ├── plankboard.js           # Death leaderboard
│   ├── raidschedule.js         # Schedule raids
│   ├── raidroster.js           # View raid rosters
│   ├── events.js               # Upcoming raids + WOM competitions
│   ├── rolepanel.js            # Role selection panel
│   └── welcome.js              # TOS panel + mod approval flow
└── utils/
    ├── storage.js              # SOTW/BOTW win storage (per guild)
    ├── dropStorage.js          # Loot/drop storage (per guild)
    ├── plankStorage.js         # Death storage (per guild)
    ├── raidStorage.js          # Raid storage (per guild)
    ├── rolePanelStorage.js     # Role panel storage (per guild)
    ├── welcomeStorage.js       # Welcome/TOS + pending approvals (per guild)
    ├── lootStorage.js          # Manual loot submission queue (per guild)
    ├── raidEmbed.js            # Raid embed + button builder
    ├── boardCommandFactory.js  # Factory for SOTW/BOTW command logic
    ├── leaderboardEmbed.js     # Leaderboard embed builder
    └── updateLeaderboard.js    # Auto-updates live leaderboard messages
```
