import { Command } from "commander";
import { resolveProject, resolveApp } from "../api/firebase-project.js";
import {
  CrashlyticsClient,
  type EventFilters,
  type IssueErrorType,
  type IssueSignal,
  type Event,
} from "../api/crashlytics-client.js";
import {
  formatTable,
  truncate,
  colorByType,
  outputJson,
  outputError,
  c,
} from "../utils/formatter.js";
import { parseRelativeDate, timeAgo, formatDate } from "../utils/date.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EventsListOptions {
  type?: string;
  version?: string;
  issue?: string;
  device?: string;
  os?: string;
  from?: string;
  to?: string;
  signal?: string;
  limit?: string;
  json?: boolean;
  project?: string;
  app?: string;
}

interface EventsGetOptions {
  json?: boolean;
  project?: string;
  app?: string;
}

// ─── Error Type Mapping ─────────────────────────────────────────────────────

const ERROR_TYPE_MAP: Record<string, IssueErrorType> = {
  fatal: "FATAL",
  nonfatal: "NON_FATAL",
  anr: "ANR",
};

// ─── Signal Mapping ─────────────────────────────────────────────────────────

const SIGNAL_MAP: Record<string, IssueSignal> = {
  fresh: "SIGNAL_FRESH",
  regressed: "SIGNAL_REGRESSED",
  repetitive: "SIGNAL_REPETITIVE",
  early: "SIGNAL_EARLY",
};

// ─── Command ────────────────────────────────────────────────────────────────

export const eventsCommand = new Command("events").description(
  "Browse and inspect crash events",
);

// ─── events list ────────────────────────────────────────────────────────────

eventsCommand
  .command("list")
  .description("List recent crash events with optional filters")
  .option("--type <type>", "Filter by error type (fatal, nonfatal, anr)")
  .option("--version <version>", "Filter by app version")
  .option("--issue <issueId>", "Filter by issue ID (required by the API)")
  .option("--device <device>", "Filter by device model")
  .option("--os <os>", "Filter by operating system")
  .option("--from <date>", "Start date (ISO 8601 or relative: 7d, 24h)")
  .option("--to <date>", "End date (ISO 8601 or relative: 7d, 24h)")
  .option(
    "--signal <signal>",
    "Filter by signal (fresh, regressed, repetitive, early)",
  )
  .option("--limit <n>", "Number of results (default 20)", "20")
  .option("--json", "Output as JSON")
  .option("--project <projectId>", "Firebase project ID")
  .option("--app <appId>", "Firebase app ID")
  .action(async (options: EventsListOptions) => {
    try {
      // Resolve project and app
      const project = await resolveProject(options.project);
      const appId = await resolveApp(options.app, project.projectNumber);
      const client = new CrashlyticsClient(project.projectNumber, appId);

      // The events endpoint requires filter.issue.id
      if (!options.issue) {
        throw new Error(
          "The --issue <issueId> option is required. The Crashlytics events API requires an issue ID filter.\n" +
          "Use `issues list` to find issue IDs first.",
        );
      }

      // Build filters
      const filters: EventFilters = {};

      if (options.from) {
        filters.intervalStartTime = parseRelativeDate(options.from);
      }

      if (options.to) {
        filters.intervalEndTime = parseRelativeDate(options.to);
      }

      if (options.type) {
        const errorType = ERROR_TYPE_MAP[options.type.toLowerCase()];
        if (!errorType) {
          throw new Error(
            `Invalid error type "${options.type}". Valid types: fatal, nonfatal, anr`,
          );
        }
        filters.issueErrorTypes = [errorType];
      }

      if (options.signal) {
        const signal = SIGNAL_MAP[options.signal.toLowerCase()];
        if (!signal) {
          throw new Error(
            `Invalid signal "${options.signal}". Valid signals: fresh, regressed, repetitive, early`,
          );
        }
        filters.issueSignals = [signal];
      }

      if (options.version) {
        filters.versionDisplayNames = await client.resolveVersionDisplayNames([options.version]);
      }

      filters.issueId = options.issue;

      if (options.device) {
        filters.deviceDisplayNames = [options.device];
      }

      if (options.os) {
        filters.operatingSystemDisplayNames = [options.os];
      }

      const limit = parseInt(options.limit ?? "20", 10);
      if (isNaN(limit) || limit < 1) {
        throw new Error("--limit must be a positive integer.");
      }
      filters.pageSize = limit;

      // Fetch events
      const response = await client.listEvents(filters);
      const events = response.events ?? [];

      if (events.length === 0) {
        if (options.json) {
          outputJson([]);
        } else {
          console.log(
            c.yellow("No events found matching the specified filters."),
          );
        }
        return;
      }

      // JSON output
      if (options.json) {
        outputJson(events);
        return;
      }

      // Table output
      console.log(c.bold("\nCrash Events:\n"));

      const rows = events.map((event) => [
        c.gray(truncate(event.eventId ?? extractEventId(event.name), 16)),
        colorByType(event.issue?.errorType ?? ""),
        truncate(event.issue?.id ?? "", 16),
        truncate(event.device?.displayName ?? event.device?.model ?? "", 20),
        truncate(event.operatingSystem?.displayName ?? event.operatingSystem?.displayVersion ?? "", 14),
        event.version?.displayName ?? event.version?.displayVersion ?? "",
        event.eventTime ? c.dim(timeAgo(event.eventTime)) : c.dim("N/A"),
      ]);

      console.log(
        formatTable(
          ["Event ID", "Type", "Issue", "Device", "OS", "Version", "Time"],
          rows,
        ),
      );

      console.log(
        c.dim(
          `\n${events.length} event${events.length > 1 ? "s" : ""} shown.${response.nextPageToken ? " More results available." : ""}\n`,
        ),
      );
    } catch (err: unknown) {
      const error = err as Error;
      outputError(error.message);
      process.exit(1);
    }
  });

// ─── events get <eventName> ─────────────────────────────────────────────────

eventsCommand
  .command("get")
  .description("Show full details of a specific crash event")
  .argument("<eventName>", "Event resource name or event ID")
  .option("--json", "Output as JSON")
  .option("--project <projectId>", "Firebase project ID")
  .option("--app <appId>", "Firebase app ID")
  .action(async (eventName: string, options: EventsGetOptions) => {
    try {
      // Resolve project and app
      const project = await resolveProject(options.project);
      const appId = await resolveApp(options.app, project.projectNumber);
      const client = new CrashlyticsClient(project.projectNumber, appId);

      // Fetch event details
      const response = await client.batchGetEvents([eventName]);
      const events = response.events ?? [];

      if (events.length === 0) {
        throw new Error(
          `Event "${eventName}" not found. Verify the event name is correct.`,
        );
      }

      const event = events[0];

      // JSON output
      if (options.json) {
        outputJson(event);
        return;
      }

      // Detailed output
      renderEventDetail(event);
    } catch (err: unknown) {
      const error = err as Error;
      outputError(error.message);
      process.exit(1);
    }
  });

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extracts the short event ID from the full resource name.
 * e.g. "projects/123/apps/456/events/evt_abc123" -> "evt_abc123"
 */
function extractEventId(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
}

/**
 * Renders a detailed view of a single crash event to the console.
 */
function renderEventDetail(event: Event): void {
  const separator = c.dim("─".repeat(60));

  console.log();
  console.log(c.bold("Event Details"));
  console.log(separator);

  // Basic info
  console.log(`  ${c.bold("Name:")}       ${event.name}`);
  console.log(`  ${c.bold("Event ID:")}   ${event.eventId ?? extractEventId(event.name)}`);
  console.log(`  ${c.bold("Type:")}       ${colorByType(event.issue?.errorType ?? "")}`);
  console.log(`  ${c.bold("Issue ID:")}   ${event.issue?.id ?? c.dim("N/A")}`);
  console.log(`  ${c.bold("Issue:")}      ${event.issue?.title ?? c.dim("N/A")}`);
  console.log(
    `  ${c.bold("Time:")}       ${event.eventTime ? `${formatDate(event.eventTime)} (${timeAgo(event.eventTime)})` : c.dim("N/A")}`,
  );
  if (event.platform) {
    console.log(`  ${c.bold("Platform:")}   ${event.platform}`);
  }
  if (event.bundleOrPackage) {
    console.log(`  ${c.bold("Bundle:")}     ${event.bundleOrPackage}`);
  }

  console.log();
  console.log(c.bold("Device Information"));
  console.log(separator);
  console.log(`  ${c.bold("Device:")}     ${event.device?.displayName ?? event.device?.model ?? c.dim("N/A")}`);
  if (event.device?.marketingName) {
    console.log(`  ${c.bold("Marketing:")}  ${event.device.marketingName}`);
  }
  if (event.device?.manufacturer) {
    console.log(`  ${c.bold("Manufacturer:")} ${event.device.manufacturer}`);
  }
  if (event.device?.architecture) {
    console.log(`  ${c.bold("Architecture:")} ${event.device.architecture}`);
  }
  if (event.device?.formFactor) {
    console.log(`  ${c.bold("Form factor:")} ${event.device.formFactor}`);
  }
  console.log(
    `  ${c.bold("OS:")}         ${event.operatingSystem?.displayName ?? event.operatingSystem?.displayVersion ?? c.dim("N/A")}`,
  );
  console.log(
    `  ${c.bold("App Version:")} ${event.version?.displayName ?? event.version?.displayVersion ?? c.dim("N/A")}`,
  );

  // Memory
  if (event.memory && (event.memory.used || event.memory.free)) {
    console.log();
    console.log(c.bold("Memory"));
    console.log(separator);
    if (event.memory.used) {
      const usedMB = (parseInt(event.memory.used, 10) / (1024 * 1024)).toFixed(0);
      console.log(`  ${c.bold("Used:")}  ${usedMB} MB`);
    }
    if (event.memory.free) {
      const freeMB = (parseInt(event.memory.free, 10) / (1024 * 1024)).toFixed(0);
      console.log(`  ${c.bold("Free:")}  ${freeMB} MB`);
    }
  }

  console.log();
}
