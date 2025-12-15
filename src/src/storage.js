/* JSON storage helpers */
import fs from "fs/promises";
import { AUTORESPONDERS_FILE, WARNINGS_FILE, SETTINGS_FILE } from "../config/constants.js";
import { dynamicAutoResponses, warnings, serverSettings } from "../state.js";

async function loadDynamicAutoresponders() {
    try {
        const data = await fs.readFile(AUTORESPONDERS_FILE, "utf8");
        const arr = JSON.parse(data);
        dynamicAutoResponses.length = 0;
        for (const entry of arr) {
            if (entry.trigger) {
                dynamicAutoResponses.push({
                    trigger: entry.trigger.toLowerCase(),
                    response: entry.response || ""
                });
            }
        }
    } catch {
        await saveDynamicAutoresponders();
    }
}

async function saveDynamicAutoresponders() {
    try {
        await fs.writeFile(
            AUTORESPONDERS_FILE,
            JSON.stringify(dynamicAutoResponses, null, 2),
            "utf8"
        );
    } catch (err) {
        console.error("Autoresponder save error:", err);
    }
}

async function loadWarnings() {
    try {
        const data = await fs.readFile(WARNINGS_FILE, "utf8");
        const obj = JSON.parse(data);
        warnings.clear();
        for (const [key, val] of Object.entries(obj)) {
            warnings.set(key, val);
        }
    } catch {
        await saveWarnings();
    }
}

async function saveWarnings() {
    try {
        const obj = Object.fromEntries(warnings.entries());
        await fs.writeFile(WARNINGS_FILE, JSON.stringify(obj, null, 2), "utf8");
    } catch (err) {
        console.error("Warning save error:", err);
    }
}

function getGuildSettings(guildId) {
    let settings = serverSettings.get(guildId);
    if (!settings) {
        settings = {
            logChannelId: null,
            ticketChannelId: null,
            applyChannelId: null,
            applicationsOpen: false,
        };
        serverSettings.set(guildId, settings);
    }
    return settings;
}

async function loadSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, "utf8");
        const obj = JSON.parse(data);
        serverSettings.clear();
        for (const [guildId, settings] of Object.entries(obj)) {
            serverSettings.set(guildId, settings);
        }
        console.log(`⚙️ Loaded settings for ${serverSettings.size} guilds.`);
    } catch (err) {
        if (err.code === "ENOENT") {
            await saveSettings();
        } else {
            console.error("Settings load error:", err);
        }
    }
}

async function saveSettings() {
    try {
        const obj = Object.fromEntries(serverSettings.entries());
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(obj, null, 2), "utf8");
    } catch (err) {
        console.error("Settings save error:", err);
    }
}


async function logToGuild(guild, text) {
    try {
        if (!guild) return;
        const settings = getGuildSettings(guild.id);
        if (!settings.logChannelId) return;
        const channel = guild.channels.cache.get(settings.logChannelId);
        if (!channel || !channel.isTextBased()) return;
        await channel.send(text);
    } catch (err) {
        console.error("Log error:", err);
    }
}

export {
  loadDynamicAutoresponders, saveDynamicAutoresponders, loadWarnings, saveWarnings, getGuildSettings, loadSettings, saveSettings, logToGuild
};
