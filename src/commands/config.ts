import { Command } from "commander";
import chalk from "chalk";
import {
  readConfig,
  writeConfig,
  readGlobalConfig,
  writeGlobalConfig,
  getMergedConfig,
  getLocalConfigPath,
  getGlobalConfigPath,
  coerceConfigValue,
  KNOWN_CONFIG_KEYS,
} from "../utils/config.js";

// ─── Command ─────────────────────────────────────────────────────────────────

export const configCommand = new Command("config").description(
  "Manage fcc configuration (local and global)",
);

// ─── config set <key> <value> ───────────────────────────────────────────────

configCommand
  .command("set")
  .description("Set a config value in the local .fcc.json file")
  .argument("<key>", `Config key (${Object.keys(KNOWN_CONFIG_KEYS).join(", ")})`)
  .argument("<value>", "Config value")
  .action(async (key: string, value: string) => {
    try {
      warnIfUnknownKey(key);
      const coerced = coerceConfigValue(key, value);
      await writeConfig(key, coerced);
      console.log(
        chalk.green(`Set ${chalk.bold(key)} = ${chalk.bold(String(coerced))} in local config`),
      );
      console.log(chalk.dim(`  → ${getLocalConfigPath()}`));
    } catch (err: unknown) {
      const error = err as Error;
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ─── config set-global <key> <value> ────────────────────────────────────────

configCommand
  .command("set-global")
  .description("Set a config value in the global ~/.config/fcc/config.json file")
  .argument("<key>", `Config key (${Object.keys(KNOWN_CONFIG_KEYS).join(", ")})`)
  .argument("<value>", "Config value")
  .action(async (key: string, value: string) => {
    try {
      warnIfUnknownKey(key);
      const coerced = coerceConfigValue(key, value);
      await writeGlobalConfig(key, coerced);
      console.log(
        chalk.green(`Set ${chalk.bold(key)} = ${chalk.bold(String(coerced))} in global config`),
      );
      console.log(chalk.dim(`  → ${getGlobalConfigPath()}`));
    } catch (err: unknown) {
      const error = err as Error;
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ─── config get <key> ───────────────────────────────────────────────────────

configCommand
  .command("get")
  .description("Get a config value (local config takes priority over global)")
  .argument("<key>", "Config key to read")
  .action(async (key: string) => {
    try {
      const localConfig = await readConfig();
      const globalConfig = await readGlobalConfig();

      // Check local first, then global
      if (localConfig && key in localConfig && localConfig[key] !== undefined) {
        console.log(String(localConfig[key]));
        console.log(chalk.dim(`  (source: local — ${getLocalConfigPath()})`));
        return;
      }

      if (globalConfig && key in globalConfig && globalConfig[key] !== undefined) {
        console.log(String(globalConfig[key]));
        console.log(chalk.dim(`  (source: global — ${getGlobalConfigPath()})`));
        return;
      }

      console.log(chalk.yellow(`Key "${key}" is not set.`));
      process.exit(1);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ─── config list ────────────────────────────────────────────────────────────

configCommand
  .command("list")
  .description("List all config values (local + global merged)")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    try {
      const globalConfig = (await readGlobalConfig()) ?? {};
      const localConfig = (await readConfig()) ?? {};
      const merged = await getMergedConfig();

      if (options.json) {
        console.log(JSON.stringify(merged, null, 2));
        return;
      }

      const mergedKeys = Object.keys(merged);

      if (mergedKeys.length === 0) {
        console.log(chalk.yellow("No configuration set."));
        console.log(chalk.dim(`\nLocal config:  ${getLocalConfigPath()}`));
        console.log(chalk.dim(`Global config: ${getGlobalConfigPath()}`));
        return;
      }

      console.log(chalk.bold("\nConfiguration:\n"));

      for (const key of mergedKeys) {
        const value = merged[key];
        const inLocal = key in localConfig && localConfig[key] !== undefined;
        const inGlobal = key in globalConfig && globalConfig[key] !== undefined;

        let source: string;
        if (inLocal && inGlobal) {
          source = chalk.dim("local (overrides global)");
        } else if (inLocal) {
          source = chalk.dim("local");
        } else {
          source = chalk.dim("global");
        }

        console.log(`  ${chalk.cyan(key)} = ${chalk.bold(String(value))}  ${source}`);
      }

      console.log(chalk.dim(`\nLocal config:  ${getLocalConfigPath()}`));
      console.log(chalk.dim(`Global config: ${getGlobalConfigPath()}\n`));
    } catch (err: unknown) {
      const error = err as Error;
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ─── Helpers ────────────────────────────────────────────────────────────────

function warnIfUnknownKey(key: string): void {
  if (!(key in KNOWN_CONFIG_KEYS)) {
    console.warn(
      chalk.yellow(
        `Warning: "${key}" is not a known config key. Known keys: ${Object.keys(KNOWN_CONFIG_KEYS).join(", ")}`,
      ),
    );
  }
}
