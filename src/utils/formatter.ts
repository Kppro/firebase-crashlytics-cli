import chalk, { Chalk, type ChalkInstance } from "chalk";
import Table from "cli-table3";

// ─── TTY Detection ──────────────────────────────────────────────────────────

/**
 * Whether stdout is a TTY (interactive terminal).
 * When piping output, colors and decorations are disabled automatically.
 */
const isTTY = Boolean(process.stdout.isTTY);

/**
 * A chalk instance that respects TTY detection.
 * Colors are enabled in interactive terminals and disabled when piping.
 */
export const c: ChalkInstance = new Chalk({
  level: isTTY ? chalk.level : 0,
});

// ─── Table Formatting ───────────────────────────────────────────────────────

/**
 * Creates a formatted CLI table using cli-table3.
 *
 * - Headers are rendered in bold.
 * - Column widths are computed automatically based on content.
 * - Styling is clean (no colored borders or header backgrounds).
 *
 * @param headers - Column header labels.
 * @param rows    - Array of rows, each row being an array of cell strings.
 * @returns The rendered table string ready for `console.log()`.
 */
export function formatTable(headers: string[], rows: string[][]): string {
  const table = new Table({
    head: headers.map((h) => c.bold(h)),
    style: {
      head: [],
      border: [],
    },
  });

  for (const row of rows) {
    table.push(row);
  }

  return table.toString();
}

// ─── String Utilities ───────────────────────────────────────────────────────

/**
 * Truncates a string to `maxLen` characters, appending "..." if truncated.
 *
 * @param str    - The input string.
 * @param maxLen - Maximum allowed length (must be >= 4 to allow at least one char + "...").
 * @returns The original string if within limits, or a truncated version ending with "...".
 */
export function truncate(str: string, maxLen: number): string {
  if (maxLen < 4) {
    return str.length <= maxLen ? str : str.slice(0, maxLen);
  }

  if (str.length <= maxLen) {
    return str;
  }

  return str.slice(0, maxLen - 3) + "...";
}

// ─── Color by Error Type ────────────────────────────────────────────────────

/**
 * Returns a colorized string based on the Crashlytics error type.
 *
 * - `FATAL`     → red
 * - `NON_FATAL` → yellow
 * - `ANR`       → magenta (closest to orange in terminal palettes)
 * - Other       → unchanged
 *
 * @param type - The error type string (e.g. "FATAL", "NON_FATAL", "ANR").
 * @returns The colorized type string.
 */
export function colorByType(type: string): string {
  switch (type) {
    case "FATAL":
      return c.red(type);
    case "NON_FATAL":
      return c.yellow(type);
    case "ANR":
      return c.magenta(type);
    default:
      return type;
  }
}

// ─── Number Formatting ──────────────────────────────────────────────────────

/**
 * Formats a number with locale-aware thousand separators.
 *
 * Examples:
 * - `1234`    → `"1,234"`
 * - `1000000` → `"1,000,000"`
 * - `42`      → `"42"`
 *
 * @param n - The number to format.
 * @returns The formatted string with comma separators.
 */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

// ─── Output Helpers ─────────────────────────────────────────────────────────

/**
 * Outputs data as pretty-printed JSON to stdout.
 * Intended for `--json` mode — no colors, no decoration.
 *
 * @param data - Any serializable value.
 */
export function outputJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

/**
 * Outputs an error message to stderr in red.
 * Uses TTY-aware chalk so colors are stripped when piping.
 *
 * @param msg - The error message string.
 */
export function outputError(msg: string): void {
  process.stderr.write(c.red(`Error: ${msg}`) + "\n");
}
