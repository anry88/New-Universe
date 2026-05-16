import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface MigrationJournalEntry {
  idx: number;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface MigrationJournal {
  entries: MigrationJournalEntry[];
}

const dbDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(dbDir, "migrations");
const journalPath = path.join(migrationsDir, "meta", "_journal.json");

function readJournal(): MigrationJournal {
  return JSON.parse(fs.readFileSync(journalPath, "utf8")) as MigrationJournal;
}

describe("Drizzle migration journal", () => {
  it("keeps timestamps increasing by migration index", () => {
    const entries = [...readJournal().entries].sort((a, b) => a.idx - b.idx);

    for (let i = 1; i < entries.length; i += 1) {
      const previous = entries[i - 1]!;
      const current = entries[i]!;

      expect(
        current.idx,
        `${current.tag} must have an index greater than ${previous.tag}`,
      ).toBeGreaterThan(previous.idx);
      expect(
        current.when,
        `${current.tag} must have a timestamp greater than ${previous.tag}; Drizzle skips older pending migrations on existing databases.`,
      ).toBeGreaterThan(previous.when);
    }
  });

  it("has a SQL file for every journal entry", () => {
    const missingFiles = readJournal().entries
      .map((entry) => `${entry.tag}.sql`)
      .filter((fileName) => !fs.existsSync(path.join(migrationsDir, fileName)));

    expect(missingFiles).toEqual([]);
  });
});
