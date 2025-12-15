import "dotenv/config";
import { client } from "./client.js";

// Side-effect imports: register commands/events/handlers
import "./bot.js";
import "./postLogin.js";

client.login(process.env.TOKEN);
