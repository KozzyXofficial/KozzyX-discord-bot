/* Runtime state and small stubs */

const BOOSTER_DB_FILE = "./boosterroles.json";
const boosterRolesDB = new Map();
// ---------------- RUNTIME IN-MEMORY STATE ----------------
// Dynamic autoresponders loaded from JSON
const dynamicAutoResponses = [];
// Per-guild/user warning data
const warnings = new Map();
// Per-guild server settings (log channels, ticket channels, etc.)
const serverSettings = new Map();
// AFK status map
const afkMap = new Map();
// Track recent bans so we don't double-DM
const recentBans = new Set();

// Economy stubs (money system removed but some older hooks still call these)
async function addMoney(userId, amount) {
    // Stub: money system disabled, so we just do nothing.
    return;
}
function getUserCosmetics(userId) {
    // Stub: return a simple object so title logic doesn't crash.
    return { manualTitle: null, autoTitle: null };
}


async function loadBoosterRoles() {
    try {
        const data = await fs.readFile(BOOSTER_DB_FILE, "utf8");
        const obj = JSON.parse(data);
        boosterRolesDB.clear();
        for (const [userId, roleId] of Object.entries(obj)) {
            boosterRolesDB.set(userId, roleId);
        }
    } catch (err) {
        if (err.code === "ENOENT") {
            await saveBoosterRoles();
        } else {
            console.error("Booster role load error:", err);
        }
    }
}

async function saveBoosterRoles() {
    try {
        const obj = Object.fromEntries(boosterRolesDB.entries());
        await fs.writeFile(BOOSTER_DB_FILE, JSON.stringify(obj, null, 2), "utf8");
    } catch (err) {
        console.error("Booster role save error:", err);
    }
}

export {
  BOOSTER_DB_FILE,
  boosterRolesDB,
  dynamicAutoResponses,
  warnings,
  serverSettings,
  afkMap,
  recentBans,
  addMoney,
  getUserCosmetics
};
