-- =====================================================================
-- Clan Leaderboard Bot — Supabase Schema
-- Paste this entire file into the Supabase SQL Editor and run it.
-- =====================================================================

-- Guild configuration (replaces channelId fields scattered across JSON files)
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id              text PRIMARY KEY,
  drops_channel_id      text,
  planks_channel_id     text,
  trackscape_code       text UNIQUE,
  clanchat_channel_id   text,
  broadcast_channel_id  text
);

-- If the table already exists, add the TrackScape columns
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS trackscape_code      text UNIQUE;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS clanchat_channel_id  text;
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS broadcast_channel_id text;

-- If name_changes doesn't exist yet, the CREATE TABLE IF NOT EXISTS above handles it.
-- If you added it manually without changed_at, run:
-- ALTER TABLE name_changes ADD COLUMN IF NOT EXISTS changed_at timestamptz DEFAULT now();

-- Individual drop (loot) events — one row per embed processed
CREATE TABLE IF NOT EXISTS drops (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id           text NOT NULL,
  player_name        text NOT NULL,
  gp_value           bigint NOT NULL,
  item_name          text,
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  discord_message_id text,
  embed_index        integer NOT NULL DEFAULT 0
);

-- Prevents a message embed from being counted twice if processed more than once
CREATE UNIQUE INDEX IF NOT EXISTS drops_message_dedup
  ON drops (guild_id, discord_message_id, embed_index)
  WHERE discord_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS drops_guild_time ON drops (guild_id, recorded_at DESC);

-- Individual death (plank) events — one row per death
CREATE TABLE IF NOT EXISTS planks (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id           text NOT NULL,
  player_name        text NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  discord_message_id text
);

CREATE UNIQUE INDEX IF NOT EXISTS planks_message_dedup
  ON planks (guild_id, discord_message_id)
  WHERE discord_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS planks_guild_time ON planks (guild_id, recorded_at DESC);

-- Name change history — maps old RSNs to current name for scrape integrity
CREATE TABLE IF NOT EXISTS name_changes (
  guild_id   text NOT NULL,
  old_name   text NOT NULL,
  new_name   text NOT NULL,
  changed_at timestamptz DEFAULT now(),
  PRIMARY KEY (guild_id, old_name)
);

-- =====================================================================
-- Row Level Security
-- The bot uses the service role key (bypasses RLS).
-- The website uses the anon key (respects RLS — read-only public access).
-- =====================================================================

ALTER TABLE guild_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE planks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read drops"  ON drops  FOR SELECT USING (true);
CREATE POLICY "public read planks" ON planks FOR SELECT USING (true);

-- =====================================================================
-- Leaderboard SQL functions (called via supabase.rpc())
-- SECURITY DEFINER = runs as owner, bypassing RLS for aggregation
-- =====================================================================

CREATE OR REPLACE FUNCTION monthly_drop_leaderboard(p_guild_id text)
RETURNS TABLE(player_name text, total bigint) AS $$
  SELECT LOWER(player_name), SUM(gp_value)::bigint AS total
  FROM drops
  WHERE guild_id = p_guild_id
    AND date_trunc('month', recorded_at AT TIME ZONE 'UTC')
        = date_trunc('month', now() AT TIME ZONE 'UTC')
  GROUP BY LOWER(player_name)
  ORDER BY total DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION alltime_drop_leaderboard(p_guild_id text)
RETURNS TABLE(player_name text, total bigint) AS $$
  SELECT LOWER(player_name), SUM(gp_value)::bigint AS total
  FROM drops
  WHERE guild_id = p_guild_id
  GROUP BY LOWER(player_name)
  ORDER BY total DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION monthly_plank_leaderboard(p_guild_id text)
RETURNS TABLE(player_name text, count bigint) AS $$
  SELECT LOWER(player_name), COUNT(*)::bigint AS count
  FROM planks
  WHERE guild_id = p_guild_id
    AND date_trunc('month', recorded_at AT TIME ZONE 'UTC')
        = date_trunc('month', now() AT TIME ZONE 'UTC')
  GROUP BY LOWER(player_name)
  ORDER BY count DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION alltime_plank_leaderboard(p_guild_id text)
RETURNS TABLE(player_name text, count bigint) AS $$
  SELECT LOWER(player_name), COUNT(*)::bigint AS count
  FROM planks
  WHERE guild_id = p_guild_id
  GROUP BY LOWER(player_name)
  ORDER BY count DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Allow the website's anon key to call these functions
GRANT EXECUTE ON FUNCTION monthly_drop_leaderboard(text)  TO anon;
GRANT EXECUTE ON FUNCTION alltime_drop_leaderboard(text)  TO anon;
GRANT EXECUTE ON FUNCTION monthly_plank_leaderboard(text) TO anon;
GRANT EXECUTE ON FUNCTION alltime_plank_leaderboard(text) TO anon;

-- =====================================================================
-- Seed: guild config only.
-- Drop/plank data is populated automatically on bot startup via
-- retroParseGuild(), which scans channel history for the current month.
-- Run /lootboard scrape to import full all-time channel history.
-- =====================================================================

INSERT INTO guild_config (guild_id, drops_channel_id, planks_channel_id)
VALUES ('1507110016342167622', '1514356163569782944', '1513189530264670248')
ON CONFLICT (guild_id) DO NOTHING;
