import { SlashCommandBuilder, SlashCommandStringOption } from "@discordjs/builders";
import { Canvas, Image } from "canvas";
import { Bot } from "../../Bot";
import { BasicImageCommand } from "./BasicImageCommand";

export class GayCommand extends BasicImageCommand {
  public constructor(client: Bot) {
    super(client);
  }

  // Overlay rainbow over image
  public override modifyImage(image: Image, canvas: Canvas): Canvas {
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);

    var grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grd.addColorStop(0, "rgba(255, 0, 0, 0.4)");
    grd.addColorStop(0.2, "rgba(255, 255, 0, 0.4)");
    grd.addColorStop(0.4, "rgba(0, 255, 0, 0.4)");
    grd.addColorStop(0.6, "rgba(0, 255, 255, 0.4)");
    grd.addColorStop(0.8, "rgba(0, 0, 255, 0.4)");
    grd.addColorStop(1, "rgba(255, 0, 255, 0.4)");

    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    return canvas;
  }

  public override getName(): string {
    return "gay";
  }

  public override getCommandBuilder(): Pick<SlashCommandBuilder, "toJSON"> {
    return new SlashCommandBuilder()
      .setName(this.getName())
      .setDescription("Converts an image to gay-ify")
      .addStringOption(
        new SlashCommandStringOption()
          .setName("url")
          .setDescription("The url of the image to convert. May be a link to a message")
          .setRequired(false)
      );
  }
}
