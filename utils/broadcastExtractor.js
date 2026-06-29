// Ported from fatfingers23/trackscape-discord-bot osrs_broadcast_extractor.rs
const RAID_DROP        = /^(?<player_name>.+?) received special loot from a raid: (?<item>.+?)(?: \((?<value>[,\d]+) coins\))?[.]?$/;
const ITEM_DROP        = /^(?<player_name>.+?) received a drop: (?:(?<quantity>[,\d]+) x )?(?<item>.+?)(?: \((?<value>[,\d]+) coins\))?(?: from .+?)?[.]?$/;
const CLUE_ITEM        = /^(?<player_name>.+?) received a clue item: (?<item>.+?)(?: \((?<value>[,\d]+) coins\))?[.]?$/;
const PET_DROP         = /^(?<player_name>.+?) (?:has a funny feeling.*?|feels something weird sneaking into (?:her|his) backpack): (?<pet_name>.+?) at (?<count>[,\d]+) (?<count_type>.+?)[.]$/;
const QUEST            = /^(?<player_name>.+?) has completed a quest: (?<quest_name>.+)$/;
const DIARY            = /^(?<player_name>.+?) has completed the (?<diary_tier>Easy|Medium|Hard|Elite) (?<diary_name>.+?).$/;
const PK_WINNER        = /^(?<winner_name>.+?) has defeated (?<loser_name>.+?) and received \((?<gp_value>[0-9,]+) coins\) worth of loot!/;
const PK_LOSER         = /^(?<loser_name>.+?) has been defeated by (?<winner_name>.+?)(?: in (?<location>The Wilderness))?(?: and lost \((?<gp_value>[0-9,]+) coins\) worth of loot)?[!.]/;
const INVITE           = /^(?<clan_joiner>.+?) has been invited into the clan by (?<clan_inviter>.+?).$/;
const LEVEL_MILESTONE  = /^(?<clan_mate>.+?) has reached (?:a )?(?:the highest possible )?(?<skill>.+?) level(?: of)? (?<level>.+?)[!.]/;
const XP_MILESTONE     = /^(?<clan_member>.+?) has reached (?<xp>.+?) XP in (?<skill>.+?)[!.]/;
const COLLECTION_LOG   = /^(?<name>[\w\s]+) received a new collection log item: (?<item>.+?) \((?<number>\d+)\/\d+\)/;
const LEFT_CLAN        = /^(?<player>[\w\s]+) has left the clan.$/;
const EXPELLED         = /^(?<mod>[\w\s]+) has expelled (?<player>[\w\s]+) from the clan.$/;
const COFFER           = /(?<player>[\w\s]+) has (?<action>withdrawn|deposited) (?<gp>[0-9,]+) coins (?:from|into) the coffer./;
const PERSONAL_BEST    = /^(?<player>[\w\s]+) has achieved a new (?<activity>[\w\s\-'.]+) personal best: (?<time>[\d:]+)/;
const PERSONAL_BEST_RAID = /^(?<player>[\w\s]+) has achieved a new (?<raid>[\w\s]+(?:: [\w\s]+)?) \([Tt]eam [Ss]ize: (?<team_size>[\w\s]+)\)(?:(?<variant>[\w\s]+)?) personal best: (?<time>[\d:.]+)/;

function stripTags(msg) {
  return msg
    .replace(/<img=\d+>\s?/g, '')
    .replace(/<col=[^>]+>/g, '')
    .replace(/<\/col>/g, '')
    .trim();
}

function parseGp(str) {
  if (!str) return null;
  return parseInt(str.replace(/,/g, ''), 10) || null;
}

function extractBroadcast(rawMessage) {
  const message = stripTags(rawMessage);
  let m;

  m = message.match(RAID_DROP);
  if (m) return { type: 'RaidDrop', player: m.groups.player_name, item: m.groups.item, value: parseGp(m.groups.value) };

  m = message.match(PET_DROP);
  if (m) return { type: 'PetDrop', player: m.groups.player_name, pet: m.groups.pet_name, count: m.groups.count, countType: m.groups.count_type };

  m = message.match(ITEM_DROP);
  if (m) return { type: 'ItemDrop', player: m.groups.player_name, item: m.groups.item, quantity: parseGp(m.groups.quantity) ?? 1, value: parseGp(m.groups.value) };

  m = message.match(CLUE_ITEM);
  if (m) return { type: 'ClueItem', player: m.groups.player_name, item: m.groups.item, value: parseGp(m.groups.value) };

  m = message.match(QUEST);
  if (m) return { type: 'Quest', player: m.groups.player_name, quest: m.groups.quest_name };

  m = message.match(DIARY);
  if (m) return { type: 'Diary', player: m.groups.player_name, diary: m.groups.diary_name, tier: m.groups.diary_tier };

  m = message.match(PERSONAL_BEST_RAID);
  if (m) return { type: 'PersonalBest', player: m.groups.player, activity: `${m.groups.raid} (Team Size: ${m.groups.team_size})`, time: m.groups.time };

  m = message.match(PERSONAL_BEST);
  if (m) return { type: 'PersonalBest', player: m.groups.player, activity: m.groups.activity.trim(), time: m.groups.time };

  m = message.match(COLLECTION_LOG);
  if (m) return { type: 'CollectionLog', player: m.groups.name, item: m.groups.item, slots: parseInt(m.groups.number, 10) };

  m = message.match(LEVEL_MILESTONE);
  if (m) return { type: 'LevelMilestone', player: m.groups.clan_mate, skill: m.groups.skill, level: m.groups.level };

  m = message.match(XP_MILESTONE);
  if (m) return { type: 'XPMilestone', player: m.groups.clan_member, skill: m.groups.skill, xp: m.groups.xp };

  m = message.match(PK_WINNER);
  if (m) return { type: 'PK', player: m.groups.winner_name, opponent: m.groups.loser_name, gp: parseGp(m.groups.gp_value), won: true };

  m = message.match(PK_LOSER);
  if (m) return { type: 'PK', player: m.groups.loser_name, opponent: m.groups.winner_name, gp: parseGp(m.groups.gp_value), won: false };

  m = message.match(INVITE);
  if (m) return { type: 'Invite', player: m.groups.clan_joiner, invitedBy: m.groups.clan_inviter };

  m = message.match(LEFT_CLAN);
  if (m) return { type: 'LeftClan', player: m.groups.player };

  m = message.match(EXPELLED);
  if (m) return { type: 'Expelled', player: m.groups.player, mod: m.groups.mod };

  m = message.match(COFFER);
  if (m) return { type: 'Coffer', player: m.groups.player, gp: parseGp(m.groups.gp), action: m.groups.action };

  return null;
}

module.exports = { extractBroadcast, stripTags };
