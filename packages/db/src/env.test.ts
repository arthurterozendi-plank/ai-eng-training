import { afterEach, describe, expect, it } from "vitest";

import { env, EnvValidationError } from "@/env";

describe("env", () => {
  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_DATABASE_URL;
  });

  it("rejects a malformed DATABASE_URL with a named error", () => {
    process.env.DATABASE_URL = "not-a-url";

    expect(() => env.DATABASE_URL).toThrow(EnvValidationError);
    expect(() => env.DATABASE_URL).toThrow(/DATABASE_URL/);
  });

  it("rejects a malformed DIRECT_DATABASE_URL with a named error", () => {
    process.env.DIRECT_DATABASE_URL = "not-a-url";

    expect(() => env.DIRECT_DATABASE_URL).toThrow(EnvValidationError);
    expect(() => env.DIRECT_DATABASE_URL).toThrow(/DIRECT_DATABASE_URL/);
  });

  it("rejects a non-Postgres protocol", () => {
    process.env.DATABASE_URL = "http://postgres:postgres@127.0.0.1:54322/postgres";

    expect(() => env.DATABASE_URL).toThrow(EnvValidationError);
  });

  it("accepts a well-formed Postgres connection string", () => {
    const url = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    process.env.DATABASE_URL = url;

    expect(env.DATABASE_URL).toBe(url);
  });

  it("reads DIRECT_DATABASE_URL with DATABASE_URL unset", () => {
    const url = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
    delete process.env.DATABASE_URL;
    process.env.DIRECT_DATABASE_URL = url;

    expect(env.DIRECT_DATABASE_URL).toBe(url);
  });
});
