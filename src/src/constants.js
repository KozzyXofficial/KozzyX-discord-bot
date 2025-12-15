/* Auto-split from original bot file */
import { Collection } from 'discord.js';

const BOT_OWNER_ID = "1172433512364769342";
const TICKET_TRANSCRIPTS_FILE = "./bot_error_transcripts.jsonl";

const WIN_AMOUNT = 20000;
const LOSS_AMOUNT = 10000;
const COOLDOWN = 60 * 1000;
const AUTORESPONDERS_FILE = "./autoresponders.json";
const WARNINGS_FILE = "./warnings.json";
const SETTINGS_FILE = "./settings.json";
const WEEKLY_COOLDOWN = 7 * 24 * 60 * 60 * 1000;

// ---------------- COLLECTIONS / MAPS ----------------
const cooldowns = new Collection();

export {
  BOT_OWNER_ID,
  TICKET_TRANSCRIPTS_FILE,
  WIN_AMOUNT,
  LOSS_AMOUNT,
  COOLDOWN,
  AUTORESPONDERS_FILE,
  WARNINGS_FILE,
  SETTINGS_FILE,
  WEEKLY_COOLDOWN,
  cooldowns
};
