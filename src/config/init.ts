import { constants } from "node:fs";
import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { DecisionTraceError } from "../errors.js";
import { findRepositoryRoot } from "../git/adapter.js";
import { writeFileAtomic } from "../utils/files.js";
import { assertSafeWritePath } from "../utils/paths.js";
import { DEFAULT_CONFIG, DEFAULT_CONTRACTS } from "./defaults.js";

async function exists(target: string): Promise<boolean> {
  return access(target).then(
    () => true,
    () => false,
  );
}

function backupSuffix(now: Date): string {
  return now.toISOString().replaceAll(/[:.]/gu, "-");
}

export type InitResult = {
  root: string;
  created: string[];
  backups: string[];
  nextCommand: string;
};

export async function initializeRepository(
  start: string,
  options: { force: boolean; now?: Date },
): Promise<InitResult> {
  const root = await findRepositoryRoot(start);
  const configPath = path.join(root, ".decisiontrace.yml");
  const contractDirectory = path.join(root, ".decisiontrace");
  const contractPath = path.join(contractDirectory, "contracts.yml");
  const collisions = (
    await Promise.all(
      [configPath, contractPath].map(async (candidate) => ({
        candidate,
        exists: await exists(candidate),
      })),
    )
  )
    .filter((item) => item.exists)
    .map((item) => item.candidate);

  if (collisions.length > 0 && !options.force) {
    throw new DecisionTraceError(
      `Initialization refused because files already exist: ${collisions.map((item) => path.relative(root, item)).join(", ")}. Use --force to replace them with backups.`,
      { code: "INIT_WOULD_OVERWRITE" },
    );
  }

  await assertSafeWritePath(root, configPath, "config");
  await assertSafeWritePath(root, contractPath, "contracts");

  const backups: string[] = [];
  if (options.force) {
    const suffix = backupSuffix(options.now ?? new Date());
    for (const collision of collisions) {
      const backup = `${collision}.backup-${suffix}`;
      await assertSafeWritePath(root, backup, "backup");
      await copyFile(collision, backup, constants.COPYFILE_EXCL);
      backups.push(path.relative(root, backup));
    }
  }

  await mkdir(contractDirectory, { recursive: true });
  await writeFileAtomic(configPath, DEFAULT_CONFIG);
  await writeFileAtomic(contractPath, DEFAULT_CONTRACTS);
  return {
    root,
    created: [".decisiontrace.yml", ".decisiontrace/contracts.yml"],
    backups,
    nextCommand: "decisiontrace scan",
  };
}
