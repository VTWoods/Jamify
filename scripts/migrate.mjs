import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dbPath = process.env.DATABASE_PATH ?? "./data/jamify.db";
const migrationsFolder = path.resolve(process.cwd(), "drizzle");

if (dbPath !== ":memory:") {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
}

if (!fs.existsSync(migrationsFolder)) {
  console.log("No drizzle migrations directory found; skipping migration.");
  process.exit(0);
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);
migrate(db, { migrationsFolder });
sqlite.close();

console.log(`Database migrations applied to ${dbPath}`);
