import {
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  createRelayBackup,
  formatTimestamp,
} from "./backup-relay-lib.js";
import { parseArguments } from "./backup-relay.js";

describe("createRelayBackup", () => {
  it("copies a live WAL database into a consistent standalone file", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "relay-backup-"));
    const sourcePath = resolve(directory, "relay.sqlite");
    const outputPath = resolve(directory, "backups", "snapshot.sqlite");
    const source = new DatabaseSync(sourcePath);
    source.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE research (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
      INSERT INTO research (title) VALUES ('Optics constraint');
    `);

    try {
      const result = await createRelayBackup({
        databasePath: sourcePath,
        outputPath,
      });
      expect(result.outputPath).toBe(outputPath);
      expect(result.pagesCopied).toBeGreaterThan(0);
      expect(
        (await readdir(resolve(directory, "backups"))).filter((name) =>
          name.startsWith(".snapshot.sqlite."),
        ),
      ).toEqual([]);

      const restored = new DatabaseSync(outputPath, { readOnly: true });
      try {
        expect(
          restored.prepare("SELECT title FROM research").get(),
        ).toEqual({
          title: "Optics constraint",
        });
        expect(
          restored.prepare("PRAGMA integrity_check").get(),
        ).toEqual({
          integrity_check: "ok",
        });
      } finally {
        restored.close();
      }
    } finally {
      source.close();
    }
  });

  it("uses owner-only permissions for the backup file", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "relay-backup-"));
    const sourcePath = resolve(directory, "relay.sqlite");
    const outputPath = resolve(directory, "snapshot.sqlite");
    const source = new DatabaseSync(sourcePath);
    source.exec("CREATE TABLE item (id INTEGER PRIMARY KEY)");
    source.close();

    await createRelayBackup({ databasePath: sourcePath, outputPath });

    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
  });

  it("never overwrites an existing destination", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "relay-backup-"));
    const sourcePath = resolve(directory, "relay.sqlite");
    const outputPath = resolve(directory, "snapshot.sqlite");
    const source = new DatabaseSync(sourcePath);
    source.exec("CREATE TABLE item (id INTEGER PRIMARY KEY)");
    source.close();
    await writeFile(outputPath, "keep me", { mode: 0o600 });

    await expect(
      createRelayBackup({ databasePath: sourcePath, outputPath }),
    ).rejects.toThrow("already exists; nothing was overwritten");
    expect(await readFile(outputPath, "utf8")).toBe("keep me");
  });

  it("reports a useful error when the database is missing", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "relay-backup-"));
    const sourcePath = resolve(directory, "missing.sqlite");

    await expect(
      createRelayBackup({ databasePath: sourcePath }),
    ).rejects.toThrow(`Relay database does not exist: ${sourcePath}`);
  });
});

describe("formatTimestamp", () => {
  it("produces a filesystem-safe UTC timestamp", () => {
    expect(formatTimestamp(new Date("2026-06-28T04:05:06.007Z"))).toBe(
      "2026-06-28T04-05-06-007Z",
    );
  });
});

describe("parseArguments", () => {
  it("parses explicit source and destination paths", () => {
    expect(
      parseArguments([
        "--database",
        "data/custom.sqlite",
        "--output",
        "backups/custom.sqlite",
      ]),
    ).toEqual({
      databasePath: "data/custom.sqlite",
      help: false,
      outputPath: "backups/custom.sqlite",
    });
  });

  it("rejects unknown or incomplete arguments", () => {
    expect(() => parseArguments(["--database"])).toThrow("requires a path");
    expect(() => parseArguments(["--other"])).toThrow("Unknown argument");
  });
});
