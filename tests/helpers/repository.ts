import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");

export async function git(root: string, arguments_: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
    },
  });
  return stdout.trim();
}

export async function writeRepositoryFiles(
  root: string,
  files: Record<string, string | Uint8Array>,
): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([relative, content]) => {
      const target = path.join(root, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }),
  );
}

export async function createGitRepository(
  files: Record<string, string | Uint8Array> = { "README.md": "# Fixture\n" },
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "decisiontrace-test-"));
  await writeRepositoryFiles(root, files);
  await git(root, ["init", "--initial-branch=main"]);
  await git(root, ["config", "user.name", "DecisionTrace Tests"]);
  await git(root, ["config", "user.email", "tests@invalid.example"]);
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "Create fixture"]);
  return root;
}

export async function copyShadowRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "decisiontrace-shadow-"));
  await cp(path.join(PROJECT_ROOT, "fixtures/repositories/shadow"), root, {
    recursive: true,
  });
  await git(root, ["init", "--initial-branch=main"]);
  await git(root, ["config", "user.name", "DecisionTrace Tests"]);
  await git(root, ["config", "user.email", "tests@invalid.example"]);
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "Create synthetic target"]);
  return root;
}

export async function cleanupRepository(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}
