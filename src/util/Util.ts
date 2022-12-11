import { SlashCommandBuilder } from "@discordjs/builders";
import { REST } from "@discordjs/rest";
import chalk from "chalk";
import { spawn } from "child_process";
import crypto from "crypto";
import { Routes } from "discord-api-types/v9";
import { readFile, stat } from "fs-extra";
import { coloredIdentifier, Logger, LoggerLevel } from "logerian";
import path from "path";

let rest = new REST({ version: "9", userAgentAppendix: `Node.JS ${process.version}` });

/**
 * If `process.env.ENVIRONMENT` is `PROD` provided commands are registered as global commands.
 * If `process.env.ENVIRONMENT` is `DEV` provided commands are registered as guild commands, and options.GUILD_ID must be set.
 * Be prepared to catch errors.
 */
export async function registerSlashCommands(
  { CLIENT_ID, GUILD_ID }: { CLIENT_ID: string; GUILD_ID?: string },
  ...commands: Pick<SlashCommandBuilder, "toJSON">[]
): Promise<void> {
  if (setupRestClient()) {
    let route: `/${string}`;
    if (process.env.ENVIRONMENT === "PROD") {
      route = Routes.applicationCommands(CLIENT_ID);
    } else if (process.env.ENVIRONMENT === "DEV") {
      if (GUILD_ID) {
        route = Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID);
      } else {
        throw new Error('"ENVIRONMENT" is "DEV" and no GUILD_ID is provided.');
      }
    } else {
      throw new Error("\"ENVIRONMENT\" isn't set, or isn't a valid value.");
    }

    const commandsJSON = commands.map(command => command.toJSON());
    try {
      await rest.put(route, { body: commandsJSON });
    } catch (error) {
      throw error;
    }
  }
}

let restClientIsSetup = false;
/**
 * This command persists the rest client state.
 * It will actually only run successfully once,
 * after a successful setup, it will always return true.
 * @param {string | undefined} token If provided, will use this token to setup the rest client. If it is not provided, it will use the `process.env.DISCORD_TOKEN` value.
 * @returns {true | never}
 *  `true` - if setup is successful;
 *  `never` - if an error is thrown.
 */
export function setupRestClient(token?: string): true | never {
  if (!restClientIsSetup) {
    token = token ?? process.env.DISCORD_API_KEY;
    if (token) {
      rest = rest.setToken(token);
      restClientIsSetup = true;
      return true;
    } else {
      throw new Error(
        'There is no environment variable called "DISCORD_API_TOKEN", please set it before calling functions from RestUtil.'
      );
    }
  } else {
    return true;
  }
}

export interface LoggerInterface {
  debug(...data: any[]): void;
  info(...data: any[]): void;
  warn(...data: any[]): void;
  error(...data: any[]): void;
  fatal(...data: any[]): void;
}

export type ArrayOnly<T> = T extends Array<any> ? T : T extends any[] ? T : never;
export type Promised<T> = T | Promise<T>;

interface PackageJSON {
  name: string;
  description: string;
  version: string;
  main: string;
  author:
    | {
        name: string;
        email?: string;
        url?: string;
      }
    | string;
  contributors:
    | {
        name: string;
        email?: string;
        url?: string;
      }[]
    | string[];
  private: boolean;
  license: string;
  repository: {
    type: "git" | "svn";
    url: string;
  };
  bugs: string;
  keywords: string[];
  scripts: { [key: string]: string };
  dependencies: { [key: string]: string };
  devDependencies: { [key: string]: string };
}

let packageJSON: PackageJSON;
export async function getPackageJSON(): Promise<PackageJSON> {
  if (!packageJSON) {
    let data: Buffer;
    try {
      data = await readFile(path.join(__dirname, "../../package.json"));
    } catch (err) {
      console.error(chalk`Couldn't read {green package.json}!`);
      throw err;
    }
    try {
      packageJSON = JSON.parse(data.toString());
    } catch (err) {
      console.error(chalk`Couldn't parse {green package.json}!`);
      throw err;
    }
  }
  return packageJSON;
}

export function isHeartbeatLog(message: string): boolean {
  return /^\[WS => Shard \d+\] (\[HeartbeatTimer\] Sending a heartbeat.|Heartbeat acknowledged, latency of \d+ms.)$/.test(
    message
  );
}

export function secondsToDDHHMMSS(secs: number): string {
  let s = "";
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs / 3600) % 24); // Loop at 24
  const minutes = Math.floor((secs / 60) % 60); // Loop at 60
  const seconds = Math.floor(secs % 60); // Loop at 60
  if (days) s += ` ${days}d`;
  if (hours) s += ` ${hours}h`;
  if (minutes) s += ` ${minutes}m`;
  if (seconds) s += ` ${seconds}s`;
  return s.trim();
}

export function objectEntries(object: { [key: string]: any }): [string, any][] {
  const resultingArray: [string, any][] = [];
  for (const key in object) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      const element = object[key];
      resultingArray.push([key, element]);
    }
  }
  return resultingArray;
}

export function getChildLogger(
  logger: LoggerInterface,
  name: string,
  identifierColor: number,
  bracketColor: number
): LoggerInterface {
  if (logger instanceof Logger) {
    const identifierPrefix = coloredIdentifier(identifierColor, bracketColor);
    return new Logger({
      identifier: name,
      identifierPrefix,
      streams: [
        {
          level: LoggerLevel.DEBUG,
          stream: logger,
        },
      ],
    });
  } else {
    return logger;
  }
}

export function formatBytes(bytes: number): string {
  return formatNumber(bytes, ["b", "kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]);
}

export function formatNumber(num: number, suffixes: string[] = ["", "k", "m", "b", "t"]): string {
  const index = Math.max(0, Math.min(suffixes.length - 1, Math.floor(num == 0 ? 0 : Math.log10(Math.abs(num)) / 3)));
  return `${Math.floor((num * 10) / 10 ** (3 * index)) / 10}${suffixes[index]}`;
}

export function hash(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    return false;
  }
}

export async function fileSize(path: string): Promise<number> {
  try {
    const stats = await stat(path);
    return stats.size;
  } catch (error) {
    return 0;
  }
}

export function asyncPipe(readable: NodeJS.ReadableStream, writable: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve, reject) => {
    readable.pipe(writable);
    readable.on("error", reject);
    writable.on("error", reject);
    writable.on("finish", resolve);
  });
}

export async function asyncProcess(
  command: string,
  args: string[],
  outStream?: NodeJS.WritableStream,
  errStream?: NodeJS.WritableStream
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", outStream ? "pipe" : "ignore", errStream ? "pipe" : "ignore"],
    });
    if (outStream) {
      child.stdout?.pipe(outStream);
    }
    if (errStream) {
      child.stderr?.pipe(errStream);
    }
    child.on("error", reject);
    child.on("exit", (code: number) => {
      resolve(code);
    });
  });
}
