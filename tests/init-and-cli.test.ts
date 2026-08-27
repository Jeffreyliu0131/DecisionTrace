import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { main } from "../src/cli/main.js";
import { initializeRepository } from "../src/config/init.js";
import { DecisionTraceError } from "../src/errors.js";
import {
  cleanupRepository,
  copyShadowRepository,
  createGitRepository,
} from "./helpers/repository.js";

const repositories: string[] = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map(cleanupRepository));
});

describe("initialization and CLI routing", () => {
  it("[AC-001] creates only config and contract registry and gives the next command", async () => {
    const root = await createGitRepository();
    repositories.push(root);
    const before = await readFile(path.join(root, "README.md"));
    const result = await initializeRepository(root, { force: false });
    expect(result.created).toEqual([
      ".decisiontrace.yml",
      ".decisiontrace/contracts.yml",
    ]);
    expect(result.nextCommand).toBe("decisiontrace scan");
    expect(await readFile(path.join(root, "README.md"))).toEqual(before);
  });

  it("[AC-002] refuses overwrite and creates recognizable backups only with force", async () => {
    const root = await createGitRepository();
    repositories.push(root);
    await initializeRepository(root, { force: false });
    const configPath = path.join(root, ".decisiontrace.yml");
    await writeFile(configPath, "user-owned-byte-sequence\n");
    const before = await readFile(configPath);
    await expect(
      initializeRepository(root, { force: false }),
    ).rejects.toMatchObject({
      code: "INIT_WOULD_OVERWRITE",
    } satisfies Partial<DecisionTraceError>);
    expect(await readFile(configPath)).toEqual(before);

    const result = await initializeRepository(root, {
      force: true,
      now: new Date("2026-01-02T03:04:05.000Z"),
    });
    expect(result.backups).toContain(
      ".decisiontrace.yml.backup-2026-01-02T03-04-05-000Z",
    );
    expect(
      await readFile(
        path.join(root, ".decisiontrace.yml.backup-2026-01-02T03-04-05-000Z"),
      ),
    ).toEqual(before);
    expect(
      (await readdir(path.join(root, ".decisiontrace"))).length,
    ).toBeGreaterThan(0);
  });

  it("[AC-007] maps an unpaired ref to exit code 2 without guessing", async () => {
    const root = await createGitRepository();
    repositories.push(root);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await main(
      ["node", "decisiontrace", "scan", "--repo", root, "--base", "HEAD"],
      {
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
      },
    );
    expect(code).toBe(2);
    expect(stderr.join("")).toContain("both --base and --head");
    expect(stdout.join("")).not.toContain("complete");
  });

  it("[AC-003] returns exit 2 for an unknown field and never writes a complete report", async () => {
    const root = await copyShadowRepository();
    repositories.push(root);
    const configPath = path.join(root, ".decisiontrace.yml");
    await writeFile(
      configPath,
      `${await readFile(configPath, "utf8")}unexpected_field: true\n`,
    );
    const output = ".decisiontrace/reports/invalid-config";
    const stderr: string[] = [];
    const code = await main(
      ["node", "decisiontrace", "scan", "--repo", root, "--output", output],
      { stdout: () => undefined, stderr: (message) => stderr.push(message) },
    );
    expect(code).toBe(2);
    expect(stderr.join("")).toContain("unexpected_field");
    await expect(
      access(path.join(root, output, "report.json")),
    ).rejects.toThrow();
  });

  it("renders help without treating it as a failure", async () => {
    const output: string[] = [];
    const code = await main(["node", "decisiontrace", "--help"], {
      stdout: (message) => output.push(message),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    expect(output.join("")).toContain("scan [options]");
  });
});
