import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FccConfig {
  project?: string;
  projectId?: string;
  projectNumber?: string;
  app?: string;
  appId?: string;
  defaultType?: string;
  defaultLimit?: number;
  [key: string]: unknown;
}

/** Known config keys with their expected types. */
export const KNOWN_CONFIG_KEYS: Record<string, "string" | "number"> = {
  project: "string",
  projectId: "string",
  projectNumber: "string",
  app: "string",
  appId: "string",
  defaultType: "string",
  defaultLimit: "number",
};

// ─── Paths ───────────────────────────────────────────────────────────────────

/** Local config file in the current working directory. */
export function getLocalConfigPath(): string {
  return join(process.cwd(), ".fcc.json");
}

/** Global config file in the user's home directory. */
export function getGlobalConfigPath(): string {
  return join(homedir(), ".config", "fcc", "config.json");
}

// ─── Local Config ────────────────────────────────────────────────────────────

/**
 * Reads the local `.fcc.json` config file from the current working directory.
 * Returns `null` if the file does not exist.
 */
export async function readConfig(): Promise<FccConfig | null> {
  const configPath = getLocalConfigPath();

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      return null;
    }
    throw new Error(`Failed to read local config at ${configPath}: ${error.message}`);
  }

  try {
    return JSON.parse(raw) as FccConfig;
  } catch {
    throw new Error(
      `Failed to parse local config at ${configPath}. The file may be corrupted.`,
    );
  }
}

/**
 * Writes a key-value pair to the local `.fcc.json` config file.
 * Creates the file if it does not exist; merges with existing config otherwise.
 */
export async function writeConfig(key: string, value: unknown): Promise<void> {
  const configPath = getLocalConfigPath();

  // Read existing config or start fresh
  const existing = (await readConfig()) ?? {};
  existing[key] = value;

  await writeFile(configPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
}

// ─── Global Config ───────────────────────────────────────────────────────────

/**
 * Reads the global config file at `~/.config/fcc/config.json`.
 * Returns `null` if the file does not exist.
 */
export async function readGlobalConfig(): Promise<FccConfig | null> {
  const configPath = getGlobalConfigPath();

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      return null;
    }
    throw new Error(`Failed to read global config at ${configPath}: ${error.message}`);
  }

  try {
    return JSON.parse(raw) as FccConfig;
  } catch {
    throw new Error(
      `Failed to parse global config at ${configPath}. The file may be corrupted.`,
    );
  }
}

/**
 * Writes a key-value pair to the global config file at `~/.config/fcc/config.json`.
 * Creates the directory and file if they do not exist.
 */
export async function writeGlobalConfig(key: string, value: unknown): Promise<void> {
  const configPath = getGlobalConfigPath();
  const configDir = join(homedir(), ".config", "fcc");

  // Ensure the directory exists
  await mkdir(configDir, { recursive: true });

  // Read existing config or start fresh
  const existing = (await readGlobalConfig()) ?? {};
  existing[key] = value;

  await writeFile(configPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
}

// ─── Merged Config ──────────────────────────────────────────────────────────

/**
 * Returns the merged configuration: global config overridden by local config.
 * Priority: local > global.
 */
export async function getMergedConfig(): Promise<FccConfig> {
  const globalConfig = (await readGlobalConfig()) ?? {};
  const localConfig = (await readConfig()) ?? {};
  return { ...globalConfig, ...localConfig };
}

/**
 * Coerces a string value to the appropriate type for a known config key.
 * For example, `defaultLimit` expects a number.
 */
export function coerceConfigValue(key: string, value: string): unknown {
  const expectedType = KNOWN_CONFIG_KEYS[key];
  if (expectedType === "number") {
    const num = Number(value);
    if (Number.isNaN(num)) {
      throw new Error(`Value for "${key}" must be a number, got "${value}".`);
    }
    return num;
  }
  return value;
}
