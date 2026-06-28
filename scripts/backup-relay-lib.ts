import { randomUUID } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  realpath,
  unlink,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

export interface BackupOptions {
  databasePath?: string;
  now?: Date;
  outputPath?: string;
}

export interface BackupResult {
  databasePath: string;
  outputPath: string;
  pagesCopied: number;
}

const DEFAULT_DATABASE_PATH = resolve(process.cwd(), "data", "relay.sqlite");
const DEFAULT_BACKUP_DIRECTORY = resolve(process.cwd(), "backups", "relay");

export async function createRelayBackup(
  options: BackupOptions = {},
): Promise<BackupResult> {
  const requestedDatabasePath =
    options.databasePath ??
    process.env.RELAY_DATABASE_PATH ??
    DEFAULT_DATABASE_PATH;
  const requestedPath = resolve(requestedDatabasePath);
  await assertReadableDatabase(requestedPath);
  const databasePath = await realpath(requestedPath);

  const outputPath = resolve(
    options.outputPath ??
      resolve(
        DEFAULT_BACKUP_DIRECTORY,
        `relay-${formatTimestamp(options.now ?? new Date())}.sqlite`,
      ),
  );
  if (databasePath === outputPath) {
    throw new Error("Backup destination must differ from the Relay database.");
  }

  await mkdir(dirname(outputPath), { mode: 0o700, recursive: true });
  await assertDestinationAvailable(outputPath);

  const temporaryPath = resolve(
    dirname(outputPath),
    `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const reservation = await open(temporaryPath, "wx", 0o600);
  await reservation.close();

  let sourceDatabase: DatabaseSync | undefined;
  try {
    sourceDatabase = new DatabaseSync(databasePath, {
      readOnly: true,
    });
    sourceDatabase.exec("PRAGMA busy_timeout = 5000");
    const pagesCopied = await backup(sourceDatabase, temporaryPath);
    await verifyBackup(temporaryPath);
    await chmod(temporaryPath, 0o600);

    try {
      await link(temporaryPath, outputPath);
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        throw new Error(
          `Backup destination already exists; nothing was overwritten: ${outputPath}`,
          { cause: error },
        );
      }
      throw error;
    }
    return {
      databasePath,
      outputPath,
      pagesCopied,
    };
  } catch (error) {
    throw normalizeBackupError(error, databasePath, outputPath);
  } finally {
    sourceDatabase?.close();
    await cleanupTemporaryFiles(temporaryPath);
  }
}

export function formatTimestamp(date: Date): string {
  if (Number.isNaN(date.valueOf())) {
    throw new Error("Cannot create a backup with an invalid timestamp.");
  }
  return date
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.(\d{3})Z$/, "-$1Z");
}

async function assertReadableDatabase(databasePath: string): Promise<void> {
  let stats;
  try {
    stats = await lstat(databasePath);
  } catch (error) {
    throw new Error(`Relay database does not exist: ${databasePath}`, {
      cause: error,
    });
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(
      `Relay database must be a regular file, not a directory or symbolic link: ${databasePath}`,
    );
  }
}

async function assertDestinationAvailable(outputPath: string): Promise<void> {
  try {
    await lstat(outputPath);
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }
    throw error;
  }
  throw new Error(
    `Backup destination already exists; nothing was overwritten: ${outputPath}`,
  );
}

async function verifyBackup(path: string): Promise<void> {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const result = database.prepare("PRAGMA integrity_check").get() as
      | { integrity_check?: unknown }
      | undefined;
    if (result?.integrity_check !== "ok") {
      throw new Error("SQLite integrity check did not return ok.");
    }
  } finally {
    database.close();
  }
}

async function cleanupTemporaryFiles(path: string): Promise<void> {
  await Promise.all(
    [path, `${path}-journal`, `${path}-shm`, `${path}-wal`].map(
      async (candidate) => {
        await unlink(candidate).catch(() => undefined);
      },
    ),
  );
}

function normalizeBackupError(
  error: unknown,
  databasePath: string,
  outputPath: string,
): Error {
  if (error instanceof Error && error.message.startsWith("Backup ")) {
    return error;
  }
  const detail = error instanceof Error ? error.message : "Unknown error";
  return new Error(
    `Backup failed for ${databasePath} -> ${outputPath}: ${detail}`,
    { cause: error },
  );
}

function isAlreadyExistsError(error: unknown): boolean {
  return hasErrorCode(error, "EEXIST");
}

function isNotFoundError(error: unknown): boolean {
  return hasErrorCode(error, "ENOENT");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
