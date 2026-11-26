import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type JamifyDb = BetterSQLite3Database<typeof schema>;

let sqliteInstance: Database.Database | null = null;
let dbInstance: JamifyDb | null = null;

export function createDatabase(dbPath: string): {
  sqlite: Database.Database;
  db: JamifyDb;
} {
  if (dbPath !== ":memory:") {
    const dir = path.dirname(path.resolve(dbPath));
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export function getDb(): JamifyDb {
  if (!dbInstance) {
    const dbPath = process.env.DATABASE_PATH ?? "./data/jamify.db";
    const created = createDatabase(dbPath);
    sqliteInstance = created.sqlite;
    dbInstance = created.db;
  }
  return dbInstance;
}

export function checkDatabaseHealth(): boolean {
  getDb();
  if (!sqliteInstance) {
    return false;
  }
  const row = sqliteInstance.prepare("SELECT 1 AS ok").get() as
    | { ok: number }
    | undefined;
  return row?.ok === 1;
}
