/* Warning helpers */
import { warnings } from "../state.js";

function warnKey(guildId, userId) {
    return `${guildId}-${userId}`;
}

function getWarningData(guildId, userId) {
    const key = warnKey(guildId, userId);
    let data = warnings.get(key);

    if (!data) {
        data = { count: 0, history: [] };
        warnings.set(key, data);
    }
    return data;
}

export { warnKey, getWarningData };
