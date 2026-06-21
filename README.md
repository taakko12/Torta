# Clan Leaderboard Bot

A Discord bot that tracks event wins for your clan across **multiple independent
leaderboards** (e.g. Skill of the Week and Boss of the Week) and keeps a live,
auto-updating embed for each one showing the top 3 members.

## Commands

**Skill of the Week (SOTW)**

| Command | Who can use it | What it does |
|---|---|---|
| `/addsotw @user [amount]` | Manage Server permission | Adds SOTW wins (default 1) to a member |
| `/removesotw @user [amount]` | Manage Server permission | Removes SOTW wins (default 1) from a member |
| `/setsotw @user amount` | Manage Server permission | Sets a member's SOTW win count directly |
| `/sotw [@user]` | Everyone | Check your own or someone's SOTW win count |
| `/sotwleaderboard` | Manage Server permission | Posts the live SOTW leaderboard embed in the current channel |

**Boss of the Week (BOTW)**

| Command | Who can use it | What it does |
|---|---|---|
| `/addbotw @user [amount]` | Manage Server permission | Adds BOTW wins (default 1) to a member |
| `/removebotw @user [amount]` | Manage Server permission | Removes BOTW wins (default 1) from a member |
| `/setbotw @user amount` | Manage Server permission | Sets a member's BOTW win count directly |
| `/botw [@user]` | Everyone | Check your own or someone's BOTW win count |
| `/botwleaderboard` | Manage Server permission | Posts the live BOTW leaderboard embed in the current channel |

Each leaderboard tracks its own message independently — you can post SOTW in one
channel and BOTW in a different channel (or the same one), and they'll each
auto-update on their own.

### Adding a third leaderboard later

All the command logic lives in `utils/boardCommandFactory.js` as reusable factory
functions. To add a new leaderboard (say, "Boss of the Month"), you'd just create
5 new tiny command files following the pattern of the `sotw`/`botw` ones, each
pointing at a new `boardKey` like `"botm"`. No changes needed to `index.js`,
`storage.js`, or the embed logic.

## 1. Create the Discord Application & Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Name it (e.g. "Clan Leaderboard"), then go to the **Bot** tab.
3. Click **Reset Token** to reveal your bot token — copy it, you'll need it shortly.
4. Under **Privileged Gateway Intents**, you don't need to enable anything extra for this bot.
5. Go to **OAuth2 → URL Generator**:
   - Scopes: check `bot` and `applications.commands`
   - Bot Permissions: check `Send Messages`, `Embed Links`, `Read Message History`, `View Channel`
   - Copy the generated URL, open it in your browser, and invite the bot to your server.
6. From **General Information**, copy the **Application ID** — this is your `CLIENT_ID`.

## 2. Configure the project

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `DISCORD_TOKEN` — from the Bot tab
- `CLIENT_ID` — your Application ID
- `GUILD_ID` — your Discord server's ID (right-click the server icon → Copy Server ID;
  enable Developer Mode in Discord Settings → Advanced first if you don't see this option).
  This makes commands appear instantly while testing. You can remove this line later
  for a global bot, but global command updates take up to an hour to propagate.

## 3. Install dependencies & deploy commands

```bash
npm install
npm run deploy-commands
```

You should see `✅ Guild commands deployed.` — refresh Discord and you'll see the
slash commands available in your server.

## 4. Run the bot

```bash
npm start
```

You should see `✅ Logged in as YourBotName#0000` in the console.

Then in Discord:
- Go to your SOTW leaderboard channel and run `/sotwleaderboard` once.
- Go to your BOTW leaderboard channel (can be the same channel or a different one) and run `/botwleaderboard` once.

From then on, `/addsotw`/`/removesotw`/`/setsotw` will auto-update the SOTW message,
and `/addbotw`/`/removebotw`/`/setbotw` will auto-update the BOTW message — independently.

## Restricting commands further

By default, `/addsotw`, `/removesotw`, `/setsotw`, `/sotwleaderboard` (and the
matching `botw` versions) require the **Manage Server** permission. If you'd
rather restrict them to a specific "Event Host" role instead:
1. In Discord, go to **Server Settings → Integrations → [Your Bot]**.
2. You can override per-command permissions there without touching any code —
   assign specific roles or members to each command.

## Deploying to a VPS / cloud host (Railway, Render, a droplet, etc.)

This bot has no web server — it's a long-running process, so use a "worker" or
"background service" deployment type if your host distinguishes between them.

General steps for most hosts (Railway, Render, etc.):
1. Push this project to a GitHub repo (the `.gitignore` already excludes `.env`
   and `node_modules`).
2. Create a new service on your host, pointing it at that repo.
3. Set **Start Command** to `npm start` and **Build Command** to `npm install`.
4. Add the same three environment variables (`DISCORD_TOKEN`, `CLIENT_ID`,
   `GUILD_ID`) in the host's dashboard — never commit them to GitHub.
5. **Important:** wins are stored in `data/wins.json` on local disk. Most cloud
   hosts use **ephemeral filesystems**, meaning that file gets wiped on every
   redeploy or restart. Check whether your host offers a **persistent
   volume/disk** and mount it at the `data/` folder so your win counts survive
   restarts. (Railway and Render both offer this as an add-on — look for
   "Volumes" or "Persistent Disks" in their docs.) If you'd rather not deal
   with volumes, let me know and I can switch this to SQLite or a small
   hosted Postgres instance instead — those handle persistence automatically
   on most platforms.
6. Run `npm run deploy-commands` once (either locally with the same `.env`, or
   as a one-off command on the host) any time you add/change a command.
7. Deploy — the bot logs in and stays connected as long as the service is running.

## Project structure

```
clan-leaderboard-bot/
├── index.js                       # Bot entry point, loads commands & listens for interactions
├── deploy-commands.js             # Registers slash commands with Discord
├── commands/
│   ├── addsotw.js / removesotw.js / setsotw.js / sotw.js / sotwleaderboard.js
│   └── addbotw.js / removebotw.js / setbotw.js / botw.js / botwleaderboard.js
├── utils/
│   ├── storage.js                 # Reads/writes data/wins.json, supports multiple boards
│   ├── boardCommandFactory.js     # Generates add/remove/set/check/leaderboard commands for any board
│   ├── leaderboardEmbed.js        # Builds the top-3 embed for a given board
│   └── updateLeaderboard.js       # Edits a board's live leaderboard message
└── data/
    └── wins.json                  # Created automatically on first run, holds all boards
```
