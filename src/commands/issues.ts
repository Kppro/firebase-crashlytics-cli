import { Command } from "commander";
import { resolveProject, resolveApp } from "../api/firebase-project.js";
import {
  CrashlyticsClient,
  type ReportFilters,
  type IssueErrorType,
  type IssueSignal,
  type ReportGroup,
} from "../api/crashlytics-client.js";
import {
  formatTable,
  truncate,
  colorByType,
  formatNumber,
  outputJson,
  outputError,
  c,
} from "../utils/formatter.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolves project and app, then returns a configured CrashlyticsClient.
 */
async function buildClient(options: {
  project?: string;
  app?: string;
}): Promise<CrashlyticsClient> {
  const project = await resolveProject(options.project);
  const appId = await resolveApp(options.app, project.projectNumber);
  return new CrashlyticsClient(project.projectNumber, appId);
}

/**
 * Maps the --type option value to the API's IssueErrorType.
 */
function mapErrorType(type: string): IssueErrorType {
  switch (type.toLowerCase()) {
    case "fatal":
      return "FATAL";
    case "nonfatal":
      return "NON_FATAL";
    case "anr":
      return "ANR";
    default:
      throw new Error(
        `Invalid error type: "${type}". Expected one of: fatal, nonfatal, anr.`,
      );
  }
}

/**
 * Maps the --signal option value to the API's IssueSignal.
 */
function mapSignal(signal: string): IssueSignal {
  switch (signal.toLowerCase()) {
    case "fresh":
      return "SIGNAL_FRESH";
    case "regressed":
      return "SIGNAL_REGRESSED";
    case "repetitive":
      return "SIGNAL_REPETITIVE";
    case "early":
      return "SIGNAL_EARLY";
    default:
      throw new Error(
        `Invalid signal: "${signal}". Expected one of: fresh, regressed, repetitive, early.`,
      );
  }
}

/**
 * Extracts the total eventsCount from a group's metrics array.
 */
function getEventsCount(group: ReportGroup): number {
  if (!group.metrics || group.metrics.length === 0) return 0;
  // Sum all metrics periods, or take the first one (typically there is one aggregated period)
  return group.metrics.reduce(
    (sum, m) => sum + (parseInt(m.eventsCount ?? "0", 10) || 0),
    0,
  );
}

/**
 * Extracts the total impactedUsersCount from a group's metrics array.
 */
function getUsersCount(group: ReportGroup): number {
  if (!group.metrics || group.metrics.length === 0) return 0;
  return group.metrics.reduce(
    (sum, m) => sum + (parseInt(m.impactedUsersCount ?? "0", 10) || 0),
    0,
  );
}

// ─── Command ─────────────────────────────────────────────────────────────────

export const issuesCommand = new Command("issues").description(
  "Browse and manage Crashlytics issues",
);

// ─── issues list ─────────────────────────────────────────────────────────────

issuesCommand
  .command("list")
  .description("List top crash issues with statistics")
  .option("--type <type>", "Filter by error type (fatal, nonfatal, anr)")
  .option("--version <version>", "Filter by app version")
  .option(
    "--signal <signal>",
    "Filter by signal (fresh, regressed, repetitive)",
  )
  .option("--limit <n>", "Number of results", "25")
  .option("--json", "Output as JSON")
  .option("--project <projectId>", "Firebase project ID")
  .option("--app <appId>", "Firebase app ID")
  .action(
    async (options: {
      type?: string;
      version?: string;
      signal?: string;
      limit: string;
      json?: boolean;
      project?: string;
      app?: string;
    }) => {
      try {
        const client = await buildClient(options);

        // Build report filters
        const filters: ReportFilters = {};

        if (options.type) {
          filters.issueErrorTypes = [mapErrorType(options.type)];
        }

        if (options.version) {
          filters.versionDisplayNames = await client.resolveVersionDisplayNames([options.version]);
        }

        if (options.signal) {
          filters.issueSignals = [mapSignal(options.signal)];
        }

        const report = await client.getReport("TOP_ISSUES", filters);

        const limit = parseInt(options.limit, 10);
        const groups = (report.groups ?? []).slice(0, limit);

        if (groups.length === 0) {
          if (options.json) {
            outputJson([]);
          } else {
            console.log(c.yellow("No issues found matching the given filters."));
          }
          return;
        }

        // JSON output — return the raw groups for maximum information
        if (options.json) {
          outputJson(groups);
          return;
        }

        // Table output
        const tableRows = groups.map((group) => {
          const issue = group.issue;
          const events = getEventsCount(group);
          const users = getUsersCount(group);

          return [
            issue?.id ?? "",
            colorByType(issue?.errorType ?? ""),
            issue?.title ?? "",
            formatNumber(events),
            formatNumber(users),
            issue?.lastSeenVersion ?? "N/A",
          ];
        });

        console.log(
          "\n" +
            formatTable(
              ["ID", "Type", "Title", "Events", "Users", "Version"],
              tableRows,
            ),
        );
        console.log(
          c.dim(`\n${groups.length} issue${groups.length !== 1 ? "s" : ""} shown.\n`),
        );
      } catch (err: unknown) {
        const error = err as Error;
        outputError(error.message);
        process.exit(1);
      }
    },
  );

// ─── issues get ──────────────────────────────────────────────────────────────

issuesCommand
  .command("get <issueId>")
  .description("Show detailed information about a specific issue")
  .option("--json", "Output as JSON")
  .option("--project <projectId>", "Firebase project ID")
  .option("--app <appId>", "Firebase app ID")
  .action(
    async (
      issueId: string,
      options: {
        json?: boolean;
        project?: string;
        app?: string;
      },
    ) => {
      try {
        const client = await buildClient(options);

        // Fetch issue details and latest event in parallel
        const [issue, eventsResponse] = await Promise.all([
          client.getIssue(issueId),
          client.listEvents({ issueId, pageSize: 1 }),
        ]);

        // JSON output
        if (options.json) {
          outputJson({
            issue,
            latestEvent:
              eventsResponse.events && eventsResponse.events.length > 0
                ? eventsResponse.events[0]
                : null,
          });
          return;
        }

        // Detailed text output
        console.log("");
        console.log(`${c.bold("Issue:")} ${issue.id}`);
        console.log(`${c.bold("Type:")} ${colorByType(issue.errorType)}`);
        console.log(`${c.bold("Title:")} ${issue.title}`);
        console.log(`${c.bold("Subtitle:")} ${issue.subtitle}`);
        console.log(
          `${c.bold("State:")} ${formatState(issue.state)}`,
        );
        if (issue.firstSeenVersion) {
          console.log(
            `${c.bold("First seen version:")} ${issue.firstSeenVersion}`,
          );
        }
        if (issue.lastSeenVersion) {
          console.log(
            `${c.bold("Last seen version:")} ${issue.lastSeenVersion}`,
          );
        }
        if (issue.uri) {
          console.log(`${c.bold("Console URL:")} ${issue.uri}`);
        }

        // Latest event details
        if (eventsResponse.events && eventsResponse.events.length > 0) {
          const latestEvent = eventsResponse.events[0];
          const eventTime = latestEvent.eventTime ?? "N/A";
          const appVersion = latestEvent.version?.displayName ?? latestEvent.version?.displayVersion ?? "N/A";
          const deviceName = latestEvent.device?.displayName ?? latestEvent.device?.model ?? "N/A";
          const osName = latestEvent.operatingSystem?.displayName ?? latestEvent.operatingSystem?.displayVersion ?? "N/A";

          console.log(
            `\n${c.bold("Latest event:")} ${eventTime} (${appVersion})`,
          );
          console.log(`${c.bold("Device:")} ${deviceName}`);
          console.log(`${c.bold("OS:")} ${osName}`);
        }

        console.log("");
      } catch (err: unknown) {
        const error = err as Error;
        outputError(error.message);
        process.exit(1);
      }
    },
  );

// ─── issues close ────────────────────────────────────────────────────────────

issuesCommand
  .command("close <issueId>")
  .description("Close an issue (set state to CLOSED)")
  .option("--project <projectId>", "Firebase project ID")
  .option("--app <appId>", "Firebase app ID")
  .action(
    async (
      issueId: string,
      options: { project?: string; app?: string },
    ) => {
      try {
        const client = await buildClient(options);
        await client.updateIssue(issueId, "CLOSED");
        console.log(c.green(`Issue ${issueId} has been closed.`));
      } catch (err: unknown) {
        const error = err as Error;
        outputError(error.message);
        process.exit(1);
      }
    },
  );

// ─── issues mute ─────────────────────────────────────────────────────────────

issuesCommand
  .command("mute <issueId>")
  .description("Mute an issue (set state to MUTED)")
  .option("--project <projectId>", "Firebase project ID")
  .option("--app <appId>", "Firebase app ID")
  .action(
    async (
      issueId: string,
      options: { project?: string; app?: string },
    ) => {
      try {
        const client = await buildClient(options);
        await client.updateIssue(issueId, "MUTED");
        console.log(c.green(`Issue ${issueId} has been muted.`));
      } catch (err: unknown) {
        const error = err as Error;
        outputError(error.message);
        process.exit(1);
      }
    },
  );

// ─── issues open ─────────────────────────────────────────────────────────────

issuesCommand
  .command("open <issueId>")
  .description("Reopen an issue (set state to OPEN)")
  .option("--project <projectId>", "Firebase project ID")
  .option("--app <appId>", "Firebase app ID")
  .action(
    async (
      issueId: string,
      options: { project?: string; app?: string },
    ) => {
      try {
        const client = await buildClient(options);
        await client.updateIssue(issueId, "OPEN");
        console.log(c.green(`Issue ${issueId} has been reopened.`));
      } catch (err: unknown) {
        const error = err as Error;
        outputError(error.message);
        process.exit(1);
      }
    },
  );

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a colorized state label.
 */
function formatState(state: string): string {
  switch (state) {
    case "OPEN":
      return c.green(state);
    case "CLOSED":
      return c.gray(state);
    case "MUTED":
      return c.yellow(state);
    default:
      return state;
  }
}
