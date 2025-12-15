/* Main bot logic (split from original) */
import {
  Events,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import { promises as fs } from "fs";

import { client } from "./client.js";
import { BOT_OWNER_ID, AUTORESPONDERS_FILE, WARNINGS_FILE, SETTINGS_FILE, TICKET_TRANSCRIPTS_FILE, cooldowns } from "./config/constants.js";
import { staticAutoResponses } from "./data/staticAutoresponders.js";
import {
  BOOSTER_DB_FILE,
  boosterRolesDB,
  dynamicAutoResponses,
  warnings,
  serverSettings,
  afkMap,
  recentBans,
  addMoney,
  getUserCosmetics
} from "./state.js";

import {
  loadDynamicAutoresponders,
  saveDynamicAutoresponders,
  loadWarnings,
  saveWarnings,
  getGuildSettings,
  loadSettings,
  saveSettings,
  logToGuild
} from "./utils/storage.js";

import { warnKey, getWarningData } from "./utils/warnings.js";

// Treat as emoji ONLY if it's either a proper Discord emoji like <:name:id>
// or a single unicode emoji character. Short words like "ok" or "lol" will
// now be sent as a normal text reply instead of a reaction.
function isEmojiResponse(str) {
    if (!str) return false;
    const trimmed = str.trim();

    // Custom emoji format: <:name:id> or <a:name:id>
    if (/^<a?:[a-zA-Z0-9_]+:\d+>$/.test(trimmed)) return true;

    // Single unicode emoji (rough check: one visible glyph, no whitespace)
    if (!/\s/.test(trimmed)) {
        const codePoints = Array.from(trimmed);
        if (codePoints.length === 1) {
            return true;
        }
    }

    return false;
}

const generalHelpCommands = [
    "/help — Command overview",
    "/modhelp — Moderator help",
    "/features — Bot feature list",
    "/afk — Set your AFK status",
    "/userinfo — View user info",
    "/serverinfo — View server info",
    "/avatar — View a user's avatar",
    "/banner — View a user's banner",
    "/remind — Set a reminder",
    "/translate — Translate text",
    "/define — Look up a word",
];


const funHelpCommands = [
    "/hug — Send a hug",
    "/roast — Roast someone",
    "/topic — Conversation topic",
    "/ship — Ship two users"
];


function buildHelpPages(commands, iconTitle) {
    const pages = [];
    for (let i = 0; i < commands.length; i += 3) {
        const pageCommands = commands.slice(i, i + 3).join("\n\n");
        const pageNum = pages.length + 1;
        const total = Math.ceil(commands.length / 3);

        const embed = new EmbedBuilder()
            .setTitle(`${iconTitle} (${pageNum}/${total})`)
            .setDescription(pageCommands)
            .setColor(0x3498db);

        pages.push(embed);
    }
    return pages;
}

const helpPages = {
    general: buildHelpPages(generalHelpCommands, "📚 General Help"),
    fun: buildHelpPages(funHelpCommands, "🎉 Fun Help")
};



// ---------- MODERATOR HELP PAGES (PAGED) ----------
const modHelpPages = [];

// Page 1 — Moderation
modHelpPages.push(
    new EmbedBuilder()
        .setTitle("🔧 Moderator Help (1/4)")
        .setDescription(
            "🔧 Moderation\n\n" +
            "`,kick @user [reason]` – Kick a user.\n" +
            "`,ban @user [reason]` – Ban a user with a themed message.\n" +
            "`,damage @user <time>` – Timeout a user (e.g. 10m, 1h).\n" +
            "`,heal @user` – Remove a timeout.\n" +
            "`,dm @user <message>` – DM a user (admins only)."
        )
        .setColor(0xed4245)
);

// Page 2 — Roles / Booster / Server Tools
modHelpPages.push(
    new EmbedBuilder()
        .setTitle("🔧 Moderator Help (2/4)")
        .setDescription(
            "🎭 Roles\n\n" +
            "`,role add <username> <role>` – Give a role to a user.\n" +
            "`,role remove <username> <role>` – Remove a role from a user.\n\n" +
            "💎 Booster System\n\n" +
            "`,boosterrole create <name>` – Create a personal booster role.\n" +
            "`,boosterrole color <hex>` – Change booster role color.\n\n" +
            "🛠️ Server Tools\n\n" +
            "`,log_channel #channel` – Set the log channel.\n" +
            "`,ticket_channel #channel` – Set ticket panel/log channel.\n" +
            "`,apply_open` – Open staff applications.\n" +
            "`,apply_close` – Close staff applications.\n" +
            "`,apply_channel #channel` – Set applications panel channel."
        )
        .setColor(0xed4245)
);

// Page 3 — Auto-responder / Warnings
modHelpPages.push(
    new EmbedBuilder()
        .setTitle("🔧 Moderator Help (3/4)")
        .setDescription(
            "🤖 Auto-Responder\n\n" +
            "`,autoresponder add <trigger> <response>` – Add a custom auto-reply.\n" +
            "`,autoresponder remove <trigger>` – Remove a trigger.\n" +
            "`,autoresponder list` – List all autoresponders.\n\n" +
            "⚠️ Warnings\n\n" +
            "`,warn @user [reason]` – Warn a user (auto-timeout at 5 warns).\n" +
            "`,warn remove @user [count]` – Remove warnings.\n" +
            "`,warnings [@user]` – View warnings.\n" +
            "`,clearwarns @user` – Clear all warnings.\n" +
            "`,warnthreshold add <count> <action> [minutes]` – Add auto-action at a warn count.\n" +
            "`,warnthreshold remove <count>` – Remove a warn threshold.\n" +
            "`,warnthreshold list` – View current warn thresholds."
        )
        .setColor(0xed4245)
);

// Page 4 — Extra Moderation Tools
modHelpPages.push(
    new EmbedBuilder()
        .setTitle("🔧 Moderator Help (4/4)")
        .setDescription(
            "🧱 Channel Controls\n\n" +
            "`,lock [#channel] [reason]` – Lock a text channel.\n" +
            "`,unlock [#channel]` – Unlock a text channel.\n" +
            "`,slowmode [#channel] <seconds|off>` – Set channel slowmode.\n\n" +
            "🧹 Message Cleanup\n\n" +
            "`,clear <amount>` – Bulk delete up to 100 recent messages in the current channel.\n\n" +
            "👤 User Management\n\n" +
            "`,ban @user [reason]` – Ban a user with an optional reason.\n" +
            "`,nick @user <new nickname>` – Change a user's nickname.\n" +
            "`,nicklock @user` – Lock a user's nickname.\n" +
            "`,nickunlock @user` – Unlock a user's nickname."
        )
        .setColor(0xed4245)
);


async function sendPagedHelp(interaction, category, page = 0) {
    const pages = helpPages[category];
    const embed = pages[page];

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`help_prev_${category}_${page}`)
            .setLabel("⬅ Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`help_next_${category}_${page}`)
            .setLabel("Next ➡")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === pages.length - 1)
    );

    // If this came from a slash command, its initial reply was deferred,
    // so we edit that reply. If it came from a button, we update the message.
    if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
        return interaction.editReply({ embeds: [embed], components: [row] });
    } else {
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("help_")) return;

    const parts = interaction.customId.split("_");
    const direction = parts[1];
    const category = parts[2];
    const currentPage = parseInt(parts[3]);

    const newPage = direction === "next" ? currentPage + 1 : currentPage - 1;

    // Directly update the message; sendPagedHelp will call interaction.update().
    return sendPagedHelp(interaction, category, newPage);
});

async function sendModHelpPage(interaction, page = 0) {
    const embed = modHelpPages[page];

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`modhelp_prev_${page}`)
            .setLabel("⬅ Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`modhelp_next_${page}`)
            .setLabel("Next ➡")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === modHelpPages.length - 1)
    );

    if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
        return interaction.editReply({ embeds: [embed], components: [row] });
    } else {
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("modhelp_")) return;

    const parts = interaction.customId.split("_");
    const direction = parts[1];
    const currentPage = parseInt(parts[2]);

    const newPage = direction === "next" ? currentPage + 1 : currentPage - 1;

    // Directly update the message; sendModHelpPage will call interaction.update().
    return sendModHelpPage(interaction, newPage);
});

async function handleRoast(interaction) {
    const target = interaction.options.getUser("user") || interaction.user;
    const line = roastLines[Math.floor(Math.random() * roastLines.length)];

    return interaction.editReply(
        `🔥 **Roast for ${target.username}:**\n${line}`
    );
}

async function handleHug(interaction) {
    const target = interaction.options.getUser("user") || interaction.user;
    const gif = hugGifs[Math.floor(Math.random() * hugGifs.length)];

    const embed = new EmbedBuilder()
        .setTitle(`🤗 ${interaction.user.username} hugs ${target.username}!`)
        .setImage(gif)
        .setColor(0xffc0cb);

    return interaction.editReply({ embeds: [embed] });
}

async function handleShip(interaction) {
    const user1 = interaction.options.getUser("user1");
    const user2 = interaction.options.getUser("user2");

    if (!user1 || !user2) {
        return interaction.editReply("❌ You must choose two users to ship.");
    }

    const score = Math.floor(Math.random() * 101);
    const heart =
        score > 80 ? "💖" :
        score > 50 ? "❤️" :
        score > 30 ? "💘" :
        "💔";

    return interaction.editReply(
        `💞 **Shipping ${user1.username} + ${user2.username}**\nCompatibility: **${score}%** ${heart}`
    );
}

// /afk
async function handleAfkSlash(interaction) {
    const reason = interaction.options.getString("reason") || "AFK";
    afkMap.set(interaction.user.id, { reason, since: Date.now() });

    return interaction.editReply(`💤 You are now AFK: **${reason}**`);
}

// /userinfo
async function handleUserInfo(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = interaction.guild?.members.cache.get(user.id);

    const embed = new EmbedBuilder()
        .setTitle(`👤 User Info: ${user.tag}`)
        .setThumbnail(user.displayAvatarURL({ size: 1024 }))
        .addFields(
            { name: "ID", value: user.id, inline: true },
            { name: "Bot", value: user.bot ? "Yes" : "No", inline: true },
            { name: "Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        )
        .setColor(0x3498db);

    if (member) {
        embed.addFields(
            { name: "Joined Server", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
            { name: "Highest Role", value: member.roles.highest?.toString() || "None", inline: true }
        );
    }

    return interaction.editReply({ embeds: [embed] });
}

// /serverinfo
async function handleServerInfo(interaction) {
    const guild = interaction.guild;
    if (!guild) {
        return interaction.editReply("❌ This command can only be used in a server.");
    }

    const embed = new EmbedBuilder()
        .setTitle(`🏠 Server Info: ${guild.name}`)
        .setThumbnail(guild.iconURL({ size: 1024 }))
        .addFields(
            { name: "ID", value: guild.id, inline: true },
            { name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
            { name: "Members", value: `${guild.memberCount}`, inline: true },
            { name: "Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
        )
        .setColor(0x2ecc71);

    return interaction.editReply({ embeds: [embed] });
}

// /avatar
async function handleAvatar(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;

    const embed = new EmbedBuilder()
        .setTitle(`🖼 Avatar of ${user.tag}`)
        .setImage(user.displayAvatarURL({ size: 1024 }))
        .setColor(0x9b59b6);

    return interaction.editReply({ embeds: [embed] });
}

// /banner  (will show avatar if the user has no banner available via cache)
async function handleBanner(interaction) {
    const user = interaction.options.getUser("user") || interaction.user;

    // Fetch full user to try to get banner (requires correct intents and caching)
    const fetched = await interaction.client.users.fetch(user.id, { force: true }).catch(() => null);

    const bannerUrl = fetched?.bannerURL({ size: 1024 });

    const embed = new EmbedBuilder()
        .setTitle(`🎏 Banner of ${user.tag}`)
        .setColor(0xe67e22);

    if (bannerUrl) {
        embed.setImage(bannerUrl);
    } else {
        embed.setDescription("This user doesn't seem to have a visible banner. Showing avatar instead:");
        embed.setImage(user.displayAvatarURL({ size: 1024 }));
    }

    return interaction.editReply({ embeds: [embed] });
}

// Helper for /remind – parse e.g. "10m", "1h", "30s"
function parseDurationToMs(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)(s|m|h|d)?$/i);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = (match[2] || "m").toLowerCase();
    if (unit === "s") return value * 1000;
    if (unit === "m") return value * 60 * 1000;
    if (unit === "h") return value * 60 * 60 * 1000;
    if (unit === "d") return value * 24 * 60 * 60 * 1000;
    return null;
}

// /remind
async function handleRemind(interaction) {
    const timeStr = interaction.options.getString("time", true);
    const text = interaction.options.getString("message", true);

    const ms = parseDurationToMs(timeStr);
    if (!ms || ms <= 0) {
        return interaction.editReply("❌ Invalid time format. Try something like `10m`, `1h`, `30s`.");
    }

    await interaction.editReply(
        `⏰ Okay, I'll remind you in **${timeStr}** about: **${text}**`
    );

    // Simple in-memory reminder (only works while bot is running)
    setTimeout(() => {
        interaction.followUp({
            content: `⏰ <@${interaction.user.id}> Reminder: **${text}**`,
            allowedMentions: { users: [interaction.user.id] }
        }).catch(() => {});
    }, ms);
}

// /translate (stub – doesn’t actually call an API yet)
async function handleTranslate(interaction) {
    const text = interaction.options.getString("text", true);
    const to = interaction.options.getString("to", true);

    return interaction.editReply(
        `🌐 (Placeholder) I would translate:\n` +
        `> **${text}**\n` +
        `to **${to}**, but the translation system isn't configured yet.`
    );
}

// /define (stub)
async function handleDefine(interaction) {
    const word = interaction.options.getString("word", true);
    return interaction.editReply(
        `📚 (Placeholder) Definition lookup for **${word}** isn't set up yet.`
    );
}

// /topic
const topics = [
    "If you could instantly master any skill, what would it be and why?",
    "What’s a game, show, or series you think is underrated?",
    "If you could live inside any fictional universe, which one would you pick?",
    "What’s the funniest thing that has happened to you recently?",
    "If you could bring one fictional character to life, who would it be?"
];

async function handleTopic(interaction) {
    const topic = topics[Math.floor(Math.random() * topics.length)];
    return interaction.editReply(`💬 **Conversation topic:** ${topic}`);
}

const featureList = [
    {
        name: "💤 AFK System",
        value: "• `/afk` to set AFK\n• Alerts others when pinged\n• Auto-remove on message"
    },
    {
        name: "🤖 Autoresponders",
        value: "• Static keyword triggers\n• Fully customizable auto-replies via `,autoresponder`\n• Supports emojis & text"
    },
    {
        name: "💎 Booster Custom Role System",
        value: "Server boosters can create and edit personal roles:\n`,boosterrole create <name>`\n`,boosterrole color <hex>`"
    },
    {
        name: "📨 DM Relay",
        value: "Admins can DM users via `,dm`. User replies appear in the bot terminal."
    },
    {
        name: "🎫 Tickets & Applications",
        value: "• Ticket panels with categories\n• Close button\n• Staff auto-permission handling"
    },
    {
        name: "📊 Logging",
        value: "Logs kicks, bans, warnings, tickets, applications, and more into the configured log channel."
    },

    {
        name: "🧠 Smart Cooldown Engine",
        value: "Per-user command cooldowns that prevent spam & errors."
    }
];

// Generate pages (3 per page)
const featureHelpPages = [];
for (let i = 0; i < featureList.length; i += 3) {
    const slice = featureList.slice(i, i + 3);

    const embed = new EmbedBuilder()
        .setTitle(`🔧 Bot Features (${featureHelpPages.length + 1}/${Math.ceil(featureList.length / 3)})`)
        .setColor(0xed4245)
        .setDescription("Here are the bot’s background systems and automatic features:")
        .addFields(slice.map(f => ({ name: f.name, value: f.value })));

    featureHelpPages.push(embed);
}

async function sendFeatureHelpPage(interaction, page = 0) {
    const embed = featureHelpPages[page];

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`features_prev_${page}`)
            .setLabel("⬅ Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`features_next_${page}`)
            .setLabel("Next ➡")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === featureHelpPages.length - 1)
    );

    if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
        return interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    } else {
        return interaction.update({
            embeds: [embed],
            components: [row]
        });
    }
}

// FEATURES BUTTON HANDLER
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("features_")) return;

    const parts = interaction.customId.split("_");
    const direction = parts[1];
    const currentPage = parseInt(parts[2]);

    const newPage = direction === "next" ? currentPage + 1 : currentPage - 1;

    // Directly update the message; sendFeatureHelpPage will call interaction.update().
    return sendFeatureHelpPage(interaction, newPage);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const commandName = interaction.commandName;

    try {
        await interaction.deferReply({ ephemeral: false });
    } catch {}

    if (commandName === "help") return sendPagedHelp(interaction, "general", 0);
    if (commandName === "modhelp") return sendModHelpPage(interaction, 0);
    if (commandName === "features") return sendFeatureHelpPage(interaction, 0);

    if (commandName === "afk") return handleAfkSlash(interaction);
    if (commandName === "userinfo") return handleUserInfo(interaction);
    if (commandName === "serverinfo") return handleServerInfo(interaction);
    if (commandName === "avatar") return handleAvatar(interaction);
    if (commandName === "banner") return handleBanner(interaction);

    if (commandName === "remind") return handleRemind(interaction);
    if (commandName === "translate") return handleTranslate(interaction);
    if (commandName === "define") return handleDefine(interaction);

    if (commandName === "hug") return handleHug(interaction);
    if (commandName === "roast") return handleRoast(interaction);
    if (commandName === "ship") return handleShip(interaction);

    if (commandName === "topic") return handleTopic(interaction);
});

// ---------------- MESSAGE COMMAND HANDLER ("," PREFIX) ----------------

client.on(Events.MessageCreate, async (message) => {
    let handled = false;

    if (!message || !message.content || message.author.bot) return;

    const raw = message.content;
    const content = raw.toLowerCase();

    // Remove AFK when user speaks
    const afkEntry = afkMap.get(message.author.id);
    if (afkEntry) {
        afkMap.delete(message.author.id);
        try {
            await message.reply("👋 Welcome back! Your AFK status has been removed.");
        } catch {}
    }

    // Notify if mentioning AFK users
    if (message.mentions.users.size > 0) {
        const lines = [];
        for (const [, user] of message.mentions.users) {
            const entry = afkMap.get(user.id);
            if (entry) {
                const mins = Math.floor((Date.now() - entry.since) / 60000);
                lines.push(
                    `${user.username} is AFK: **${entry.reason}** (${mins} min)`
                );
            }
        }
        if (lines.length > 0) {
            try {
                await message.reply(lines.join("\n"));
            } catch {}
        }
    }

        // OWNER-ONLY HIDDEN COMMANDS (no visible prefix help)
    if (message.author.id === BOT_OWNER_ID) {
        if (content.startsWith(".owner")) {
            try {
                await message.reply(
                    "🔒 **Owner panel**\n" +
                    "Hidden commands:\n" +
                    "`.transcscript` – Print latest bot-error ticket transcripts to console and show a short summary here."
                );
            } catch {}
            return;
        }

        if (content.startsWith(".transcscript")) {
            try {
                let fileData;
                try {
                    fileData = await fs.readFile(TICKET_TRANSCRIPTS_FILE, "utf8");
                } catch {
                    await message.reply("📁 No ticket transcripts saved yet.");
                    return;
                }

                const lines = fileData.split("\n").filter(Boolean);
                const entries = [];
                for (const line of lines) {
                    try {
                        const obj = JSON.parse(line);
                        entries.push(obj);
                    } catch {
                        // ignore bad line
                    }
                }

                const botError = entries.filter(e => e.type === "bot_error");
                if (botError.length === 0) {
                    await message.reply("📁 No **bot error** ticket transcripts saved yet.");
                    return;
                }

                const latest = botError.slice(-3);

                console.log("=== BOT ERROR TICKET TRANSCRIPTS (latest) ===");
                for (const t of latest) {
                    console.log(`Ticket ${t.id} in guild ${t.guildName} (${t.guildId})`);
                    console.log(
                        `Type: ${t.type}, Closed by: ${t.closedByTag} at ${new Date(t.closedAt).toISOString()}`
                    );
                    console.log("Messages:");
                    for (const m of t.messages || []) {
                        console.log(
                            `[${new Date(m.createdTimestamp).toISOString()}] ${m.authorTag || m.authorId}: ${m.content}`
                        );
                    }
                    console.log("----");
                }

                const summaryLines = latest.map(
                    t =>
                        `• **Ticket ${t.id}** in **${t.guildName}** — ${t.messages?.length || 0} messages`
                );

                await message.reply(
                    "📜 Sent latest bot-error ticket transcripts to console.\n" +
                    summaryLines.join("\n")
                );
            } catch (err) {
                console.error("Transcript read error:", err);
                await message.reply("❌ Failed to read transcripts.");
            }
            return;
        }
    }

// AUTORESPONDERS for messages WITHOUT prefix
    if (!raw.startsWith(",")) {
        if (content === "six seven" || content === "67") {
            try {
                await message.reply("SIX SEVEENNNN❤‍🩹");
            } catch {}
        }

        for (const ar of staticAutoResponses) {
            if (ar.pattern.test(raw)) {
                try {
                    await message.reply(ar.reply);
                } catch {}
                return;
            }
        }

        for (const ar of dynamicAutoResponses) {
            const trigger = ar.trigger.toLowerCase();
            const isMatch =
                content === trigger ||
                raw.trim() === trigger ||
                content.includes(trigger);

            if (isMatch) {
                const resp = (ar.response || "").trim();
                if (!resp) return;

                if (isEmojiResponse(resp)) {
                    try {
                        await message.react(resp);
                    } catch {}
                } else {
                    try {
                        await message.reply(resp);
                    } catch {}
                }
                return;
            }
        }

        return;
    }

    // PREFIX COMMANDS START HERE
    if (!message.guild) return;
    const args = raw.slice(1).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    if (!command) return;

    const settings = getGuildSettings(message.guild.id);

    // ---- Nicklock Commands (fixed) ----
    if (command === "nicklock") {
        const target = message.mentions.members.first();
        if (!target) return message.reply("Usage: ,nicklock @user");
        if (!settings.nickLocks) settings.nickLocks = {};
        settings.nickLocks[target.id] = target.nickname || target.user.username;
        saveSettings();
        return message.reply("Nickname locked.");
    }

    if (command === "nickunlock") {
        const target = message.mentions.members.first();
        if (!target) return message.reply("Usage: ,nickunlock @user");
        if (settings.nickLocks) delete settings.nickLocks[target.id];
        saveSettings();
        return message.reply("Nickname unlocked.");
    }

    // ---- Warnthreshold Commands ----
    if (command === "warnthreshold") {
        const sub = args[0];
        if (sub === "add") {
            const count = parseInt(args[1]);
            const action = args[2];
            const time = parseInt(args[3]||"0");
            if (!settings.warnThresholds) settings.warnThresholds = [];
            settings.warnThresholds.push({count, action, time});
            saveSettings();
            return message.reply("Threshold added.");
        }
        if (sub === "remove") {
            const count = parseInt(args[1]);
            if (settings.warnThresholds)
                settings.warnThresholds = settings.warnThresholds.filter(t=>t.count!==count);
            saveSettings();
            return message.reply("Threshold removed.");
        }
        if (sub === "list") {
            const list = (settings.warnThresholds||[]).map(t=>`${t.count}→${t.action}`);
            return message.reply("Thresholds:\n"+list.join("\n"));
        }
        return message.reply("Usage: ,warnthreshold add/remove/list");
    }
// BOOSTER ROLE
    handled = true;
    if (command === "boosterrole") {
        const sub = args[0];
        const isBooster = message.member.roles.cache.some(r => r.tags?.premiumSubscriber);
        const isOwner = message.guild.ownerId === message.author.id;

        if (!isBooster && !isOwner) {
            return message.reply("🚀 Only **Server Boosters** can use this.");
        }

        if (sub === "create") {
            const name = args.slice(1).join(" ");
            if (!name) return message.reply("❌ Usage: `,boosterrole create <name>`");

            const oldId = boosterRolesDB.get(message.author.id);
            if (oldId) {
                const old = message.guild.roles.cache.get(oldId);
                if (old) await old.delete().catch(() => {});
            }

            const role = await message.guild.roles.create({
                name,
                color: "#a64dff"
            });

            await message.member.roles.add(role.id);
            boosterRolesDB.set(message.author.id, role.id);
            await saveBoosterRoles();

            return message.reply(`✅ Created booster role **${name}**!`);
        }

        if (sub === "color") {
            const hex = args[1];
            if (!hex) return message.reply("❌ Usage: `,boosterrole color #ff55ff`");

            const roleId = boosterRolesDB.get(message.author.id);
            if (!roleId) {
                return message.reply("❌ You don't have a booster role yet. Use `,boosterrole create <name>`");
            }

            const role = message.guild.roles.cache.get(roleId);
            if (!role) {
                return message.reply("❌ Your booster role no longer exists. Create a new one.");
            }

            await role.setColor(hex);
            return message.reply(`✅ Updated color to **${hex}**!`);
        }

        return message.reply(
            "❌ Invalid usage:\n" +
            "`,boosterrole create <name>`\n" +
            "`,boosterrole color <hex>`"
        );
    }

    // TEXT AFK
    handled = true;
    if (command === "afk") {
        const reason = args.join(" ") || "AFK";
        afkMap.set(message.author.id, { reason, since: Date.now() });
        return message.reply(`💤 You are now AFK: **${reason}**`);
    }

    // KICK
    handled = true;
    if (command === "kick") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return message.reply("❌ You need **Kick Members** permission.");
        }

        const target = message.mentions.members.first();
        const reason = args.slice(1).join(" ") || "No reason provided.";

        if (!target) {
            return message.reply("❌ Usage: `,kick @user [reason]`");
        }

        try {
            // DM the user about the kick
            try {
                await target.user.send(
                    `You were kicked from **${message.guild.name}** by **${message.author.tag}**.\nReason: ${reason}`
                );
            } catch {
                // ignore DM failure
            }

            await target.kick(reason);
            await logToGuild(message.guild, `👢 **${target.user.tag}** was kicked by **${message.author.tag}**. Reason: ${reason}`);
            return message.reply(`✅ Kicked **${target.user.tag}**.`);
        } catch {
            return message.reply("❌ Failed to kick that user.");
        }
    }

    // DAMAGE (TIMEOUT) — fixed unreachable log
    handled = true;
    if (command === "damage") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply("❌ You need **Timeout Members** permission.");
        }

        const target = message.mentions.members.first();
        if (!target) {
            return message.reply("❌ Usage: `,damage @user [time]` (e.g. 10m, 1h)");
        }

        const timeArg = args.find(a => !a.startsWith("<@"));
        let ms = 10 * 60 * 1000;
        if (timeArg) {
            const match = timeArg.match(/^(\d+)(s|m|h|d)?$/i);
            if (match) {
                const value = parseInt(match[1], 10);
                const unit = (match[2] || "m").toLowerCase();
                if (unit === "s") ms = value * 1000;
                else if (unit === "m") ms = value * 60 * 1000;
                else if (unit === "h") ms = value * 60 * 60 * 1000;
                else if (unit === "d") ms = value * 24 * 60 * 60 * 1000;
            }
        }

        try {
            // DM the user about the timeout
            try {
                await target.user.send(
                    `You were timed out in **${message.guild.name}** by **${message.author.tag}** for **${Math.round(ms / 60000)} minutes**.`
                );
            } catch {
                // ignore DM failure
            }

            await target.timeout(ms, `Damaged by ${message.author.tag}`);
            await message.reply(`⏱️ Timed out ${target} for **${Math.round(ms / 60000)} minutes**.`);
            await logToGuild(message.guild, `⏱️ ${target.user.tag} was timed out by ${message.author.tag} for ${Math.round(ms / 60000)}m.`);
            return;
        } catch (err) {
            console.error("Timeout error:", err);
            return message.reply("❌ Failed to timeout user.");
        }
    }

    // DM
    if (command === "dm") {
        handled = true;

        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ Only **Administrators** can use `,dm`.");
        }

        const target = message.mentions.users.first();
        if (!target) return message.reply("❌ You must mention a user to DM.");

        const textMsg = args.slice(1).join(" ");
        if (!textMsg) return message.reply("❌ You must provide a message to send.");

        try {
            await target.send(`📩 **Message from ${message.author.tag}:**\n${textMsg}`);
            return message.reply(`✅ Message sent to **${target.tag}**.`);
        } catch (err) {
            console.error(err);
            return message.reply("❌ Could not send DM to that user.");
        }
    }

    // HEAL (REMOVE TIMEOUT)
    handled = true;
    if (command === "heal") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply("❌ You need **Timeout Members** permission.");
        }

        const target = message.mentions.members.first();
        if (!target) {
            return message.reply("❌ Usage: `,heal @user`");
        }

        try {
            // DM the user about timeout removal
            try {
                await target.user.send(
                    `Your timeout in **${message.guild.name}** was removed by **${message.author.tag}**.`
                );
            } catch {
                // ignore DM failure
            }

            await target.timeout(null, `Healed by ${message.author.tag}`);
            await message.reply(`✅ Removed timeout from ${target}.`);
            await logToGuild(message.guild, `✅ ${target.user.tag} was healed (timeout removed) by ${message.author.tag}.`);
        } catch (err) {
            console.error("Heal error:", err);
            return message.reply("❌ Failed to remove timeout.");
        }
    }

    // ROLE ADD/REMOVE
    handled = true;
    if (command === "role") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply("❌ You need **Manage Roles** to use this command.");
        }

        const action = (args.shift() || "").toLowerCase();
        if (!["add", "remove"].includes(action)) {
            return message.reply("❌ Usage: `,role add <username/@user> <role>` or `,role remove <username/@user> <role>`");
        }

        let target = message.mentions.members.first();
        let userArg = null;

        if (!target) {
            userArg = args.shift();
            if (!userArg) {
                return message.reply("❌ You must specify a user.");
            }
            const search = userArg.toLowerCase();
            target = message.guild.members.cache.find(m =>
                m.user.username.toLowerCase() === search ||
                m.user.tag.toLowerCase() === search ||
                m.user.username.toLowerCase().startsWith(search)
            );
        }

        if (!target) {
            return message.reply("❌ User not found.");
        }

        const roleName = args.join(" ");
        if (!roleName) {
            return message.reply("❌ You must specify a role name.");
        }

        const role =
            message.mentions.roles.first() ||
            message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());

        if (!role) {
            return message.reply("❌ Role not found.");
        }

        try {
            if (action === "add") {
                await target.roles.add(role);
                return message.reply(`✅ Added role **${role.name}** to ${target}.`);
            } else {
                await target.roles.remove(role);
                return message.reply(`✅ Removed role **${role.name}** from ${target}.`);
            }
        } catch (err) {
            console.error("Role error:", err);
            return message.reply("❌ Failed to modify roles. Check my role position and permissions.");
        }
    }

    // WARN SYSTEM — fixed early return so auto-timeout can run
    handled = true;
    if (command === "warn") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply("❌ You need **Timeout Members** or mod perms to warn.");
        }

        const target = message.mentions.members.first();
        if (!target) {
            return message.reply("❌ Usage: `,warn @user [reason]`");
        }

        if (args[0] === "remove") {
            // Accept: ,warn remove @user [count]
            const countArg = args.find(a => /^\d+$/.test(a));
            const countToRemove = countArg ? parseInt(countArg, 10) : 1;

            if (Number.isNaN(countToRemove) || countToRemove <= 0) {
                return message.reply("❌ Usage: `,warn remove @user [count]`");
            }

            const data = getWarningData(message.guild.id, target.id);
            data.count = Math.max(0, data.count - countToRemove);
            data.history.push({
                action: "remove",
                by: message.author.id,
                count: countToRemove,
                at: Date.now()
            });
            await saveWarnings();

            // DM the user about warning removal
            try {
                await target.user.send(
                    `Your warnings in **${message.guild.name}** were reduced by **${countToRemove}**. You now have **${data.count}** warning(s).`
                );
            } catch {
                // ignore DM failure
            }

            return message.reply(`✅ Removed **${countToRemove}** warnings from **${target.user.tag}**. Now at **${data.count}** warns.`);
        }

        const reason = args.join(" ") || "No reason provided.";
        const data = getWarningData(message.guild.id, target.id);
        data.count++;
        data.history.push({
            action: "add",
            by: message.author.id,
            reason,
            at: Date.now()
        });
                await saveWarnings();

        // Apply any configured warn thresholds
        checkWarnThresholds(target, data.count, message);

 // DM the user about the warning
        try {
            await target.user.send(
                `You were warned in **${message.guild.name}** by **${message.author.tag}**.\nReason: ${reason}\nTotal warnings: ${data.count}`
            );
        } catch {
            // ignore DM failure
        }

        await message.reply(`⚠️ Warned **${target.user.tag}**. They now have **${data.count}** warning(s).`);

        return;
    }

    handled = true;
    if (command === "warnings") {
        const target = message.mentions.members.first() || message.member;
        const data = getWarningData(message.guild.id, target.id);
        if (data.count === 0) {
            return message.reply(`✅ **${target.user.tag}** has no warnings.`);
        }
        return message.reply(
            `⚠️ **${target.user.tag}** has **${data.count}** warning(s).`
        );
    }

    handled = true;
    if (command === "clearwarns") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply("❌ You need **Timeout Members** or mod perms.");
        }
        const target = message.mentions.members.first();
        if (!target) {
            return message.reply("❌ Usage: `,clearwarns @user`");
        }
        const data = getWarningData(message.guild.id, target.id);
        data.count = 0;
        data.history.push({
            action: "clear",
            by: message.author.id,
            at: Date.now()
        });
        await saveWarnings();

        // DM the user about cleared warnings
        try {
            await target.user.send(
                `All of your warnings in **${message.guild.name}** have been cleared by **${message.author.tag}**.`
            );
        } catch {
            // ignore DM failure
        }

        return message.reply(`✅ Cleared all warnings for **${target.user.tag}**.`);
    }

    // LOG CHANNEL
    handled = true;
    if (command === "log_channel") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply("❌ You need **Manage Server** to set the log channel.");
        }
        const channel = message.mentions.channels.first();
        if (!channel) {
            return message.reply("❌ Usage: `,log_channel #channel`");
        }
        const settings = getGuildSettings(message.guild.id);
        settings.logChannelId = channel.id;
        await saveSettings();
        return message.reply(`✅ Log channel set to ${channel}.`);
    }

    // TICKET CHANNEL (set + immediately post panel)
    handled = true;
    if (command === "ticket_channel") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply("❌ You need **Manage Server** to set the ticket channel.");
        }
        const channel = message.mentions.channels.first();
        if (!channel) {
            return message.reply("❌ Usage: `,ticket_channel #channel`");
        }
        if (!channel.isTextBased()) {
            return message.reply("❌ Ticket channel must be a text channel.");
        }

        const settings = getGuildSettings(message.guild.id);
        settings.ticketChannelId = channel.id;
        await saveSettings();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("ticket_general")
                .setLabel("📝 General Support")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("ticket_report")
                .setLabel("🚨 Report User")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("ticket_bot")
                .setLabel("🤖 Bot Error")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("ticket_other")
                .setLabel("❓ Other")
                .setStyle(ButtonStyle.Success)
        );

        const embed = new EmbedBuilder()
            .setTitle("🎫 Support Tickets")
            .setDescription(
                "Pick a category below to open a ticket.\n\n" +
                "• 📝 General Support\n" +
                "• 🚨 Report a user\n" +
                "• 🤖 Bot error / bug\n" +
                "• ❓ Other questions"
            )
            .setColor(0x5865f2);

        await channel.send({
            embeds: [embed],
            components: [row]
        });
        return message.reply(`✅ Ticket channel set to ${channel}. Ticket panel posted there.`);
    }

    // APPLY CHANNEL
    handled = true;
    if (command === "apply_channel") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply("❌ You need **Manage Server** to set the applications channel.");
        }
        const channel = message.mentions.channels.first();
        if (!channel) {
            return message.reply("❌ Usage: `,apply_channel #channel`");
        }
        const settings = getGuildSettings(message.guild.id);
        settings.applyChannelId = channel.id;
        await saveSettings();
        return message.reply(`✅ Application panel channel set to ${channel}.`);
    }

    // APPLY OPEN/CLOSE
    handled = true;
    if (command === "apply_open" || command === "apply_close") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply("❌ You need **Manage Server** to change applications.");
        }
        const settings = getGuildSettings(message.guild.id);
        const open = command === "apply_open";
        settings.applicationsOpen = open;
        await saveSettings();

        if (open) {
            if (!settings.applyChannelId) {
                return message.reply("✅ Applications opened, but no application channel set. Use `,apply_channel #channel`.");
            }
            const applyChan = message.guild.channels.cache.get(settings.applyChannelId);
            if (applyChan && applyChan.isTextBased()) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("open_application")
                        .setLabel("📋 Apply")
                        .setStyle(ButtonStyle.Primary)
                );

                const embed = new EmbedBuilder()
                    .setTitle("📋 Staff Applications")
                    .setDescription("Staff applications are now **OPEN**!\nClick the button below to create your private application channel.")
                    .setColor(0xfee75c);

                await applyChan.send({
                    embeds: [embed],
                    components: [row]
                });
            }
        }

        return message.reply(open ? "✅ Applications are now **OPEN**." : "✅ Applications are now **CLOSED**.");
    }

    // AUTORESPONDER COMMANDS
    handled = true;
    if (command === "autoresponder") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply("❌ You need **Manage Messages** to edit autoresponders.");
        }

        const sub = (args.shift() || "").toLowerCase();

        if (sub === "add") {
            const trigger = args.shift();
            const response = args.join(" ");

            if (!trigger || !response) {
                return message.reply("❌ Usage: `,autoresponder add <trigger> <response>`");
            }

            dynamicAutoResponses.push({
                trigger: trigger.toLowerCase(),
                response
            });

            await saveDynamicAutoresponders();
            return message.reply(`✅ Added global autoresponder for trigger \`${trigger}\`.`);
        }

        if (sub === "remove") {
            const trigger = args.shift();
            if (!trigger) {
                return message.reply("❌ Usage: `,autoresponder remove <trigger>`");
            }

            const index = dynamicAutoResponses.findIndex(
                ar => ar.trigger === trigger.toLowerCase()
            );

            if (index === -1) {
                return message.reply("❌ No autoresponder with that trigger found.");
            }

            dynamicAutoResponses.splice(index, 1);
            await saveDynamicAutoresponders();
            return message.reply(`✅ Removed autoresponder for trigger \`${trigger}\`.`);
        }

        if (sub === "list") {
            if (dynamicAutoResponses.length === 0) {
                return message.reply("🤖 No autoresponders set yet.");
            }

            const lines = dynamicAutoResponses.map(ar =>
                `• Trigger: \`${ar.trigger}\` → Response: \`${ar.response}\``
            );

            return message.reply(
                `🤖 **Global Autoresponders:**\n${lines.join("\n")}`
            );
        }

        return message.reply(
            "❌ Usage:\n" +
            "`,autoresponder add <trigger> <response>`\n" +
            "`,autoresponder remove <trigger>`\n" +
            "`,autoresponder list`"
        );
    }


    // EXTRA MODERATION COMMANDS
    handled = true;
    if (command === "ban") {
        return handleTextBanCommand(message, "ban", args);
    }

    handled = true;
    if (command === "slowmode") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply("❌ You need **Manage Channels** to change slowmode.");
        }

        let targetChannel = message.mentions.channels.first() || message.channel;
        if (!targetChannel || !targetChannel.isTextBased()) {
            return message.reply("❌ Slowmode can only be set on text channels.");
        }

        const rawArgs = message.mentions.channels.first() ? args.slice(1) : args;
        const amountStr = rawArgs[0];

        if (!amountStr) {
            return message.reply("❌ Usage: `,slowmode [#channel] <seconds|off>`");
        }

        let seconds;
        if (amountStr.toLowerCase() === "off" || amountStr === "0") {
            seconds = 0;
        } else {
            seconds = parseInt(amountStr, 10);
            if (Number.isNaN(seconds) || seconds < 0 || seconds > 21600) {
                return message.reply("❌ Slowmode must be between **0** and **21600** seconds (6h).");
            }
        }

        try {
            await targetChannel.setRateLimitPerUser(seconds, `Changed by ${message.author.tag}`);
            if (seconds === 0) {
                return message.reply(`✅ Slowmode disabled in ${targetChannel}.`);
            }
            return message.reply(`✅ Set slowmode in ${targetChannel} to **${seconds}** seconds.`);
        } catch (err) {
            console.error("Slowmode error:", err);
            return message.reply("❌ Failed to change slowmode. Check my permissions.");
        }
    }

    handled = true;
    if (command === "lock") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply("❌ You need **Manage Channels** to lock channels.");
        }

        const targetChannel = message.mentions.channels.first() || message.channel;
        if (!targetChannel || !targetChannel.isTextBased()) {
            return message.reply("❌ Lock can only be used on text channels.");
        }

        const reason = args.slice(targetChannel === message.channel ? 0 : 1).join(" ") || "Channel locked";
        const everyoneRole = message.guild.roles.everyone;

        try {
            await targetChannel.permissionOverwrites.edit(everyoneRole, { SendMessages: false }, { reason: `${reason} (by ${message.author.tag})` });
            await message.reply(`🔒 Locked ${targetChannel}.\nReason: **${reason}**`);
            await logToGuild(message.guild, `🔒 ${targetChannel} locked by ${message.author.tag}. Reason: ${reason}`);
        } catch (err) {
            console.error("Lock error:", err);
            return message.reply("❌ Failed to lock the channel. Check my permissions.");
        }
    }

    handled = true;
    if (command === "unlock") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply("❌ You need **Manage Channels** to unlock channels.");
        }

        const targetChannel = message.mentions.channels.first() || message.channel;
        if (!targetChannel || !targetChannel.isTextBased()) {
            return message.reply("❌ Unlock can only be used on text channels.");
        }

        const everyoneRole = message.guild.roles.everyone;

        try {
            await targetChannel.permissionOverwrites.edit(everyoneRole, { SendMessages: null }, { reason: `Unlocked by ${message.author.tag}` });
            await message.reply(`🔓 Unlocked ${targetChannel}.`);
            await logToGuild(message.guild, `🔓 ${targetChannel} unlocked by ${message.author.tag}.`);
        } catch (err) {
            console.error("Unlock error:", err);
            return message.reply("❌ Failed to unlock the channel. Check my permissions.");
        }
    }

    handled = true;
    if (command === "clear") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply("❌ You need **Manage Messages** to clear messages.");
        }

        const amount = parseInt(args[0], 10);
        if (Number.isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply("❌ Usage: `,clear <amount>` (1–100).");
        }

        try {
            await message.channel.bulkDelete(amount + 1, true);
            const infoMsg = await message.channel.send(`🧹 Cleared **${amount}** messages.`);
            setTimeout(() => {
                infoMsg.delete().catch(() => {});
            }, 5000);
        } catch (err) {
            console.error("Clear error:", err);
            return message.reply("❌ Failed to clear messages. Messages older than 14 days cannot be bulk deleted.");
        }
    }

    handled = true;
    if (command === "nick") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
            return message.reply("❌ You need **Manage Nicknames** to change nicknames.");
        }

        const target = message.mentions.members.first();
        if (!target) {
            return message.reply("❌ Usage: `,nick @user <new nickname>`");
        }

        const newNick = args.slice(1).join(" ");
        if (!newNick) {
            return message.reply("❌ You must provide a new nickname.");
        }

        try {
            await target.setNickname(newNick, `Changed by ${message.author.tag}`);
            return message.reply(`✅ Changed nickname of **${target.user.tag}** to **${newNick}**.`);
        } catch (err) {
            console.error("Nick error:", err);
            return message.reply("❌ Failed to change nickname. Check my role position and permissions.");
        }
    }

    // DEBUG APPLY COMMAND
    handled = true;
    if (command === "debug_apply") {
        const settings = getGuildSettings(message.guild.id);

        return message.reply(
            "📋 **APPLY DEBUG**\n" +
            `• applyChannelId: ${settings.applyChannelId || "❌ NOT SET"}\n` +
            `• applicationsOpen: ${settings.applicationsOpen ? "✅ YES" : "❌ NO"}`
        );
    }

    // TICKET PANEL
    handled = true;
    if (command === "ticket") {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("ticket_general")
                .setLabel("📝 General Support")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("ticket_report")
                .setLabel("🚨 Report User")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("ticket_bot")
                .setLabel("🤖 Bot Error")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("ticket_other")
                .setLabel("❓ Other")
                .setStyle(ButtonStyle.Success)
        );

        const embed = new EmbedBuilder()
            .setTitle("🎫 Support Tickets")
            .setDescription(
                "Pick a category below to open a ticket.\n\n" +
                "• 📝 General Support\n" +
                "• 🚨 Report a user\n" +
                "• 🤖 Bot error / bug\n" +
                "• ❓ Other questions"
            )
            .setColor(0x5865f2);

        const settings = getGuildSettings(message.guild.id);
        const targetChannel = settings.ticketChannelId
            ? message.guild.channels.cache.get(settings.ticketChannelId)
            : message.channel;

        if (!targetChannel || !targetChannel.isTextBased()) {
            return message.reply("❌ Ticket channel not set or invalid. Use `,ticket_channel #channel` first.");
        }

        return targetChannel.send({
            embeds: [embed],
            components: [row]
        });
    }

    if (!handled) return message.reply("❌ Unknown command.");
});

// ---------------- TICKET / APPLICATION BUTTON HANDLER ----------------
client.on(Events.InteractionCreate, async (i) => {
    if (!i.isButton()) return;

    const ids = [
        "ticket_general",
        "ticket_report",
        "ticket_bot",
        "ticket_other",
        "open_application",
        "close_ticket"
    ];

    if (!ids.includes(i.customId)) return;

    const guild = i.guild;
    if (!guild) {
        return i.reply({ content: "❌ This can only be used in a server.", ephemeral: true });
    }

    const settings = getGuildSettings(guild.id);

    if (i.customId === "close_ticket") {
        const member = await guild.members.fetch(i.user.id);

        if (
            !member.permissions.has(PermissionsBitField.Flags.ManageChannels) &&
            !member.permissions.has(PermissionsBitField.Flags.Administrator)
        ) {
            return i.reply({ content: "❌ Only staff can close tickets.", ephemeral: true });
        }

        const channel = i.channel;
        if (!channel) {
            return i.reply({ content: "❌ Channel not found.", ephemeral: true });
        }

        await i.reply({ content: "✅ Ticket will be closed.", ephemeral: true });

        // Hidden feature: save transcript for bot-error tickets
        try {
            const isBotErrorTicket = channel.name && channel.name.startsWith("ticket-bot");
            if (isBotErrorTicket) {
                const messages = await channel.messages.fetch({ limit: 100 });
                const sorted = Array.from(messages.values()).sort(
                    (a, b) => a.createdTimestamp - b.createdTimestamp
                );

                const transcriptEntry = {
                    id: channel.id,
                    type: "bot_error",
                    guildId: guild.id,
                    guildName: guild.name,
                    closedBy: i.user.id,
                    closedByTag: i.user.tag,
                    createdAt: channel.createdTimestamp,
                    closedAt: Date.now(),
                    messages: sorted.map(m => ({
                        id: m.id,
                        authorId: m.author?.id,
                        authorTag: m.author?.tag || m.author?.username,
                        content: m.content,
                        createdTimestamp: m.createdTimestamp
                    }))
                };

                try {
                    await fs.appendFile(
                        TICKET_TRANSCRIPTS_FILE,
                        JSON.stringify(transcriptEntry) + "\n"
                    );
                    console.log(
                        `[TRANSCRIPT] Saved bot-error ticket ${channel.id} in guild ${guild.name}.`
                    );
                } catch (err) {
                    console.error("Failed to save ticket transcript:", err);
                }
            }
        } catch (err) {
            console.error("Transcript capture error:", err);
        }

        try {
            await logToGuild(guild, `🧹 Ticket channel ${channel} closed by **${i.user.tag}**.`);
        } catch {}

        return channel.delete("Ticket closed by staff").catch(() => {});
    }

    const isApplication = i.customId === "open_application";

    if (isApplication && !settings.applicationsOpen) {
        return i.reply({ content: "❌ Applications are currently closed.", ephemeral: true });
    }

    let baseName = "ticket";
    let ticketLabel = "ticket";

    if (!isApplication) {
        if (i.customId === "ticket_general") {
            baseName = "ticket-general";
            ticketLabel = "General Support Ticket";
        } else if (i.customId === "ticket_report") {
            baseName = "ticket-report";
            ticketLabel = "Report User Ticket";
        } else if (i.customId === "ticket_bot") {
            baseName = "ticket-bot";
            ticketLabel = "Bot Error Ticket";
        } else if (i.customId === "ticket_other") {
            baseName = "ticket-other";
            ticketLabel = "Other Ticket";
        }
    } else {
        baseName = "apply";
        ticketLabel = "Application Channel";
    }

    const channelName = `${baseName}-${i.user.username}`
        .replace(/[^a-z0-9\-]/gi, "-")
        .toLowerCase()
        .slice(0, 90);

    try {
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: i.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                }
            ]
        });

        const staffRole = guild.roles.cache.find(r => r.name.toLowerCase() === "staff".toLowerCase()) ||
                          guild.roles.cache.find(r => /staff/i.test(r.name));
        const staffPing = staffRole ? `<@&${staffRole.id}>` : "";

        const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("close_ticket")
                .setLabel("🔒 Close Ticket")
                .setStyle(ButtonStyle.Danger)
        );

        await channel.send({
            content: `${staffPing} ${isApplication ? "📋 New application channel created for" : "🎫 New ticket opened by"} <@${i.user.id}>.\n**Type:** ${ticketLabel}`,
            components: [closeRow]
        });

        await i.reply({
            content: `${isApplication ? "📋 Your application channel has been created" : "✅ Your ticket has been created"}: ${channel}`,
            ephemeral: true
        });

        await logToGuild(
            guild,
            `${isApplication ? "📋 New application" : "🎫 New ticket"} opened by **${i.user.tag}** in ${channel}. Type: ${ticketLabel}`
        );
    } catch (err) {
        console.error("Ticket/application error:", err);
        if (!i.replied && !i.deferred) {
            await i.reply({ content: "❌ Failed to create channel.", ephemeral: true });
        }
    }
});

client.on(Events.GuildMemberAdd, async (member) => {
    try {
        const isBooster =
            member.premiumSince ||
            member.roles.cache.some(r => r.tags?.premiumSubscriber);

        if (!isBooster) return;

        const reward = 20000;
        await addMoney(member.id, reward);

        const cos = getUserCosmetics(member.id);
        if (!cos.manualTitle) {
            cos.autoTitle = "Server Booster";
        }

        try {
            await member.send(
                `💜 Thanks for boosting **${member.guild.name}**!\nYou've received **${reward.toLocaleString()} Won** and the title **Server Booster**!`
            );
        } catch {}

        await logToGuild(member.guild, `💜 **${member.user.tag}** boosted the server and received ${reward.toLocaleString()} Won.`);
    } catch (err) {
        console.error("Booster welcome error:", err);
    }
});

// ---------------- LEAVE / BAN LOGS ----------------
client.on(Events.GuildMemberRemove, async (member) => {
    try {
        await logToGuild(member.guild, `🚪 **${member.user.tag}** left the server.`);
    } catch {}
});

client.on(Events.GuildBanAdd, async (ban) => {
    try {
        // If this wasn't just handled by our command, DM the user about the ban
        if (!recentBans.has(ban.user.id)) {
            try {
                await ban.user.send(
                    `You were banned from **${ban.guild.name}**.`
                );
            } catch {
                // ignore DM failure
            }
        }

        await logToGuild(ban.guild, `🔨 **${ban.user.tag}** was banned.`);
    } catch {}
});

client.on(Events.GuildBanRemove, async (ban) => {
    try {
        await logToGuild(ban.guild, `⚖️ **${ban.user.tag}** was unbanned.`);
    } catch {}
});

client.once(Events.ClientReady, async (c) => {
    console.log(`✅ Logged in as ${c.user.tag}`);

    await loadDynamicAutoresponders();
    await loadWarnings();
    await loadSettings();
    await loadBoosterRoles();

    console.log("✅ All data loaded. Bot is fully online.");
});

// export client so index.js can login
export { client };
