import {
  appendFile,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoot = path.join(projectRoot, "fixtures/repositories/shadow");
const cliPath = path.join(projectRoot, "dist/cli/main.js");

async function run(executable, args, options = {}) {
  return execFile(executable, args, {
    ...options,
    encoding: "utf8",
    maxBuffer: 1_048_576,
  });
}

async function git(root, args) {
  return run("git", ["-C", root, ...args]);
}

async function decisiontrace(root, args) {
  return run(process.execPath, [cliPath, ...args], { cwd: root });
}

function validateDemoReport(report) {
  if (report.result !== "complete") {
    throw new Error(`Synthetic demo scan was ${report.result}, not complete.`);
  }
  const expectedStatuses = new Map([
    ["D1", "formal"],
    ["D2", "formal"],
    ["D3", "exploratory"],
  ]);
  for (const [driftType, status] of expectedStatuses) {
    if (
      !report.findings.some(
        (finding) =>
          finding.driftType === driftType && finding.status === status,
      )
    ) {
      throw new Error(
        `Synthetic demo report is missing ${status} ${driftType}.`,
      );
    }
  }
}

export async function prepareDemoRepository() {
  const root = await mkdtemp(path.join(tmpdir(), "decisiontrace-demo-")).then(
    realpath,
  );
  try {
    await cp(fixtureRoot, root, { recursive: true });
    await git(root, ["init", "--initial-branch=main"]);
    await mkdir(path.join(root, ".git/decisiontrace-empty-hooks"), {
      recursive: true,
    });
    await git(root, [
      "config",
      "core.hooksPath",
      ".git/decisiontrace-empty-hooks",
    ]);
    await git(root, ["config", "commit.gpgSign", "false"]);
    await git(root, ["config", "user.name", "DecisionTrace Demo"]);
    await git(root, ["config", "user.email", "demo@invalid.example"]);
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "Create synthetic contract baseline"]);
    const base = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();

    await decisiontrace(root, [
      "scan",
      "--repo",
      root,
      "--semantic",
      "off",
      "--output",
      ".decisiontrace/reports/demo-baseline",
    ]);

    await appendFile(
      path.join(root, "src/service.ts"),
      "\n// Synthetic implementation-only change for the DecisionTrace demo.\n",
    );
    await git(root, ["add", "src/service.ts"]);
    await git(root, ["commit", "-m", "Change synthetic implementation"]);
    const head = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();

    await decisiontrace(root, [
      "scan",
      "--repo",
      root,
      "--base",
      base,
      "--head",
      head,
      "--semantic",
      "off",
      "--output",
      ".decisiontrace/reports/demo-current",
    ]);

    const reportPath = path.join(
      root,
      ".decisiontrace/reports/demo-current/report.json",
    );
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    validateDemoReport(report);
    const d3Finding = report.findings.find(
      (finding) =>
        finding.status === "exploratory" && finding.driftType === "D3",
    );
    if (d3Finding === undefined) {
      throw new Error("Synthetic demo has no D3 finding to review.");
    }
    await decisiontrace(root, [
      "review",
      reportPath,
      "--finding",
      d3Finding.id,
      "--decision",
      "intentional_change",
      "--reason",
      "Synthetic demo disposition: inspect the linked requirement, test, and public claim before release.",
      "--reviewer",
      "Demo reviewer",
    ]);

    return {
      root,
      base,
      head,
      reportPath,
      findingCount: report.findings.length,
      reviewedFindingId: d3Finding.id,
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

function parsePort(argv) {
  const index = argv.indexOf("--port");
  if (index === -1) return 4173;
  const value = Number(argv[index + 1]);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error("--port must be an integer from 1 to 65535.");
  }
  return value;
}

async function serveDemo(demo, port) {
  process.stdout.write(
    [
      "DecisionTrace synthetic demo is ready.",
      `Temporary target: ${demo.root}`,
      `Exact diff: ${demo.base.slice(0, 8)}...${demo.head.slice(0, 8)}`,
      `Current findings: ${demo.findingCount}; reviewed: ${demo.reviewedFindingId}`,
      "The UI is loopback-only. Press Ctrl+C to stop and remove the temporary target.",
      "",
    ].join("\n"),
  );
  const child = spawn(
    process.execPath,
    [cliPath, "ui", "--repo", demo.root, "--port", String(port)],
    { cwd: demo.root, stdio: "inherit" },
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    child.kill("SIGINT");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  if (!stopping && result.code !== 0) {
    throw new Error(
      `Review UI exited unexpectedly (${result.code ?? result.signal ?? "unknown"}).`,
    );
  }
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const port = parsePort(process.argv.slice(2));
  const demo = await prepareDemoRepository();
  try {
    if (checkOnly) {
      process.stdout.write(
        `Demo check passed: ${demo.findingCount} findings, ${demo.reviewedFindingId} reviewed.\n`,
      );
      return;
    }
    await serveDemo(demo, port);
  } finally {
    await rm(demo.root, { recursive: true, force: true });
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
