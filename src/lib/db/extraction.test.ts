import { describe, expect, it } from "vitest";

import { extractionPayloadSchema } from "@/lib/db/extraction";

const validPayload = {
  schemaVersion: 1,
  model: "claude-opus-4",
  extractedAt: "2026-08-18T10:04:00.000Z",
  fields: {
    candidateEmail: { value: "ada@example.com", confidence: 0.97, source: "resume.pdf#page=1" },
    yearsExperience: { value: 7, confidence: 0.58, source: "resume.pdf#page=2" },
  },
};

describe("extractionPayloadSchema", () => {
  it("accepts a well-formed envelope", () => {
    expect(extractionPayloadSchema.safeParse(validPayload).success).toBe(true);
  });

  it("rejects a field confidence above 1", () => {
    const result = extractionPayloadSchema.safeParse({
      ...validPayload,
      fields: {
        ...validPayload.fields,
        yearsExperience: { ...validPayload.fields.yearsExperience, confidence: 1.4 },
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a field confidence below 0", () => {
    const result = extractionPayloadSchema.safeParse({
      ...validPayload,
      fields: {
        ...validPayload.fields,
        yearsExperience: { ...validPayload.fields.yearsExperience, confidence: -0.1 },
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing fields", () => {
    const { schemaVersion, model, extractedAt } = validPayload;
    const result = extractionPayloadSchema.safeParse({ schemaVersion, model, extractedAt });

    expect(result.success).toBe(false);
  });

  it("rejects a schemaVersion other than the current one", () => {
    const result = extractionPayloadSchema.safeParse({ ...validPayload, schemaVersion: 2 });

    expect(result.success).toBe(false);
  });

  it("rejects a field missing its source", () => {
    const result = extractionPayloadSchema.safeParse({
      ...validPayload,
      fields: {
        candidateEmail: { value: "ada@example.com", confidence: 0.97 },
      },
    });

    expect(result.success).toBe(false);
  });
});
