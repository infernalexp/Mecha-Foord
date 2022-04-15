import {
  CommandInteraction,
  MessageContextMenuInteraction,
  MessagePayload,
  WebhookEditMessageOptions,
} from "discord.js";

export class UpdatableReply {
  private interaction: MessageContextMenuInteraction | CommandInteraction;
  private intervalMs: number;
  private interval!: NodeJS.Timeout;
  private shouldUpdate: boolean = false;
  private messageBuilder: (
    this: UpdatableReply,
    data: Record<string, string>
  ) => string | MessagePayload | WebhookEditMessageOptions;
  private data: Record<string, string> = {};

  public constructor(
    interaction: MessageContextMenuInteraction | CommandInteraction,
    messageBuilder: (
      this: UpdatableReply,
      data: Record<string, string>
    ) => string | MessagePayload | WebhookEditMessageOptions,
    intervalMs = 2000
  ) {
    this.interaction = interaction;
    this.messageBuilder = messageBuilder.bind(this);
    this.intervalMs = intervalMs;
  }

  public async init(): Promise<void> {
    await this.interaction.deferReply();
    this.interval = setInterval(() => this.updateReply(), this.intervalMs);
    this.update(true);
  }

  public async setData(key: string, value: string) {
    this.data[key] = value;
  }

  public async addDataLine(key: string, value: string) {
    if (this.data[key]) {
      this.data[key] += "\n" + value;
    } else {
      this.data[key] = value;
    }
  }

  public async getData(key: string) {
    return this.data[key];
  }

  public update(immediate = false): void {
    this.shouldUpdate = true;
    if (immediate) {
      this.updateReply();
    }
  }

  private updateReply(): void {
    if (this.shouldUpdate) {
      this.shouldUpdate = false;
      this.interaction.editReply(this.messageBuilder(this.data));
    }
  }

  public async close(): Promise<void> {
    if (this.interval) {
      this.update(true);
      clearInterval(this.interval);
    }
  }
}
