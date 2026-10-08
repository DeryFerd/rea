import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { TextReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";

import { createTestTempDirectory } from "../../tests/fixtures/temporaryDirectory.js";

import { ArtifactReaderFailure } from "./ArtifactReader.js";
import { ZipArtifactReader } from "./ZipArtifactReader.js";

const buildZip = async (
  directory: string,
  entries: readonly (readonly [string, string])[],
): Promise<string> => {
  const path = join(directory, "fixture.zip");
  const writer = new ZipWriter(new Uint8ArrayWriter());
  for (const [name, content] of entries)
    await writer.add(name, new TextReader(content));
  await writeFile(path, await writer.close());
  return path;
};

const openSingleEntry = async (
  reader: ZipArtifactReader,
  path: string,
): Promise<Awaited<ReturnType<typeof reader.open>>> => {
  let opened: Awaited<ReturnType<typeof reader.open>> | undefined;
  for await (const entry of reader.entries()) {
    if (entry.kind !== "file") continue;
    opened = await reader.open(entry);
    break;
  }
  if (opened === undefined) throw new Error(`No file entry in ${path}`);
  return opened;
};

const collect = async (
  stream: Awaited<ReturnType<ZipArtifactReader["open"]>>,
) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
};

describe("ZipArtifactReader entry budget", () => {
  it("rejects extracting an entry past the 64 MiB per-entry budget", async () => {
    const directory = await createTestTempDirectory("rea-zip-entry-budget-");
    const path = await buildZip(directory, [
      ["bomb.txt", "0".repeat(64 * 1024 * 1024 + 1)],
    ]);
    const reader = new ZipArtifactReader(path, "zip");
    try {
      for await (const entry of reader.entries()) {
        if (entry.kind !== "file") continue;
        expect(entry.declaredSize).toBe(64 * 1024 * 1024 + 1);
        await expect(reader.open(entry)).rejects.toMatchObject({
          name: "ArtifactReaderFailure",
          reason: "limit",
        });
        break;
      }
    } finally {
      await reader.close();
    }
  });

  it("still extracts an entry within the budget", async () => {
    const directory = await createTestTempDirectory("rea-zip-entry-small-");
    const path = await buildZip(directory, [["payload.txt", "within budget"]]);
    const reader = new ZipArtifactReader(path, "zip");
    try {
      const stream = await openSingleEntry(reader, path);
      expect(await collect(stream)).toBe("within budget");
    } finally {
      await reader.close();
    }
  });

  it("keeps inventory observation for an over-budget entry", async () => {
    const directory = await createTestTempDirectory("rea-zip-entry-observe-");
    const path = await buildZip(directory, [
      ["huge.bin", "z".repeat(64 * 1024 * 1024 + 1)],
    ]);
    const reader = new ZipArtifactReader(path, "zip");
    try {
      let observed = 0;
      for await (const entry of reader.entries()) {
        if (entry.kind !== "file") continue;
        observed += 1;
        expect(entry.declaredSize).toBe(64 * 1024 * 1024 + 1);
      }
      expect(observed).toBe(1);
    } finally {
      await reader.close();
    }
  });
});
