import { describe, expect, it } from "vitest";
import { createDatabase } from "./index";

describe("SQLite database setup", () => {
  it("opens an in-memory SQLite database with foreign keys enabled", () => {
    const { sqlite } = createDatabase(":memory:");
    try {
      const health = sqlite.prepare("SELECT 1 AS ok").get() as { ok: number };
      const fk = sqlite.pragma("foreign_keys", { simple: true });

      expect(health.ok).toBe(1);
      expect(fk).toBe(1);
    } finally {
      sqlite.close();
    }
  });
});
