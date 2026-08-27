import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { sha256 } from "../src/utils/hash.js";
import { PROJECT_ROOT } from "./helpers/repository.js";

const assetManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedOn: z.iso.date(),
    source: z.literal("npm run demo"),
    capture: z.string().min(1),
    syntheticOnly: z.literal(true),
    assets: z
      .array(
        z
          .object({
            path: z.string().regex(/^review-[a-z-]+\.jpg$/u),
            route: z.string().min(1),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            byteSize: z.number().int().positive(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/u),
          })
          .strict(),
      )
      .length(3),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .strict();

function jpegDimensions(data: Buffer): { width: number; height: number } {
  if (data[0] !== 0xff || data[1] !== 0xd8) {
    throw new Error("Demo asset is not a JPEG file.");
  }
  let offset = 2;
  while (offset + 8 < data.length) {
    if (data[offset] !== 0xff) {
      throw new Error("Invalid JPEG marker boundary.");
    }
    while (data[offset] === 0xff) offset += 1;
    const marker = data[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    const segmentLength = data.readUInt16BE(offset);
    const startOfFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (startOfFrame) {
      return {
        height: data.readUInt16BE(offset + 3),
        width: data.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  throw new Error("JPEG dimensions were not found.");
}

describe("recruiter demo assets", () => {
  it("[AC-057] keeps screenshots hashed, synthetic, and linked from README", async () => {
    const assetRoot = path.join(PROJECT_ROOT, "docs/assets");
    const manifest = assetManifestSchema.parse(
      JSON.parse(await readFile(path.join(assetRoot, "manifest.json"), "utf8")),
    );
    const readme = await readFile(path.join(PROJECT_ROOT, "README.md"), "utf8");

    for (const asset of manifest.assets) {
      const bytes = await readFile(path.join(assetRoot, asset.path));
      expect(bytes.byteLength).toBe(asset.byteSize);
      expect(sha256(bytes)).toBe(asset.sha256);
      expect(jpegDimensions(bytes)).toEqual({
        width: asset.width,
        height: asset.height,
      });
      expect(bytes.includes(Buffer.from("Exif\0\0", "binary"))).toBe(false);
      expect(readme).toContain(`docs/assets/${asset.path}`);
    }
    expect(manifest.capture).toContain("no image-generation");
    expect(readme).toContain("not real-repository precision");
    expect(readme).toContain("No `LICENSE` has been selected");
  });

  it("[AC-056] keeps the recruiter path runnable, source-backed, and immutable where needed", async () => {
    const readme = await readFile(path.join(PROJECT_ROOT, "README.md"), "utf8");
    expect(readme).toContain("actions/workflows/ci.yml/badge.svg?branch=main");
    expect(readme).toContain(
      "actions/workflows/shadow.yml/badge.svg?branch=main",
    );
    expect(readme).toContain("npm run demo");
    expect(readme).toContain("examples/dogfood/thinkbud-ai/sample/report.md");
    expect(readme).toMatch(/uses: Jeffreyliu0131\/DecisionTrace@[a-f0-9]{40}/u);
    expect(readme).toContain("fetch-depth: 0");
    expect(readme).toContain(
      "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
    );
    expect(readme).not.toMatch(/actions\/(?:checkout|setup-node)@v\d/u);
    expect(readme).toContain(
      "%% MEANING: Shows the read-only product path and the optional semantic trust boundary.",
    );
    expect(readme).toContain("flowchart LR");
    expect(readme).toContain("EV-029");
    expect(readme).not.toContain("validated product-market fit");

    const localTargets = [...readme.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)]
      .map((match) => match[1]!)
      .filter((target) => !/^https?:\/\//u.test(target))
      .map((target) => target.split("#", 1)[0]!)
      .filter(Boolean);
    await Promise.all(
      localTargets.map((target) => access(path.join(PROJECT_ROOT, target))),
    );
  });
});
