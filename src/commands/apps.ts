import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { resolveProject, listApps } from "../api/firebase-project.js";
import type { FirebaseApp } from "../api/firebase-project.js";

// ─── Command ─────────────────────────────────────────────────────────────────

export const appsCommand = new Command("apps").description(
  "Manage Firebase apps in your project",
);

appsCommand
  .command("list")
  .description("List all apps in the Firebase project")
  .option("--project <projectId>", "Firebase project ID")
  .option("--json", "Output as JSON")
  .action(async (options: { project?: string; json?: boolean }) => {
    try {
      // Resolve the project
      const project = await resolveProject(options.project);

      // List all apps
      const apps = await listApps(project.projectNumber);

      if (apps.length === 0) {
        if (options.json) {
          console.log(JSON.stringify([], null, 2));
        } else {
          console.log(
            chalk.yellow(
              `No apps found in project "${project.displayName}" (${project.projectId}).`,
            ),
          );
        }
        return;
      }

      // JSON output
      if (options.json) {
        const jsonOutput = apps.map((app) => ({
          platform: app.platform,
          displayName: app.displayName,
          packageOrBundleId: app.packageName ?? app.bundleId ?? "",
          appId: app.appId,
        }));
        console.log(JSON.stringify(jsonOutput, null, 2));
        return;
      }

      // Table output
      console.log(
        chalk.bold(
          `\nApps in project ${chalk.cyan(project.displayName)} (${project.projectId}):\n`,
        ),
      );

      const table = new Table({
        head: [
          chalk.bold("Platform"),
          chalk.bold("Display Name"),
          chalk.bold("Package / Bundle ID"),
          chalk.bold("App ID"),
        ],
        style: {
          head: [],
          border: [],
        },
      });

      for (const app of apps) {
        table.push([
          formatPlatform(app.platform),
          app.displayName || chalk.dim("(unnamed)"),
          app.packageName ?? app.bundleId ?? chalk.dim("N/A"),
          chalk.gray(app.appId),
        ]);
      }

      console.log(table.toString());
      console.log(
        chalk.dim(`\n${apps.length} app${apps.length > 1 ? "s" : ""} found.\n`),
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPlatform(platform: FirebaseApp["platform"]): string {
  switch (platform) {
    case "ANDROID":
      return chalk.green("Android");
    case "IOS":
      return chalk.blue("iOS");
    default:
      return platform;
  }
}
