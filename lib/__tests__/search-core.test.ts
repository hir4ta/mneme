import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { searchKnowledge } from "../search-core";

describe("search-core", () => {
  let tmpDir: string;
  let mnemeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mneme-search-core-"));
    mnemeDir = path.join(tmpDir, ".mneme");
    fs.mkdirSync(path.join(mnemeDir, "sessions", "2026", "02"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(mnemeDir, "units"), { recursive: true });
    fs.writeFileSync(
      path.join(mnemeDir, "tags.json"),
      JSON.stringify(
        {
          tags: [
            {
              id: "auth",
              label: "Auth",
              aliases: ["authentication", "login"],
            },
          ],
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(mnemeDir, "sessions", "2026", "02", "sess1234.json"),
      JSON.stringify(
        {
          id: "sess1234",
          title: "Implement authentication flow",
          tags: ["auth"],
          summary: {
            description: "added login and token refresh",
          },
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(mnemeDir, "units", "units.json"),
      JSON.stringify(
        {
          items: [
            {
              id: "unit-auth-001",
              type: "rule",
              sourceType: "rule",
              sourceId: "dev-rules:jwt-auth",
              status: "approved",
              title: "JWT auth guardrails",
              summary: "Use stateless JWT tokens and validate key format.",
              tags: ["auth"],
            },
          ],
        },
        null,
        2,
      ),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("searches across sessions/approved-units with alias expansion", () => {
    const results = searchKnowledge({
      query: "authentication",
      mnemeDir,
      projectPath: tmpDir,
      database: null,
      limit: 10,
    });

    const types = new Set(results.map((result) => result.type));
    expect(types.has("session")).toBe(true);
    expect(types.has("unit")).toBe(true);
  });

  it("uses interaction fallback query with OR LIKE clauses", () => {
    const preparedSql: string[] = [];
    const fakeDb = {
      prepare: (sql: string) => {
        preparedSql.push(sql);
        if (sql.includes("interactions_fts")) {
          return {
            all: () => {
              throw new Error("fts unavailable");
            },
          };
        }
        return {
          all: () => [
            {
              session_id: "sess1234",
              snippet: "login success",
              timestamp: "2026-02-08T00:00:00Z",
            },
          ],
        };
      },
    };

    const results = searchKnowledge({
      query: "login jwt",
      mnemeDir,
      projectPath: tmpDir,
      database: fakeDb,
      types: ["interaction"],
      limit: 5,
    });

    expect(results.length).toBe(1);
    expect(preparedSql.some((sql) => sql.includes(" OR "))).toBe(true);
  });
});
