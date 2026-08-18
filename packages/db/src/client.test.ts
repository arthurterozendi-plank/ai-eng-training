import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CONNECTION_STRING = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("client", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = CONNECTION_STRING;
    vi.resetModules();
    delete (globalThis as { talentscoutSql?: unknown }).talentscoutSql;
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete (globalThis as { talentscoutSql?: unknown }).talentscoutSql;
  });

  it("connects through DATABASE_URL, not DIRECT_DATABASE_URL", async () => {
    delete process.env.DIRECT_DATABASE_URL;

    await expect(import("@/client")).resolves.toBeDefined();
  });

  it("reuses one pool across module re-evaluations", async () => {
    const { db: first } = await import("@/client");
    const pool = (globalThis as { talentscoutSql?: unknown }).talentscoutSql;

    vi.resetModules();
    const { db: second } = await import("@/client");

    expect(pool).toBeDefined();
    expect((globalThis as { talentscoutSql?: unknown }).talentscoutSql).toBe(pool);
    expect(second).not.toBe(first);
  });

  it("exposes every table to the relational query builder", async () => {
    const { db } = await import("@/client");

    expect(Object.keys(db.query)).toEqual(
      expect.arrayContaining([
        "jobs",
        "candidates",
        "applications",
        "applicationStageTransitions",
        "interviews",
        "notes",
        "pipelineStages",
      ]),
    );
  });

  it("fails loudly when DATABASE_URL is malformed", async () => {
    process.env.DATABASE_URL = "not-a-url";

    await expect(import("@/client")).rejects.toThrow(/DATABASE_URL/);
  });
});
