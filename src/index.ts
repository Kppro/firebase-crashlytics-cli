import { Command } from "commander";
import { appsCommand } from "./commands/apps.js";
import { configCommand } from "./commands/config.js";
import { issuesCommand } from "./commands/issues.js";
import { notesCommand } from "./commands/notes.js";
import { eventsCommand } from "./commands/events.js";
import { reportsCommand } from "./commands/reports.js";
import { projectsCommand } from "./commands/projects.js";
import { setCommand } from "./commands/set.js";

const program = new Command();

program
  .name("fcc")
  .description("Firebase Crashlytics CLI — browse and analyze crash reports from your terminal")
  .version("0.1.0", "-V, --cli-version", "Output the CLI version number");

program.addCommand(appsCommand);
program.addCommand(configCommand);
program.addCommand(issuesCommand);
program.addCommand(notesCommand);
program.addCommand(eventsCommand);
program.addCommand(reportsCommand);
program.addCommand(projectsCommand);
program.addCommand(setCommand);

program.parse();
