import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";

import { DecisionTraceError, errorMessage } from "../errors.js";
import { toPosixPath } from "../utils/paths.js";

const execFileAsync = promisify(execFile);

export type GitRevision = {
  root: string;
  mode: "full" | "diff";
  base?: string;
  head: string;
  requestedBase?: string;
  requestedHead?: string;
  changedPaths: string[];
};

async function git(root: string, arguments_: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", arguments_, {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout.trim();
  } catch (error) {
    throw new DecisionTraceError(
      `Git command failed (${arguments_.join(" ")}): ${errorMessage(error)}`,
      { code: "GIT_COMMAND_FAILED" },
    );
  }
}

export async function findRepositoryRoot(start: string): Promise<string> {
  const candidate = await realpath(start).catch(() => start);
  const root = await git(candidate, ["rev-parse", "--show-toplevel"]);
  return realpath(root);
}

async function resolveCommit(root: string, reference: string): Promise<string> {
  try {
    return await git(root, ["rev-parse", "--verify", `${reference}^{commit}`]);
  } catch (error) {
    throw new DecisionTraceError(
      `Cannot resolve Git ref '${reference}'. The clone may be shallow; fetch the required history or provide refs available locally. ${errorMessage(error)}`,
      { code: "GIT_REF_UNAVAILABLE" },
    );
  }
}

export async function resolveRevision(
  start: string,
  base?: string,
  head?: string,
): Promise<GitRevision> {
  if ((base === undefined) !== (head === undefined)) {
    throw new DecisionTraceError(
      "Diff scan requires both --base and --head; DecisionTrace will not guess a missing ref.",
      { code: "GIT_REFS_MUST_BE_PAIRED" },
    );
  }

  const root = await findRepositoryRoot(start);
  if (base === undefined || head === undefined) {
    return {
      root,
      mode: "full",
      head: await resolveCommit(root, "HEAD"),
      changedPaths: [],
    };
  }

  const resolvedBase = await resolveCommit(root, base);
  const resolvedHead = await resolveCommit(root, head);
  const checkedOutHead = await resolveCommit(root, "HEAD");
  if (resolvedHead !== checkedOutHead) {
    throw new DecisionTraceError(
      `Requested head '${head}' resolves to ${resolvedHead}, but the working tree is checked out at ${checkedOutHead}. Check out the requested head before scanning so artifact bytes match the reported revision.`,
      { code: "GIT_HEAD_NOT_CHECKED_OUT" },
    );
  }
  let changedOutput: string;
  try {
    changedOutput = await git(root, [
      "diff",
      "--name-only",
      "--diff-filter=ACDMRTUXB",
      `${resolvedBase}...${resolvedHead}`,
      "--",
    ]);
  } catch (error) {
    throw new DecisionTraceError(
      `Cannot calculate ${base}...${head}. Ensure both refs share available history. ${errorMessage(error)}`,
      { code: "GIT_DIFF_UNAVAILABLE" },
    );
  }

  return {
    root,
    mode: "diff",
    base: resolvedBase,
    head: resolvedHead,
    requestedBase: base,
    requestedHead: head,
    changedPaths: changedOutput
      ? changedOutput.split("\n").map((item) => toPosixPath(item))
      : [],
  };
}

export async function workingTreeStatus(root: string): Promise<string[]> {
  const output = await git(root, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ".",
    ":(exclude).decisiontrace/reports/**",
    ":(exclude).decisiontrace/cache/**",
    ":(exclude).decisiontrace/reviews.jsonl",
    ":(exclude).decisiontrace/semantic-reviews.jsonl",
  ]);
  return output ? output.split("\n") : [];
}
