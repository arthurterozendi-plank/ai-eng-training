import { describe, expect, it } from "vitest";

import { GET, type StatusPayload } from "@/app/api/status/route";

describe("GET /api/status", () => {
  it("reports ok with liveness details", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = (await response.json()) as StatusPayload;

    expect(body.status).toBe("ok");
    expect(body.environment).toBe("test");
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(new Date(body.timestamp).toString()).not.toBe("Invalid Date");
  });
});
