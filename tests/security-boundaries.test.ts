import {
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfiguration } from "../src/config/loader.js";
import { resolveRevision } from "../src/git/adapter.js";
import { scanRepository } from "../src/scan/service.js";
import {
  cleanupRepository,
  copyShadowRepository,
  git,
} from "./helpers/repository.js";

const cleanupTargets: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupTargets.splice(0).map(cleanupRepository));
});

describe("repository trust boundaries", () => {
  it("[AC-003] rejects a configured path that escapes the repository", async () => {
    const root = await copyShadowRepository();
    cleanupTargets.push(root);
    const configPath = path.join(root, ".decisiontrace.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      config.replace(
        'contracts: ".decisiontrace/contracts.yml"',
        'contracts: "../outside/contracts.yml"',
      ),
    );
    await expect(loadConfiguration(root)).rejects.toMatchObject({
      code: "PATH_OUTSIDE_REPOSITORY",
    });
  });

  it("[AC-003, AC-009] rejects a contract-registry symlink that escapes the repository", async () => {
    const root = await copyShadowRepository();
    cleanupTargets.push(root);
    const outside = path.join(
      root,
      "..",
      `${path.basename(root)}-contracts.yml`,
    );
    cleanupTargets.push(outside);
    await writeFile(
      outside,
      "version: 1\ncontracts: []\nprivate_marker: do-not-read\n",
    );
    const registryPath = path.join(root, ".decisiontrace/contracts.yml");
    await rm(registryPath);
    await symlink(outside, registryPath);
    await expect(loadConfiguration(root)).rejects.toMatchObject({
      code: "PATH_OUTSIDE_REPOSITORY",
    });
  });

  it("[AC-009] refuses to write reports through a symlinked output directory", async () => {
    const root = await copyShadowRepository();
    cleanupTargets.push(root);
    const outside = path.join(root, "..", `${path.basename(root)}-reports`);
    cleanupTargets.push(outside);
    await mkdir(outside);
    await symlink(outside, path.join(root, ".decisiontrace/reports"));
    await expect(
      scanRepository({
        repo: root,
        semanticMode: "off",
        output: ".decisiontrace/reports/escape",
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_WRITE_SYMLINK" });
    expect(await readdir(outside)).toEqual([]);
  });

  it("[AC-006] refuses a head ref that is not the checked-out artifact revision", async () => {
    const root = await copyShadowRepository();
    cleanupTargets.push(root);
    const first = await git(root, ["rev-parse", "HEAD"]);
    const servicePath = path.join(root, "src/service.ts");
    await writeFile(
      servicePath,
      `${await readFile(servicePath, "utf8")}\n// v2\n`,
    );
    await git(root, ["add", "src/service.ts"]);
    await git(root, ["commit", "-m", "Create second revision"]);
    await expect(resolveRevision(root, first, first)).rejects.toMatchObject({
      code: "GIT_HEAD_NOT_CHECKED_OUT",
    });
  });
});
