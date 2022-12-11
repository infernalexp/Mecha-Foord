import { ThreadChannel } from "discord.js";
import { Bot } from "../Bot";
import { Task, TaskType } from "./Task";

const PINGABLE_ROLE: Record<string, string> = {};

export const ThreadPingTask: Task = {
  type: ["startup", "threadCreate"],
  run(client: Bot, task: TaskType, ...args: any[]): Promise<boolean> {
    return task === "startup" ? startup(client) : handleThread(client, args[0] as ThreadChannel, args[1] as boolean);
  },
};

async function startup(client: Bot): Promise<boolean> {
  const guilds = (await client.guilds.fetch()).mapValues(value => value.fetch());
  for (const [guildid, guildpromise] of guilds) {
    const guild = await guildpromise;
    const roles = await guild.roles.fetch();
    for (const [roleid, role] of roles) {
      if (/^(Thread Ping|Ping Thread|Thread)$/i.test(role.name)) {
        PINGABLE_ROLE[guildid] = roleid;
      }
    }
  }
  return true;
}

async function handleThread(_client: Bot, thread: ThreadChannel, newlyCreated: boolean): Promise<boolean> {
  if (newlyCreated) {
    const message = await thread.send(`<@&${PINGABLE_ROLE[thread.guildId]}>`);
    await message.delete();
  }
  return true;
}
