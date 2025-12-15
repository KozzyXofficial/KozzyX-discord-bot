/* Extra handlers originally located after login call */
import { Events, EmbedBuilder } from "discord.js";
import { client } from "./client.js";
import { getGuildSettings } from "./utils/storage.js";

// ==== // ---- Warn Threshold Engine ----

const WARN_THRESHOLD_EMOJIS = ["⚠️","🚨","🔥","🛑","⚡"];
function sendWarnThresholdNotice(message, text) {
    const emoji = WARN_THRESHOLD_EMOJIS[Math.floor(Math.random() * WARN_THRESHOLD_EMOJIS.length)];
    const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setDescription(`${emoji} **Warn threshold triggered:** ${text}`)
        .setTimestamp();
    return message.channel.send({ embeds: [embed] });
}

function checkWarnThresholds(member, warnCount, message) {
    const settings = getGuildSettings(message.guild.id);
    if (!settings.warnThresholds) return;
    for (const t of settings.warnThresholds) {
        if (warnCount === t.count) {
            if (t.action === "timeout") {
                member.timeout(t.time*60000, "Warn threshold").catch(()=>{});
                sendWarnThresholdNotice(message, `${member.user.tag} has been **timed out** for **${t.time}m**.`);
            }
            if (t.action === "kick") {
                member.kick("Warn threshold").catch(()=>{});
                sendWarnThresholdNotice(message, `${member.user.tag} has been **kicked**.`);
            }
            if (t.action === "ban") {
                member.ban({reason:"Warn threshold"}).catch(()=>{});
                sendWarnThresholdNotice(message, `${member.user.tag} has been **banned**.`);
            }
        }
    }
}

// ---- Nicklock Enforcement ----
client.on(Events.GuildMemberUpdate, async (oldM, newM) => {
    const settings = getGuildSettings(newM.guild.id);
    if (!settings.nickLocks || !settings.nickLocks[newM.id]) return;
    const lock = settings.nickLocks[newM.id];
    if (oldM.nickname !== newM.nickname) {
        try { await newM.setNickname(lock, "Nickname locked"); } catch {}
    }
});
