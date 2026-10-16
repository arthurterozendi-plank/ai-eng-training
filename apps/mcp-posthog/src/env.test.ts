import { afterEach, describe, expect, it } from "vitest";

import { env, EnvValidationError } from "@/env";

describe("env", () => {
  afterEach(() => {
    delete process.env.POSTHOG_API_HOST;
    delete process.env.POSTHOG_PROJECT_ID;
    delete process.env.POSTHOG_PERSONAL_API_KEY;
  });

  it("names the key and says it is not set when it is absent", () => {
    expect(() => env.POSTHOG_PERSONAL_API_KEY).toThrow(EnvValidationError);
    expect(() => env.POSTHOG_PERSONAL_API_KEY).toThrow(/POSTHOG_PERSONAL_API_KEY: is not set/);
    expect(() => env.POSTHOG_API_HOST).toThrow(/POSTHOG_API_HOST: is not set/);
  });

  it("rejects the empty value .env.example ships with", () => {
    process.env.POSTHOG_PROJECT_ID = "";

    expect(() => env.POSTHOG_PROJECT_ID).toThrow(/POSTHOG_PROJECT_ID/);
  });

  it("rejects the project token pasted in place of a personal API key", () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phc_projecttoken";

    expect(() => env.POSTHOG_PERSONAL_API_KEY).toThrow(/not the project token/);
  });

  it("rejects a non-numeric project ID", () => {
    process.env.POSTHOG_PROJECT_ID = "talentscout";

    expect(() => env.POSTHOG_PROJECT_ID).toThrow(EnvValidationError);
  });

  it("rejects a host that is not an http(s) URL", () => {
    process.env.POSTHOG_API_HOST = "us.posthog.com";

    expect(() => env.POSTHOG_API_HOST).toThrow(/POSTHOG_API_HOST/);
  });

  it("reads one key while its siblings are unset", () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_example";

    expect(env.POSTHOG_PERSONAL_API_KEY).toBe("phx_example");
  });

  it("accepts a well-formed host and project ID", () => {
    process.env.POSTHOG_API_HOST = "https://eu.posthog.com";
    process.env.POSTHOG_PROJECT_ID = "12345";

    expect(env.POSTHOG_API_HOST).toBe("https://eu.posthog.com");
    expect(env.POSTHOG_PROJECT_ID).toBe("12345");
  });
});
