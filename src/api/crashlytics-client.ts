import { getAccessToken } from "../auth/firebase-auth.js";

// ─── Base URL ───────────────────────────────────────────────────────────────

const BASE_URL = "https://firebasecrashlytics.googleapis.com/v1alpha";

// ─── Enums & Type Aliases ───────────────────────────────────────────────────

export type IssueState = "OPEN" | "CLOSED" | "MUTED";

export type IssueErrorType = "FATAL" | "NON_FATAL" | "ANR";

export type IssueSignal =
  | "SIGNAL_EARLY"
  | "SIGNAL_FRESH"
  | "SIGNAL_REGRESSED"
  | "SIGNAL_REPETITIVE";

export type DeviceFormFactor =
  | "PHONE"
  | "TABLET"
  | "DESKTOP"
  | "TV"
  | "WATCH";

export type ReportName =
  | "TOP_ISSUES"
  | "TOP_VARIANTS"
  | "TOP_VERSIONS"
  | "TOP_OPERATING_SYSTEMS"
  | "TOP_APPLE_DEVICES"
  | "TOP_ANDROID_DEVICES";

// ─── Report Name Mapping ─────────────────────────────────────────────────────
// The API expects camelCase report names in the URL path, not UPPER_SNAKE_CASE.

const REPORT_NAME_MAP: Record<ReportName, string> = {
  TOP_ISSUES: "topIssues",
  TOP_VARIANTS: "topVariants",
  TOP_VERSIONS: "topVersions",
  TOP_OPERATING_SYSTEMS: "topOperatingSystems",
  TOP_APPLE_DEVICES: "topAppleDevices",
  TOP_ANDROID_DEVICES: "topAndroidDevices",
};

// ─── Filter Interfaces ──────────────────────────────────────────────────────

export interface EventFilters {
  /** ISO 8601 start time */
  intervalStartTime?: string;
  /** ISO 8601 end time */
  intervalEndTime?: string;
  versionDisplayNames?: string[];
  issueId?: string;
  issueErrorTypes?: IssueErrorType[];
  issueSignals?: IssueSignal[];
  operatingSystemDisplayNames?: string[];
  deviceDisplayNames?: string[];
  deviceFormFactors?: DeviceFormFactor[];
  pageSize?: number;
  pageToken?: string;
}

export interface ReportFilters {
  /** ISO 8601 start time */
  intervalStartTime?: string;
  /** ISO 8601 end time */
  intervalEndTime?: string;
  versionDisplayNames?: string[];
  issueId?: string;
  issueErrorTypes?: IssueErrorType[];
  issueSignals?: IssueSignal[];
  operatingSystemDisplayNames?: string[];
  deviceDisplayNames?: string[];
  deviceFormFactors?: DeviceFormFactor[];
}

// ─── Response Interfaces ────────────────────────────────────────────────────

/** Issue as returned by the real API (GET /issues/{id} or nested in reports) */
export interface Issue {
  id: string;
  title: string;
  subtitle: string;
  errorType: IssueErrorType;
  sampleEvent?: string;
  uri?: string;
  firstSeenVersion?: string;
  lastSeenVersion?: string;
  state: IssueState;
  name: string;
  variants?: Array<{ id: string; [key: string]: unknown }>;
}

/** Metrics block as returned inside report groups */
export interface ReportMetrics {
  startTime?: string;
  endTime?: string;
  eventsCount?: string;
  impactedUsersCount?: string;
  sessionsCount?: string;
}

/** A group inside a report response */
export interface ReportGroup {
  metrics?: ReportMetrics[];
  issue?: Issue;
  version?: {
    displayVersion?: string;
    buildVersion?: string;
    displayName?: string;
  };
  operatingSystem?: {
    displayVersion?: string;
    os?: string;
    displayName?: string;
  };
  device?: {
    displayName?: string;
    [key: string]: unknown;
  };
  subgroups?: Array<{
    metrics?: ReportMetrics[];
    device?: {
      displayName?: string;
      [key: string]: unknown;
    };
  }>;
  [key: string]: unknown;
}

/** Report response from the API */
export interface Report {
  groups?: ReportGroup[];
}

/** Nested device object in an Event */
export interface EventDevice {
  manufacturer?: string;
  model?: string;
  architecture?: string;
  displayName?: string;
  marketingName?: string;
  companyName?: string;
  formFactor?: string;
}

/** Nested operating system object in an Event */
export interface EventOperatingSystem {
  displayVersion?: string;
  os?: string;
  modificationState?: string;
  type?: string;
  deviceType?: string;
  displayName?: string;
}

/** Nested version object in an Event */
export interface EventVersion {
  displayVersion?: string;
  buildVersion?: string;
  displayName?: string;
}

/** Nested issue object in an Event */
export interface EventIssue {
  id?: string;
  title?: string;
  subtitle?: string;
  errorType?: string;
  sampleEvent?: string;
}

/** Nested memory object in an Event */
export interface EventMemory {
  used?: string;
  free?: string;
}

/** Event as returned by the real API */
export interface Event {
  name: string;
  platform?: string;
  bundleOrPackage?: string;
  eventId?: string;
  eventTime?: string;
  receivedTime?: string;
  issue?: EventIssue;
  device?: EventDevice;
  memory?: EventMemory;
  storage?: Record<string, unknown>;
  operatingSystem?: EventOperatingSystem;
  version?: EventVersion;
  [key: string]: unknown;
}

export interface Note {
  name: string;
  noteId: string;
  body: string;
  createTime: string;
  author: string;
}

export interface ListEventsResponse {
  events: Event[];
  nextPageToken?: string;
}

export interface BatchGetEventsResponse {
  events: Event[];
}

export interface ListNotesResponse {
  notes: Note[];
  nextPageToken?: string;
}

// ─── Error Classes ──────────────────────────────────────────────────────────

export class CrashlyticsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly statusText: string,
  ) {
    super(message);
    this.name = "CrashlyticsApiError";
  }
}

// ─── Client ─────────────────────────────────────────────────────────────────

export class CrashlyticsClient {
  private readonly projectNumber: string;
  private readonly appId: string;

  constructor(projectNumber: string, appId: string) {
    this.projectNumber = projectNumber;
    this.appId = appId;
  }

  /**
   * Returns the resource path prefix for all API calls.
   */
  private get resourcePath(): string {
    return `projects/${this.projectNumber}/apps/${this.appId}`;
  }

  // ── Generic HTTP method ─────────────────────────────────────────────────

  /**
   * Performs an authenticated HTTP request to the Crashlytics API.
   *
   * - Automatically attaches the Bearer token from Firebase auth.
   * - Parses JSON responses.
   * - Translates common HTTP error codes into actionable messages.
   */
  private async request<T>(
    method: string,
    path: string,
    options?: {
      queryParams?: Record<string, string | string[] | number | undefined>;
      body?: unknown;
    },
  ): Promise<T> {
    const accessToken = await getAccessToken();

    // Build URL with query parameters
    const url = new URL(`${BASE_URL}/${path}`);

    if (options?.queryParams) {
      for (const [key, value] of Object.entries(options.queryParams)) {
        if (value === undefined) continue;

        if (Array.isArray(value)) {
          for (const v of value) {
            url.searchParams.append(key, v);
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    };

    if (options?.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    // Execute request
    let response: Response;
    try {
      response = await fetch(url.toString(), fetchOptions);
    } catch (err: unknown) {
      const error = err as Error;
      throw new Error(
        `Network error while calling Crashlytics API: ${error.message}`,
      );
    }

    // Handle HTTP errors with clear messages
    if (!response.ok) {
      const errorBody = await response.text();

      switch (response.status) {
        case 401:
          throw new CrashlyticsApiError(
            "Authentication failed. Your access token is invalid or expired. Try running `firebase login` again.",
            401,
            response.statusText,
          );
        case 403:
          throw new CrashlyticsApiError(
            "Access denied. You do not have permission to access this resource. Check that your account has the required Firebase Crashlytics permissions.",
            403,
            response.statusText,
          );
        case 404:
          throw new CrashlyticsApiError(
            `Resource not found. Verify that project "${this.projectNumber}" and app "${this.appId}" exist and are correct.`,
            404,
            response.statusText,
          );
        case 429:
          throw new CrashlyticsApiError(
            "Rate limit exceeded. Too many requests to the Crashlytics API. Please wait a moment and try again.",
            429,
            response.statusText,
          );
        default:
          throw new CrashlyticsApiError(
            `Crashlytics API error (${response.status}): ${errorBody}`,
            response.status,
            response.statusText,
          );
      }
    }

    // Parse JSON response
    // Handle 204 No Content (e.g. after DELETE)
    if (response.status === 204) {
      return undefined as T;
    }

    let data: T;
    try {
      data = (await response.json()) as T;
    } catch {
      throw new Error(
        "Failed to parse JSON response from the Crashlytics API.",
      );
    }

    return data;
  }

  // ── Public API methods ──────────────────────────────────────────────────

  /**
   * Retrieves a single issue by its ID.
   */
  async getIssue(issueId: string): Promise<Issue> {
    return this.request<Issue>(
      "GET",
      `${this.resourcePath}/issues/${issueId}`,
    );
  }

  /**
   * Updates the state of an issue (OPEN, CLOSED, MUTED).
   */
  async updateIssue(issueId: string, state: IssueState): Promise<Issue> {
    return this.request<Issue>(
      "PATCH",
      `${this.resourcePath}/issues/${issueId}`,
      {
        queryParams: {
          updateMask: "state",
        },
        body: { state },
      },
    );
  }

  /**
   * Lists events with optional filters and pagination.
   * IMPORTANT: The API requires filter.issue.id to be set, otherwise it returns 400/500.
   */
  async listEvents(filters?: EventFilters): Promise<ListEventsResponse> {
    const queryParams: Record<string, string | string[] | number | undefined> =
      {};

    if (filters) {
      if (filters.intervalStartTime)
        queryParams["filter.interval.start_time"] = filters.intervalStartTime;
      if (filters.intervalEndTime)
        queryParams["filter.interval.end_time"] = filters.intervalEndTime;
      if (filters.versionDisplayNames)
        queryParams["filter.version.display_names"] =
          filters.versionDisplayNames;
      if (filters.issueId)
        queryParams["filter.issue.id"] = filters.issueId;
      if (filters.issueErrorTypes)
        queryParams["filter.issue.error_types"] = filters.issueErrorTypes;
      if (filters.issueSignals)
        queryParams["filter.issue.signals"] = filters.issueSignals;
      if (filters.operatingSystemDisplayNames)
        queryParams["filter.operating_system.display_names"] =
          filters.operatingSystemDisplayNames;
      if (filters.deviceDisplayNames)
        queryParams["filter.device.display_names"] = filters.deviceDisplayNames;
      if (filters.deviceFormFactors)
        queryParams["filter.device.form_factors"] = filters.deviceFormFactors;
      if (filters.pageSize) queryParams["page_size"] = filters.pageSize;
      if (filters.pageToken) queryParams["page_token"] = filters.pageToken;
    }

    return this.request<ListEventsResponse>(
      "GET",
      `${this.resourcePath}/events`,
      { queryParams },
    );
  }

  /**
   * Retrieves multiple events by their resource names in a single batch call.
   */
  async batchGetEvents(
    eventNames: string[],
  ): Promise<BatchGetEventsResponse> {
    return this.request<BatchGetEventsResponse>(
      "GET",
      `${this.resourcePath}/events:batchGet`,
      {
        queryParams: {
          names: eventNames,
        },
      },
    );
  }

  /**
   * Retrieves a named report with optional filters.
   *
   * Available report names:
   * - TOP_ISSUES, TOP_VARIANTS, TOP_VERSIONS
   * - TOP_OPERATING_SYSTEMS, TOP_APPLE_DEVICES, TOP_ANDROID_DEVICES
   */
  async getReport(
    reportName: ReportName,
    filters?: ReportFilters,
  ): Promise<Report> {
    const queryParams: Record<string, string | string[] | number | undefined> =
      {};

    if (filters) {
      if (filters.intervalStartTime)
        queryParams["filter.interval.start_time"] = filters.intervalStartTime;
      if (filters.intervalEndTime)
        queryParams["filter.interval.end_time"] = filters.intervalEndTime;
      if (filters.versionDisplayNames)
        queryParams["filter.version.display_names"] =
          filters.versionDisplayNames;
      if (filters.issueId)
        queryParams["filter.issue.id"] = filters.issueId;
      if (filters.issueErrorTypes)
        queryParams["filter.issue.error_types"] = filters.issueErrorTypes;
      if (filters.issueSignals)
        queryParams["filter.issue.signals"] = filters.issueSignals;
      if (filters.operatingSystemDisplayNames)
        queryParams["filter.operating_system.display_names"] =
          filters.operatingSystemDisplayNames;
      if (filters.deviceDisplayNames)
        queryParams["filter.device.display_names"] = filters.deviceDisplayNames;
      if (filters.deviceFormFactors)
        queryParams["filter.device.form_factors"] = filters.deviceFormFactors;
    }

    // Use camelCase report name for the URL path
    const apiReportName = REPORT_NAME_MAP[reportName];

    return this.request<Report>(
      "GET",
      `${this.resourcePath}/reports/${apiReportName}`,
      { queryParams },
    );
  }

  /**
   * Resolves user-friendly version strings (e.g. "3.4.0") to the full
   * display names expected by the API (e.g. "3.4.0 (30400)").
   *
   * Matches against displayVersion, buildVersion, or full displayName.
   * Returns the resolved display names, or the original values if no match is found.
   */
  async resolveVersionDisplayNames(versions: string[]): Promise<string[]> {
    const report = await this.getReport("TOP_VERSIONS");
    const groups = report.groups ?? [];

    return versions.map((input) => {
      // If the input already looks like a full displayName (contains parentheses), use as-is
      if (input.includes("(")) return input;

      for (const group of groups) {
        const v = group.version;
        if (!v) continue;

        if (
          v.displayVersion === input ||
          v.buildVersion === input ||
          v.displayName === input
        ) {
          return v.displayName ?? input;
        }
      }

      // No match found — return original (API will return empty results rather than 500)
      return input;
    });
  }

  /**
   * Creates a note on an issue.
   */
  async createNote(issueId: string, body: string): Promise<Note> {
    return this.request<Note>(
      "POST",
      `${this.resourcePath}/issues/${issueId}/notes`,
      {
        body: { body },
      },
    );
  }

  /**
   * Lists all notes on an issue.
   */
  async listNotes(issueId: string): Promise<ListNotesResponse> {
    return this.request<ListNotesResponse>(
      "GET",
      `${this.resourcePath}/issues/${issueId}/notes`,
    );
  }

  /**
   * Deletes a specific note from an issue.
   */
  async deleteNote(issueId: string, noteId: string): Promise<void> {
    return this.request<void>(
      "DELETE",
      `${this.resourcePath}/issues/${issueId}/notes/${noteId}`,
    );
  }
}
