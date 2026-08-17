import { describe, expect, it } from "vitest";

import { formatCurrency } from "@/lib/format";

describe("formatCurrency", () => {
  it("formats USD by default", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  it("honours an explicit currency and locale", () => {
    expect(formatCurrency(10, { currency: "EUR", locale: "de-DE" })).toContain("10,00");
  });
});
