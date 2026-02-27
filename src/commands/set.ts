import { Command } from "commander";
import { writeConfig } from "../utils/config.js";
import { c, outputError } from "../utils/formatter.js";

export const setCommand = new Command("set").description(
  "Set project or app for the current directory",
);

setCommand
  .command("project <projectId>")
  .description("Set the default Firebase project")
  .action(async (projectId: string) => {
    try {
      await writeConfig("project", projectId);
      console.log(c.green(`Project set to ${c.bold(projectId)}`));
    } catch (err: unknown) {
      outputError((err as Error).message);
      process.exit(1);
    }
  });

setCommand
  .command("app <appId>")
  .description("Set the default Firebase app")
  .action(async (appId: string) => {
    try {
      await writeConfig("app", appId);
      console.log(c.green(`App set to ${c.bold(appId)}`));
    } catch (err: unknown) {
      outputError((err as Error).message);
      process.exit(1);
    }
  });
