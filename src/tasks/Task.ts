import { Message, ThreadChannel } from "discord.js";
import { Bot } from "../Bot";

export type TaskType = keyof TaskArguments;
export type TaskArguments = {
  startup: [];
  messageCreate: [Message];
  threadCreate: [ThreadChannel, boolean];
};

export interface Task {
  type: keyof TaskArguments | (keyof TaskArguments)[];
  run<T extends TaskType>(client: Bot, type: TaskType, ...args: TaskArguments[T]): boolean | PromiseLike<boolean>;
  run<T extends TaskType>(client: Bot, type: TaskType, ...args: TaskArguments[T]): boolean | PromiseLike<boolean>;
}
