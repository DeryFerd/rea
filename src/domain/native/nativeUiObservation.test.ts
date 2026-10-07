import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { nativeUiSnapshotSchema } from "./nativeUiObservation.js";

// 1x1 RGBA PNG as produced by the native screenshot helper.
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const minimalSnapshot = (screenshot: unknown) => ({
  window: {
    pid: 1,
    window_id: 2,
    executable: "/Applications/Example.app",
    launch_time: 0,
    title: "Example",
  },
  nodes: [],
  truncated: false,
  screenshot,
  gaps: [],
});

describe("nativeUiSnapshotSchema screenshot bound", () => {
  it("rejects screenshot base64 past the 64 MiB output budget before decoding", () => {
    const result = nativeUiSnapshotSchema.safeParse(
      minimalSnapshot({
        mime_type: "image/png",
        base64: "A".repeat(64 * 1024 * 1024 + 4),
        sha256: "a".repeat(64),
        width: 1,
        height: 1,
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((issue) => issue.message.includes("64 MiB")),
    ).toBe(true);
  });

  it("accepts a helper-shaped screenshot within the output budget", () => {
    const png = Buffer.from(PNG_1X1, "base64");
    const result = nativeUiSnapshotSchema.safeParse(
      minimalSnapshot({
        mime_type: "image/png",
        base64: PNG_1X1,
        sha256: createHash("sha256").update(png).digest("hex"),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a snapshot without a screenshot", () => {
    expect(
      nativeUiSnapshotSchema.safeParse(minimalSnapshot(null)).success,
    ).toBe(true);
  });
});
