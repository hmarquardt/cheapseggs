import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/**
 * Minimal D1-compatible adapter over Node's built-in SQLite, for integration tests.
 *
 * Tests therefore run the same reviewed migrations, seeds and SQL statements as
 * production instead of mocking the data layer. This shim is test-only: it is never
 * imported by the Worker bundle.
 */
export interface TestDatabase {
  db: D1Database;
  raw: DatabaseSync;
}

type Bindable = string | number | null | Uint8Array;

interface Meta {
  duration: number;
  size_after: number;
  rows_read: number;
  rows_written: number;
  last_row_id: number;
  changed_db: boolean;
  changes: number;
}

function meta(changes: number, lastRowId = 0): Meta {
  return {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: changes,
    last_row_id: lastRowId,
    changed_db: changes > 0,
    changes,
  };
}

class TestStatement {
  constructor(
    private readonly raw: DatabaseSync,
    private readonly sql: string,
    private readonly params: Bindable[] = [],
  ) {}

  bind(...values: Bindable[]): TestStatement {
    return new TestStatement(this.raw, this.sql, values);
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.raw.prepare(this.sql).get(...this.params) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    if (column) return (row[column] ?? null) as T | null;
    return row as T;
  }

  async all<T = Record<string, unknown>>() {
    const results = this.raw.prepare(this.sql).all(...this.params) as T[];
    return {
      success: true as const,
      meta: meta(Number((this.raw.prepare("SELECT changes() AS n").get() as { n: number }).n)),
      results,
    };
  }

  async run<T = Record<string, unknown>>() {
    const info = this.raw.prepare(this.sql).run(...this.params);
    return {
      success: true as const,
      meta: meta(Number(info.changes), Number(info.lastInsertRowid)),
      results: [] as T[],
    };
  }
}

class TestD1 {
  constructor(private readonly raw: DatabaseSync) {}

  prepare(sql: string) {
    return new TestStatement(this.raw, sql);
  }

  async batch<T = Record<string, unknown>>(statements: TestStatement[]) {
    const results = [];
    this.raw.exec("BEGIN");
    try {
      for (const statement of statements) results.push(await statement.all<T>());
      this.raw.exec("COMMIT");
      return results;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(sql: string) {
    this.raw.exec(sql);
    return { count: 1, duration: 0 };
  }
}

export function createTestDatabase(): TestDatabase {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync("migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    raw.exec(readFileSync(`migrations/${file}`, "utf8"));
  }
  const seed = readFileSync("seeds/local.sql", "utf8");
  raw.exec(seed);
  raw.exec(seed);
  return { db: new TestD1(raw) as unknown as D1Database, raw };
}

export function seedCount(raw: DatabaseSync, table: string): number {
  const row = raw.prepare(`SELECT count(*) AS total FROM ${table}`).get() as { total: number };
  return row.total;
}

export const TEST_ENV = { DB: undefined as unknown as D1Database, APP_ENV: "local" };

/** Test-only reopening of a captured SQLite snapshot, preserving restored grants. */
export function openTestSnapshot(path: string): TestDatabase {
  const raw = new DatabaseSync(path);
  raw.exec("PRAGMA foreign_keys = ON");
  return { db: new TestD1(raw) as unknown as D1Database, raw };
}
