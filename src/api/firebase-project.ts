import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAccessToken } from "../auth/firebase-auth.js";
import { readConfig } from "../utils/config.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const FIREBASE_API_BASE = "https://firebase.googleapis.com/v1beta1";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FirebaseProject {
  projectId: string;
  projectNumber: string;
  displayName: string;
  name: string;
}

export interface FirebaseApp {
  platform: "ANDROID" | "IOS";
  appId: string;
  displayName: string;
  packageName?: string; // Android
  bundleId?: string; // iOS
}

interface FirebaseProjectResponse {
  projectId: string;
  projectNumber: string;
  displayName: string;
  name: string;
}

interface AndroidApp {
  appId: string;
  displayName?: string;
  packageName?: string;
}

interface IosApp {
  appId: string;
  displayName?: string;
  bundleId?: string;
}

interface ListAndroidAppsResponse {
  apps?: AndroidApp[];
}

interface ListIosAppsResponse {
  apps?: IosApp[];
}

interface FirebaseRc {
  projects?: {
    default?: string;
    [key: string]: string | undefined;
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Performs an authenticated GET request to the Firebase Management API.
 */
async function firebaseApiGet<T>(path: string): Promise<T> {
  const accessToken = await getAccessToken();
  const url = `${FIREBASE_API_BASE}/${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    throw new Error(`Network error while calling Firebase API: ${error.message}`);
  }

  if (!response.ok) {
    const body = await response.text();
    switch (response.status) {
      case 401:
        throw new Error(
          "Authentication failed. Your access token is invalid or expired. Try running `firebase login` again.",
        );
      case 403:
        throw new Error(
          "Access denied. You do not have permission to access this Firebase project.",
        );
      case 404:
        throw new Error(
          `Firebase project not found. Verify the project ID is correct. API responded: ${body}`,
        );
      default:
        throw new Error(`Firebase API error (${response.status}): ${body}`);
    }
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("Failed to parse JSON response from the Firebase API.");
  }
}

/**
 * Reads the `.firebaserc` file from the current working directory
 * and returns the default project ID if available.
 */
async function readFirebaseRc(): Promise<string | null> {
  const rcPath = join(process.cwd(), ".firebaserc");

  let raw: string;
  try {
    raw = await readFile(rcPath, "utf-8");
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      return null;
    }
    throw new Error(`Failed to read .firebaserc: ${error.message}`);
  }

  try {
    const rc = JSON.parse(raw) as FirebaseRc;
    return rc.projects?.default ?? null;
  } catch {
    throw new Error("Failed to parse .firebaserc. The file may be corrupted.");
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Lists all Firebase projects accessible to the authenticated user.
 * Handles pagination automatically.
 */
export async function listProjects(): Promise<FirebaseProject[]> {
  const projects: FirebaseProject[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    if (pageToken) params.set("pageToken", pageToken);

    const response = await firebaseApiGet<{
      results?: FirebaseProjectResponse[];
      nextPageToken?: string;
    }>(`projects?${params.toString()}`);

    if (response.results) {
      for (const p of response.results) {
        projects.push({
          projectId: p.projectId,
          projectNumber: p.projectNumber,
          displayName: p.displayName,
          name: p.name,
        });
      }
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  return projects;
}

/**
 * Resolves the Firebase project ID and project number.
 *
 * Resolution order:
 * 1. Explicit `projectIdOrFlag` parameter (from --project flag)
 * 2. `.firebaserc` in the current working directory
 * 3. Local `.fcc.json` config
 *
 * Once a projectId is found, it is converted to a projectNumber
 * via the Firebase Management API.
 *
 * @returns The full Firebase project info including projectNumber.
 */
export async function resolveProject(
  projectIdOrFlag?: string,
): Promise<FirebaseProject> {
  let projectId = projectIdOrFlag;

  // 1. Try .firebaserc
  if (!projectId) {
    projectId = await readFirebaseRc() ?? undefined;
  }

  // 2. Try local .fcc.json config (set via `fcc set project`)
  if (!projectId) {
    const config = await readConfig();
    projectId = config?.project ?? undefined;
  }

  if (!projectId) {
    throw new Error(
      "No project specified. Use --project <projectId>, `fcc set project <id>`, or run `fcc projects list` to see available projects.",
    );
  }

  // Convert projectId to projectNumber via the Firebase Management API
  const project = await firebaseApiGet<FirebaseProjectResponse>(
    `projects/${projectId}`,
  );

  return {
    projectId: project.projectId,
    projectNumber: project.projectNumber,
    displayName: project.displayName,
    name: project.name,
  };
}

/**
 * Lists all Android and iOS apps for a given Firebase project.
 *
 * @param projectNumber - The Firebase project number (or project ID resource name).
 * @returns Combined list of Android and iOS apps.
 */
export async function listApps(projectNumber: string): Promise<FirebaseApp[]> {
  const [androidResponse, iosResponse] = await Promise.all([
    firebaseApiGet<ListAndroidAppsResponse>(
      `projects/${projectNumber}/androidApps`,
    ),
    firebaseApiGet<ListIosAppsResponse>(
      `projects/${projectNumber}/iosApps`,
    ),
  ]);

  const apps: FirebaseApp[] = [];

  if (androidResponse.apps) {
    for (const app of androidResponse.apps) {
      apps.push({
        platform: "ANDROID",
        appId: app.appId,
        displayName: app.displayName ?? "",
        packageName: app.packageName,
      });
    }
  }

  if (iosResponse.apps) {
    for (const app of iosResponse.apps) {
      apps.push({
        platform: "IOS",
        appId: app.appId,
        displayName: app.displayName ?? "",
        bundleId: app.bundleId,
      });
    }
  }

  return apps;
}

/**
 * Resolves the Firebase app ID.
 *
 * Resolution order:
 * 1. Explicit `appIdOrFlag` parameter (from --app flag)
 * 2. Local `.fcc.json` config
 * 3. List apps from the project and take the first one
 *
 * @param appIdOrFlag - Explicit app ID from --app flag.
 * @param projectNumber - The Firebase project number (required if listing apps).
 * @returns The resolved app ID.
 */
export async function resolveApp(
  appIdOrFlag?: string,
  projectNumber?: string,
): Promise<string> {
  // 1. Explicit flag
  if (appIdOrFlag) {
    return appIdOrFlag;
  }

  // 2. Try local .fcc.json config (set via `fcc set app`)
  const config = await readConfig();
  if (config?.app) {
    return config.app;
  }

  // 3. List apps and pick the first one
  if (!projectNumber) {
    throw new Error(
      "Could not determine the Firebase app. Provide --app <appId>, " +
        "or set it in .fcc.json, or provide --project so apps can be listed.",
    );
  }

  const apps = await listApps(projectNumber);

  if (apps.length === 0) {
    throw new Error(
      `No apps found in Firebase project "${projectNumber}". ` +
        "Register an app in the Firebase Console first.",
    );
  }

  // Take the first app
  const selectedApp = apps[0];
  return selectedApp.appId;
}
