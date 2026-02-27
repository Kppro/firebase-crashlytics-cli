import { Command } from "commander";
import { listProjects } from "../api/firebase-project.js";
import { formatTable, outputJson, outputError, c } from "../utils/formatter.js";

export const projectsCommand = new Command("projects").description(
  "List Firebase projects in your account",
);

projectsCommand
  .command("list")
  .description("List all Firebase projects accessible to your account")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    try {
      const projects = await listProjects();

      if (projects.length === 0) {
        if (options.json) {
          outputJson([]);
        } else {
          console.log(c.yellow("No Firebase projects found."));
        }
        return;
      }

      if (options.json) {
        outputJson(projects);
        return;
      }

      console.log(c.bold(`\nFirebase projects (${projects.length}):\n`));

      const rows = projects.map((p) => [
        p.displayName || c.dim("(unnamed)"),
        p.projectId,
        p.projectNumber,
      ]);

      console.log(formatTable(["Display Name", "Project ID", "Project Number"], rows));
      console.log("");
    } catch (err: unknown) {
      const error = err as Error;
      outputError(error.message);
      process.exit(1);
    }
  });
