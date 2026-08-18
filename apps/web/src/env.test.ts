import { describe, expect, it } from "vitest";

import { env } from "@/env";

describe("env", () => {
  it("reads NODE_ENV with the database connection strings unset", () => {
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_DATABASE_URL;

    expect(env.NODE_ENV).toBe("test");
  });

  it("falls back to the default NEXT_PUBLIC_APP_URL", () => {
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });
});
