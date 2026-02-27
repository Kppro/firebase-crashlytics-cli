import { Command } from "commander";
import { CrashlyticsClient } from "../api/crashlytics-client.js";
import { resolveProject, resolveApp } from "../api/firebase-project.js";
import { formatTable, truncate, outputJson, outputError, c } from "../utils/formatter.js";
import { formatDate } from "../utils/date.js";

// ─── Command ─────────────────────────────────────────────────────────────────

export const notesCommand = new Command("notes").description(
  "Manage notes on Crashlytics issues",
);

// ─── notes list <issueId> ────────────────────────────────────────────────────

notesCommand
  .command("list")
  .description("List all notes on an issue")
  .argument("<issueId>", "The issue ID")
  .option("--project <projectId>", "Firebase project ID")
  .option("--app <appId>", "Firebase app ID")
  .option("--json", "Output as JSON")
  .action(
    async (
      issueId: string,
      options: { project?: string; app?: string; json?: boolean },
    ) => {
      try {
        const project = await resolveProject(options.project);
        const appId = await resolveApp(options.app, project.projectNumber);
        const client = new CrashlyticsClient(project.projectNumber, appId);

        const response = await client.listNotes(issueId);
        const notes = response.notes ?? [];

        if (notes.length === 0) {
          if (options.json) {
            outputJson([]);
          } else {
            console.log(
              c.yellow(`No notes found for issue "${issueId}".`),
            );
          }
          return;
        }

        // JSON output
        if (options.json) {
          outputJson(
            notes.map((note) => ({
              noteId: note.noteId,
              author: note.author,
              createTime: note.createTime,
              body: note.body,
            })),
          );
          return;
        }

        // Table output
        console.log(
          c.bold(`\nNotes for issue ${c.cyan(issueId)}:\n`),
        );

        const table = formatTable(
          ["Note ID", "Author", "Created", "Body"],
          notes.map((note) => [
            note.noteId,
            truncate(note.author, 20),
            formatDate(note.createTime),
            truncate(note.body, 50),
          ]),
        );

        console.log(table);
        console.log(
          c.dim(
            `\n${notes.length} note${notes.length > 1 ? "s" : ""} found.\n`,
          ),
        );
      } catch (err: unknown) {
        const error = err as Error;
        outputError(error.message);
        process.exit(1);
      }
    },
  );

// ─── notes add <issueId> <body> ──────────────────────────────────────────────

notesCommand
  .command("add")
  .description("Add a note to an issue")
  .argument("<issueId>", "The issue ID")
  .argument("<body>", "The note body text")
  .option("--project <projectId>", "Firebase project ID")
  .option("--app <appId>", "Firebase app ID")
  .action(
    async (
      issueId: string,
      body: string,
      options: { project?: string; app?: string },
    ) => {
      try {
        const project = await resolveProject(options.project);
        const appId = await resolveApp(options.app, project.projectNumber);
        const client = new CrashlyticsClient(project.projectNumber, appId);

        const note = await client.createNote(issueId, body);

        console.log(
          c.green(
            `Note created successfully (ID: ${c.bold(note.noteId)}) on issue "${issueId}".`,
          ),
        );
      } catch (err: unknown) {
        const error = err as Error;
        outputError(error.message);
        process.exit(1);
      }
    },
  );

// ─── notes delete <issueId> <noteId> ────────────────────────────────────────

notesCommand
  .command("delete")
  .description("Delete a note from an issue")
  .argument("<issueId>", "The issue ID")
  .argument("<noteId>", "The note ID to delete")
  .option("--project <projectId>", "Firebase project ID")
  .option("--app <appId>", "Firebase app ID")
  .option("--force", "Skip confirmation prompt")
  .action(
    async (
      issueId: string,
      noteId: string,
      options: { project?: string; app?: string; force?: boolean },
    ) => {
      try {
        // Ask for confirmation unless --force is provided
        if (!options.force) {
          const confirmed = await askConfirmation(
            `Are you sure you want to delete note "${noteId}" from issue "${issueId}"? (y/n) `,
          );

          if (!confirmed) {
            console.log(c.yellow("Deletion cancelled."));
            return;
          }
        }

        const project = await resolveProject(options.project);
        const appId = await resolveApp(options.app, project.projectNumber);
        const client = new CrashlyticsClient(project.projectNumber, appId);

        await client.deleteNote(issueId, noteId);

        console.log(
          c.green(
            `Note "${noteId}" deleted successfully from issue "${issueId}".`,
          ),
        );
      } catch (err: unknown) {
        const error = err as Error;
        outputError(error.message);
        process.exit(1);
      }
    },
  );

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Prompts the user for a yes/no confirmation via stdin.
 *
 * @param message - The prompt message to display.
 * @returns `true` if the user answered "y" or "yes", `false` otherwise.
 */
function askConfirmation(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(message);

    const onData = (data: Buffer): void => {
      const answer = data.toString().trim().toLowerCase();
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
      resolve(answer === "y" || answer === "yes");
    };

    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}
