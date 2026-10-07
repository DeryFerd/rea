import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createWebTextArtifact,
  webTextArtifactSchema,
} from "./webContentArtifact.js";

describe("webTextArtifactSchema size bound", () => {
  it("accepts an ordinary artifact", () => {
    const artifact = createWebTextArtifact("hello world", "text/plain");
    expect(webTextArtifactSchema.safeParse(artifact).success).toBe(true);
  });

  it("accepts a source-sized artifact within the advertised budget", () => {
    const artifact = createWebTextArtifact(
      "x".repeat(1024 * 1024),
      "text/javascript",
    );
    expect(webTextArtifactSchema.safeParse(artifact).success).toBe(true);
  });

  it("rejects text past the 16 MiB source budget before hashing", () => {
    const text = "a".repeat(16 * 1024 * 1024 + 1);
    const result = webTextArtifactSchema.safeParse({
      sha256: createHash("sha256").update(text).digest("hex"),
      bytes: Buffer.byteLength(text),
      media_type: "text/plain",
      charset: "utf-8",
      text,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((issue) => issue.message.includes("16 MiB")),
    ).toBe(true);
  });
});
