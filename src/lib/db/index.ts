import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import path from "path";

const DB_PATH = path.join(process.cwd(), "lead-finder.db");

let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export type Db = ReturnType<typeof getDb>;

export function getAgencyType(): string {
  const db = getDb();
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, "agency_type")).get();
  return row?.value || "general";
}
