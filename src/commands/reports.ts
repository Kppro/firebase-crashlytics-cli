import { Command } from "commander";
import {
  CrashlyticsClient,
  type ReportFilters,
  type ReportName,
  type IssueErrorType,
  type Report,
  type ReportGroup,
  type ReportMetrics,
} from "../api/crashlytics-client.js";
import { resolveProject, resolveApp, listApps } from "../api/firebase-project.js";
import { parseRelativeDate } from "../utils/date.js";
import {
  formatTable,
  formatNumber,
  outputJson,
  outputError,
  c,
} from "../utils/formatter.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReportOptions {
  type?: string;
  version?: string;
  from?: string;
  to?: string;
  limit?: string;
  json?: boolean;
  project?: string;
  app?: string;
}

interface DeviceReportOptions extends ReportOptions {
  platform?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Maps the user-friendly --type flag value to the API's IssueErrorType.
 */
function parseErrorType(type: string): IssueErrorType {
  switch (type.toLowerCase()) {
    case "fatal":
      return "FATAL";
    case "nonfatal":
    case "non_fatal":
    case "non-fatal":
      return "NON_FATAL";
    case "anr":
      return "ANR";
    default:
      throw new Error(
        `Invalid error type: "${type}". Valid values: fatal, nonfatal, anr.`,
      );
  }
}

/**
 * Builds a ReportFilters object from shared command options.
 */
async function buildFilters(options: ReportOptions, client?: CrashlyticsClient): Promise<ReportFilters> {
  const filters: ReportFilters = {};

  if (options.from) {
    filters.intervalStartTime = parseRelativeDate(options.from);
  }

  if (options.to) {
    filters.intervalEndTime = parseRelativeDate(options.to);
  }

  if (options.version && client) {
    filters.versionDisplayNames = await client.resolveVersionDisplayNames([options.version]);
  } else if (options.version) {
    filters.versionDisplayNames = [options.version];
  }

  if (options.type) {
    filters.issueErrorTypes = [parseErrorType(options.type)];
  }

  return filters;
}

/**
 * Resolves project, app, and creates a CrashlyticsClient.
 * Returns both the client and the project number (needed to detect platform).
 */
async function resolveClient(options: ReportOptions): Promise<{
  client: CrashlyticsClient;
  projectNumber: string;
}> {
  const project = await resolveProject(options.project);
  const appId = await resolveApp(options.app, project.projectNumber);
  const client = new CrashlyticsClient(project.projectNumber, appId);
  return { client, projectNumber: project.projectNumber };
}

/**
 * Extracts total eventsCount from a group's metrics array.
 */
function getEventsCount(group: ReportGroup): number {
  if (!group.metrics || group.metrics.length === 0) return 0;
  return group.metrics.reduce(
    (sum, m) => sum + (parseInt(m.eventsCount ?? "0", 10) || 0),
    0,
  );
}

/**
 * Extracts total impactedUsersCount from a group's metrics array.
 */
function getUsersCount(group: ReportGroup): number {
  if (!group.metrics || group.metrics.length === 0) return 0;
  return group.metrics.reduce(
    (sum, m) => sum + (parseInt(m.impactedUsersCount ?? "0", 10) || 0),
    0,
  );
}

/**
 * Extracts total sessionsCount from a group's metrics array.
 */
function getSessionsCount(group: ReportGroup): number {
  if (!group.metrics || group.metrics.length === 0) return 0;
  return group.metrics.reduce(
    (sum, m) => sum + (parseInt(m.sessionsCount ?? "0", 10) || 0),
    0,
  );
}

/**
 * Extracts total eventsCount from a metrics array (for subgroups).
 */
function getMetricsEventsCount(metrics: ReportMetrics[] | undefined): number {
  if (!metrics || metrics.length === 0) return 0;
  return metrics.reduce(
    (sum, m) => sum + (parseInt(m.eventsCount ?? "0", 10) || 0),
    0,
  );
}

/**
 * Detects the platform of the resolved app by looking it up in the project's app list.
 * Returns "ANDROID" or "IOS", or undefined if not determinable.
 */
async function detectAppPlatform(
  appId: string,
  projectNumber: string,
): Promise<"ANDROID" | "IOS" | undefined> {
  const apps = await listApps(projectNumber);
  const match = apps.find((a) => a.appId === appId);
  return match?.platform;
}

/**
 * Limits groups based on the --limit option.
 */
function limitGroups(
  groups: ReportGroup[],
  limit?: string,
): ReportGroup[] {
  if (!limit) return groups;

  const n = parseInt(limit, 10);
  if (isNaN(n) || n <= 0) {
    throw new Error(
      `Invalid limit: "${limit}". Must be a positive integer.`,
    );
  }

  return groups.slice(0, n);
}

// ─── Command ────────────────────────────────────────────────────────────────

export const reportsCommand = new Command("reports").description(
  "Aggregated crash reports and statistics",
);

// ─── Shared option factory ──────────────────────────────────────────────────

function addCommonOptions(cmd: Command): Command {
  return cmd
    .option("--type <type>", "Filter by error type (fatal, nonfatal, anr)")
    .option("--version <version>", "Filter by app version")
    .option(
      "--from <date>",
      'Start of time range (e.g. "7d", "24h", ISO 8601)',
    )
    .option("--to <date>", 'End of time range (e.g. "1d", ISO 8601)')
    .option("--limit <n>", "Maximum number of results")
    .option("--json", "Output as JSON")
    .option("--project <projectId>", "Firebase project ID")
    .option("--app <appId>", "Firebase app ID");
}

// ─── top-issues ─────────────────────────────────────────────────────────────

addCommonOptions(
  reportsCommand
    .command("top-issues")
    .description("Top crash issues with aggregated statistics"),
).action(async (options: ReportOptions) => {
  try {
    const { client } = await resolveClient(options);
    const filters = await buildFilters(options, client);
    const report = await client.getReport("TOP_ISSUES", filters);

    const groups = limitGroups(report.groups ?? [], options.limit);

    if (options.json) {
      outputJson(groups);
      return;
    }

    if (groups.length === 0) {
      console.log(c.yellow("No issues found for the given filters."));
      return;
    }

    console.log(c.bold("\nTop Issues\n"));

    const tableRows = groups.map((group) => {
      const issue = group.issue;
      return [
        issue?.id ?? "",
        issue?.title ?? "",
        issue?.subtitle ?? "",
        formatNumber(getEventsCount(group)),
        formatNumber(getUsersCount(group)),
      ];
    });

    console.log(
      formatTable(
        ["Issue ID", "Title", "Subtitle", "Crashes", "Users"],
        tableRows,
      ),
    );
    console.log(c.dim(`\n${groups.length} issue${groups.length !== 1 ? "s" : ""} shown.\n`));
  } catch (err: unknown) {
    const error = err as Error;
    outputError(error.message);
    process.exit(1);
  }
});

// ─── top-versions ───────────────────────────────────────────────────────────

addCommonOptions(
  reportsCommand
    .command("top-versions")
    .description("Crash statistics aggregated by app version"),
).action(async (options: ReportOptions) => {
  try {
    const { client } = await resolveClient(options);
    const filters = await buildFilters(options, client);
    const report = await client.getReport("TOP_VERSIONS", filters);

    const groups = limitGroups(report.groups ?? [], options.limit);

    if (options.json) {
      outputJson(groups);
      return;
    }

    if (groups.length === 0) {
      console.log(c.yellow("No version data found for the given filters."));
      return;
    }

    console.log(c.bold("\nTop Versions\n"));

    const tableRows = groups.map((group) => {
      const version = group.version;
      return [
        version?.displayName ?? version?.displayVersion ?? "",
        formatNumber(getEventsCount(group)),
        formatNumber(getUsersCount(group)),
        formatNumber(getSessionsCount(group)),
      ];
    });

    console.log(
      formatTable(
        ["Version", "Crashes", "Users affected", "Sessions"],
        tableRows,
      ),
    );
    console.log(c.dim(`\n${groups.length} version${groups.length !== 1 ? "s" : ""} shown.\n`));
  } catch (err: unknown) {
    const error = err as Error;
    outputError(error.message);
    process.exit(1);
  }
});

// ─── top-devices ────────────────────────────────────────────────────────────

addCommonOptions(
  reportsCommand
    .command("top-devices")
    .description("Crash statistics aggregated by device model"),
)
  .option(
    "--platform <platform>",
    "Device platform: android or ios (default: auto-detected from app)",
  )
  .action(async (options: DeviceReportOptions) => {
    try {
      const { client, projectNumber } = await resolveClient(options);
      const filters = await buildFilters(options, client);

      // Determine the report name based on platform
      let reportName: ReportName;
      if (options.platform) {
        const platform = options.platform.toLowerCase();
        if (platform === "android") {
          reportName = "TOP_ANDROID_DEVICES";
        } else if (platform === "ios" || platform === "apple") {
          reportName = "TOP_APPLE_DEVICES";
        } else {
          throw new Error(
            `Invalid platform: "${options.platform}". Valid values: android, ios.`,
          );
        }
      } else {
        // Auto-detect from the resolved app
        const appId = await resolveApp(options.app, projectNumber);
        const platform = await detectAppPlatform(appId, projectNumber);
        if (platform === "IOS") {
          reportName = "TOP_APPLE_DEVICES";
        } else {
          // Default to Android if detection fails
          reportName = "TOP_ANDROID_DEVICES";
        }
      }

      const report = await client.getReport(reportName, filters);
      const groups = limitGroups(report.groups ?? [], options.limit);

      if (options.json) {
        outputJson(groups);
        return;
      }

      if (groups.length === 0) {
        console.log(c.yellow("No device data found for the given filters."));
        return;
      }

      console.log(c.bold("\nTop Devices\n"));

      // Device reports can have subgroups (device models within a group)
      // Flatten subgroups for display
      const tableRows: string[][] = [];
      let totalCrashes = 0;

      for (const group of groups) {
        if (group.subgroups && group.subgroups.length > 0) {
          for (const subgroup of group.subgroups) {
            const crashes = getMetricsEventsCount(subgroup.metrics);
            totalCrashes += crashes;
            tableRows.push([
              subgroup.device?.displayName ?? "",
              formatNumber(crashes),
            ]);
          }
        } else {
          // No subgroups — use the group's device directly
          const crashes = getEventsCount(group);
          totalCrashes += crashes;
          tableRows.push([
            group.device?.displayName ?? "",
            formatNumber(crashes),
          ]);
        }
      }

      // Add percentage column
      const tableRowsWithPercent = tableRows.map((row) => {
        const crashStr = row[1];
        const crashes = parseInt(crashStr.replace(/,/g, ""), 10) || 0;
        const percentage =
          totalCrashes > 0 ? ((crashes / totalCrashes) * 100).toFixed(1) + "%" : "N/A";
        return [...row, percentage];
      });

      console.log(
        formatTable(["Device", "Crashes", "% of total"], tableRowsWithPercent),
      );
      console.log(c.dim(`\n${tableRowsWithPercent.length} device${tableRowsWithPercent.length !== 1 ? "s" : ""} shown.\n`));
    } catch (err: unknown) {
      const error = err as Error;
      outputError(error.message);
      process.exit(1);
    }
  });

// ─── top-os ─────────────────────────────────────────────────────────────────

addCommonOptions(
  reportsCommand
    .command("top-os")
    .description("Crash statistics aggregated by operating system version"),
).action(async (options: ReportOptions) => {
  try {
    const { client } = await resolveClient(options);
    const filters = await buildFilters(options, client);
    const report = await client.getReport("TOP_OPERATING_SYSTEMS", filters);

    const groups = limitGroups(report.groups ?? [], options.limit);

    if (options.json) {
      outputJson(groups);
      return;
    }

    if (groups.length === 0) {
      console.log(c.yellow("No OS data found for the given filters."));
      return;
    }

    console.log(c.bold("\nTop Operating Systems\n"));

    const tableRows = groups.map((group) => {
      const os = group.operatingSystem;
      return [
        os?.displayName ?? os?.displayVersion ?? "",
        formatNumber(getEventsCount(group)),
        formatNumber(getUsersCount(group)),
      ];
    });

    console.log(
      formatTable(["OS Version", "Crashes", "Users"], tableRows),
    );
    console.log(c.dim(`\n${groups.length} OS version${groups.length !== 1 ? "s" : ""} shown.\n`));
  } catch (err: unknown) {
    const error = err as Error;
    outputError(error.message);
    process.exit(1);
  }
});

// ─── summary ────────────────────────────────────────────────────────────────

addCommonOptions(
  reportsCommand
    .command("summary")
    .description("Overview combining top issues and top versions"),
).action(async (options: ReportOptions) => {
  try {
    const { client } = await resolveClient(options);
    const filters = await buildFilters(options, client);

    // Fetch both reports in parallel
    const [issuesReport, versionsReport] = await Promise.all([
      client.getReport("TOP_ISSUES", filters),
      client.getReport("TOP_VERSIONS", filters),
    ]);

    const topIssues = (issuesReport.groups ?? []).slice(0, 5);
    const topVersions = (versionsReport.groups ?? []).slice(0, 3);

    if (options.json) {
      outputJson({
        topIssues,
        topVersions,
      });
      return;
    }

    // ── Summary header ──────────────────────────────────────────────────

    console.log(c.bold("\n=== Crashlytics Summary ===\n"));

    // ── Total crashes from top issues ───────────────────────────────────

    const allIssueGroups = issuesReport.groups ?? [];
    const totalCrashes = allIssueGroups.reduce(
      (sum, group) => sum + getEventsCount(group),
      0,
    );

    const totalUsers = allIssueGroups.reduce(
      (sum, group) => sum + getUsersCount(group),
      0,
    );

    console.log(`  Total crashes:        ${c.bold(formatNumber(totalCrashes))}`);
    console.log(`  Total users affected: ${c.bold(formatNumber(totalUsers))}`);

    // ── Top 5 Issues ────────────────────────────────────────────────────

    console.log(c.bold("\n--- Top 5 Issues ---\n"));

    if (topIssues.length === 0) {
      console.log(c.dim("  No issues found."));
    } else {
      const issueRows = topIssues.map((group) => {
        const issue = group.issue;
        return [
          issue?.id ?? "",
          issue?.title ?? "",
          formatNumber(getEventsCount(group)),
          formatNumber(getUsersCount(group)),
        ];
      });

      console.log(
        formatTable(["Issue ID", "Title", "Crashes", "Users"], issueRows),
      );
    }

    // ── Top 3 Versions ──────────────────────────────────────────────────

    console.log(c.bold("\n--- Top 3 Versions ---\n"));

    if (topVersions.length === 0) {
      console.log(c.dim("  No version data found."));
    } else {
      const versionRows = topVersions.map((group) => {
        const version = group.version;
        return [
          version?.displayName ?? version?.displayVersion ?? "",
          formatNumber(getEventsCount(group)),
          formatNumber(getUsersCount(group)),
          formatNumber(getSessionsCount(group)),
        ];
      });

      console.log(
        formatTable(
          ["Version", "Crashes", "Users affected", "Sessions"],
          versionRows,
        ),
      );
    }

    console.log();
  } catch (err: unknown) {
    const error = err as Error;
    outputError(error.message);
    process.exit(1);
  }
});
