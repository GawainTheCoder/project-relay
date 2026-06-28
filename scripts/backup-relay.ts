#!/usr/bin/env node

import "dotenv/config";

import { createRelayBackup } from "./backup-relay-lib.js";

interface CliOptions {
  databasePath?: string;
  help: boolean;
  outputPath?: string;
}

export function parseArguments(arguments_: string[]): CliOptions {
  const options: CliOptions = { help: false };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--database" || argument === "-d") {
      options.databasePath = requireValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--output" || argument === "-o") {
      options.outputPath = requireValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

export function usage(): string {
  return [
    "Create a consistent, private backup of Relay's local SQLite database.",
    "",
    "Usage:",
    "  tsx scripts/backup-relay.ts [options]",
    "",
    "Options:",
    "  -d, --database <path>  Source database (default: RELAY_DATABASE_PATH or data/relay.sqlite)",
    "  -o, --output <path>    Exact destination file (default: backups/relay/relay-<timestamp>.sqlite)",
    "  -h, --help             Show this help",
    "",
    "Existing destination files are never overwritten.",
  ].join("\n");
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.info(usage());
    return;
  }

  const result = await createRelayBackup({
    ...(options.databasePath ? { databasePath: options.databasePath } : {}),
    ...(options.outputPath ? { outputPath: options.outputPath } : {}),
  });
  console.info(`Relay backup created: ${result.outputPath}`);
}

function requireValue(
  arguments_: string[],
  index: number,
  option: string,
): string {
  const value = arguments_[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires a path.`);
  }
  return value;
}

if (process.argv[1]?.endsWith("backup-relay.ts")) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(message);
    process.exitCode = 1;
  });
}
