#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Command, CommanderError, Option } from "commander";

import { initializeRepository } from "../config/init.js";
import { DecisionTraceError, errorMessage } from "../errors.js";
import { runEvaluation } from "../eval/service.js";
import { findRepositoryRoot } from "../git/adapter.js";
import { recordReview } from "../review/service.js";
import { recordSemanticReview } from "../review/semantic.js";
import {
  reviewDecisionSchema,
  semanticReviewDecisionSchema,
  type ReviewDecision,
  type SemanticReviewDecision,
} from "../schemas/index.js";
import { scanRepository } from "../scan/service.js";
import type { SemanticAnalyzer } from "../semantic/analyzer.js";
import { HttpJsonByokSemanticAnalyzer } from "../semantic/byok.js";
import { ReplaySemanticAnalyzer } from "../semantic/fake.js";
import { startUiServer } from "../ui/server.js";
import {
  assertSafeWritePath,
  resolveExistingInsideRoot,
  resolveInsideRoot,
} from "../utils/paths.js";
import { TOOL_NAME, TOOL_VERSION } from "../version.js";

export type CliIo = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

const DEFAULT_IO: CliIo = {
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message),
};

export async function main(
  argv: string[] = process.argv,
  io: CliIo = DEFAULT_IO,
): Promise<number> {
  let commandExitCode: 0 | 1 = 0;
  const program = new Command();
  program
    .name("decisiontrace")
    .description(
      "Trace product contracts and detect deterministic drift without modifying the target repository.",
    )
    .version(TOOL_VERSION)
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: io.stdout,
      writeErr: io.stderr,
    });

  program
    .command("init")
    .description(
      "Create a minimal local-only configuration and contract registry.",
    )
    .option(
      "--force",
      "replace existing init files after writing backups",
      false,
    )
    .action(async (options: { force: boolean }) => {
      const result = await initializeRepository(process.cwd(), {
        force: options.force,
      });
      io.stdout(`Created: ${result.created.join(", ")}\n`);
      if (result.backups.length > 0) {
        io.stdout(`Backups: ${result.backups.join(", ")}\n`);
      }
      io.stdout(`Next: ${result.nextCommand}\n`);
    });

  program
    .command("scan")
    .description("Run a full or paired-ref diff scan.")
    .option("--repo <path>", "target repository", process.cwd())
    .option("--base <git-ref>", "diff base ref")
    .option("--head <git-ref>", "diff head ref")
    .addOption(
      new Option("--format <format>", "report format")
        .choices(["json", "markdown", "html", "all"])
        .default("all"),
    )
    .option("--output <dir>", "report output directory")
    .addOption(
      new Option("--semantic <mode>", "semantic candidate mode")
        .choices(["off", "local", "cloud"])
        .default("off"),
    )
    .option(
      "--semantic-replay <json>",
      "offline provider response JSON; never calls a model",
    )
    .option(
      "--semantic-byok <json>",
      "explicit local/cloud HTTP-JSON BYOK adapter config",
    )
    .option(
      "--semantic-input-output <json>",
      "write the bounded, redacted provider input for offline analysis",
    )
    .option(
      "--semantic-timeout-ms <milliseconds>",
      "provider timeout in milliseconds",
      "5000",
    )
    .action(
      async (options: {
        repo: string;
        base?: string;
        head?: string;
        format: "json" | "markdown" | "html" | "all";
        output?: string;
        semantic: "off" | "local" | "cloud";
        semanticReplay?: string;
        semanticByok?: string;
        semanticInputOutput?: string;
        semanticTimeoutMs: string;
      }) => {
        if ((options.base === undefined) !== (options.head === undefined)) {
          throw new DecisionTraceError(
            "Diff scan requires both --base and --head; DecisionTrace will not guess a missing ref.",
            { code: "GIT_REFS_MUST_BE_PAIRED" },
          );
        }
        if (
          options.semantic === "off" &&
          (options.semanticReplay !== undefined ||
            options.semanticByok !== undefined ||
            options.semanticInputOutput !== undefined)
        ) {
          throw new DecisionTraceError(
            "--semantic-replay, --semantic-byok, and --semantic-input-output require --semantic local or --semantic cloud.",
            { code: "SEMANTIC_MODE_REQUIRED" },
          );
        }
        if (
          options.semanticReplay !== undefined &&
          options.semanticByok !== undefined
        ) {
          throw new DecisionTraceError(
            "--semantic-replay and --semantic-byok are mutually exclusive.",
            { code: "SEMANTIC_PROVIDER_CONFLICT" },
          );
        }
        const semanticTimeoutMilliseconds = Number(options.semanticTimeoutMs);
        if (
          !Number.isSafeInteger(semanticTimeoutMilliseconds) ||
          semanticTimeoutMilliseconds <= 0 ||
          semanticTimeoutMilliseconds > 600_000
        ) {
          throw new DecisionTraceError(
            "--semantic-timeout-ms must be an integer from 1 to 600000.",
            { code: "SEMANTIC_TIMEOUT_INVALID" },
          );
        }
        const requestedRepository = path.resolve(options.repo);
        const repositoryRoot = await findRepositoryRoot(requestedRepository);
        let semanticAnalyzer: SemanticAnalyzer | undefined;
        if (options.semanticReplay !== undefined) {
          const replayCandidate = path.isAbsolute(options.semanticReplay)
            ? resolveInsideRoot(
                repositoryRoot,
                path.relative(repositoryRoot, options.semanticReplay),
                "semantic replay",
              )
            : resolveInsideRoot(
                repositoryRoot,
                options.semanticReplay,
                "semantic replay",
              );
          const replayPath = await resolveExistingInsideRoot(
            repositoryRoot,
            replayCandidate,
            "semantic replay",
          );
          const replaySize = (await stat(replayPath)).size;
          if (replaySize > 1_048_576) {
            throw new DecisionTraceError(
              `Semantic replay exceeds the 1048576-byte limit: ${options.semanticReplay}`,
              { code: "SEMANTIC_REPLAY_TOO_LARGE" },
            );
          }
          let replay: unknown;
          try {
            replay = JSON.parse(await readFile(replayPath, "utf8"));
          } catch {
            throw new DecisionTraceError(
              `Semantic replay is not valid JSON: ${options.semanticReplay}`,
              { code: "SEMANTIC_REPLAY_INVALID_JSON" },
            );
          }
          semanticAnalyzer = new ReplaySemanticAnalyzer(
            replay,
            `offline-replay:${path.basename(replayPath).slice(0, 160)}`,
          );
        }
        if (options.semanticByok !== undefined) {
          const configCandidate = path.isAbsolute(options.semanticByok)
            ? resolveInsideRoot(
                repositoryRoot,
                path.relative(repositoryRoot, options.semanticByok),
                "semantic BYOK config",
              )
            : resolveInsideRoot(
                repositoryRoot,
                options.semanticByok,
                "semantic BYOK config",
              );
          const configPath = await resolveExistingInsideRoot(
            repositoryRoot,
            configCandidate,
            "semantic BYOK config",
          );
          if ((await stat(configPath)).size > 32_768) {
            throw new DecisionTraceError(
              `Semantic BYOK config exceeds the 32768-byte limit: ${options.semanticByok}`,
              { code: "SEMANTIC_BYOK_CONFIG_TOO_LARGE" },
            );
          }
          let byokConfig: unknown;
          try {
            byokConfig = JSON.parse(await readFile(configPath, "utf8"));
          } catch {
            throw new DecisionTraceError(
              `Semantic BYOK config is not valid JSON: ${options.semanticByok}`,
              { code: "SEMANTIC_BYOK_CONFIG_INVALID_JSON" },
            );
          }
          semanticAnalyzer = new HttpJsonByokSemanticAnalyzer({
            config: byokConfig,
            mode: options.semantic as "local" | "cloud",
          });
        }
        const execution = await scanRepository({
          repo: requestedRepository,
          ...(options.base === undefined ? {} : { base: options.base }),
          ...(options.head === undefined ? {} : { head: options.head }),
          ...(options.output === undefined ? {} : { output: options.output }),
          semanticMode: options.semantic,
          ...(semanticAnalyzer === undefined ? {} : { semanticAnalyzer }),
          semanticTimeoutMilliseconds,
          ...(options.semanticInputOutput === undefined
            ? {}
            : { semanticInputOutput: options.semanticInputOutput }),
        });
        if (execution.semanticInputPath !== undefined) {
          io.stdout(`Semantic input: ${execution.semanticInputPath}\n`);
        }
        const selectedReport =
          options.format === "markdown"
            ? execution.bundle.reportMarkdown
            : options.format === "html"
              ? execution.bundle.reportHtml
              : options.format === "all"
                ? execution.bundle.directory
                : execution.bundle.reportJson;
        io.stdout(
          `${TOOL_NAME} ${execution.report.result}: ${execution.report.summary.total} finding(s); report ${selectedReport}\n`,
        );
        if (execution.gateFindingIds.length > 0) {
          io.stderr(
            `Deterministic gate failed: ${execution.gateFindingIds.join(", ")}\n`,
          );
        }
        commandExitCode = execution.exitCode;
      },
    );

  program
    .command("review")
    .description(
      "Append a human disposition without changing the original report.",
    )
    .argument("<report.json>", "canonical scan report")
    .requiredOption("--finding <id>", "finding ID")
    .addOption(
      new Option("--decision <value>", "human disposition")
        .choices(reviewDecisionSchema.options)
        .makeOptionMandatory(),
    )
    .requiredOption("--reason <text>", "non-empty review reason")
    .option("--reviewer <label>", "optional local reviewer label")
    .action(
      async (
        reportPath: string,
        options: {
          finding: string;
          decision: ReviewDecision;
          reason: string;
          reviewer?: string;
        },
      ) => {
        const result = await recordReview({
          cwd: process.cwd(),
          reportPath,
          findingId: options.finding,
          decision: options.decision,
          reason: options.reason,
          ...(options.reviewer === undefined
            ? {}
            : { reviewer: options.reviewer }),
        });
        io.stdout(
          `Recorded ${result.review.decision} in ${result.reviewPath}\n`,
        );
      },
    );

  program
    .command("ui")
    .description(
      "Serve the local dashboard, report history, comparison, and review UI.",
    )
    .option(
      "--repo <path>",
      "target repository",
      process.env.DECISIONTRACE_UI_REPO ?? process.cwd(),
    )
    .option("--port <port>", "loopback port", "4173")
    .option(
      "--api-only",
      "serve only the local API for Vite development",
      false,
    )
    .action(
      async (options: { repo: string; port: string; apiOnly: boolean }) => {
        const port = Number(options.port);
        if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
          throw new DecisionTraceError(
            "--port must be an integer from 1 to 65535.",
            {
              code: "UI_PORT_INVALID",
            },
          );
        }
        const handle = await startUiServer({
          repo: path.resolve(options.repo),
          port,
          apiOnly: options.apiOnly,
        });
        io.stdout(
          `${TOOL_NAME} local UI: ${handle.url}${options.apiOnly ? " (API only)" : ""}\n`,
        );
        let closing = false;
        const shutdown = (): void => {
          if (closing) return;
          closing = true;
          void handle.close().finally(() => {
            process.exitCode = 0;
          });
        };
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
      },
    );

  program
    .command("eval")
    .description(
      "Evaluate deterministic detectors against a versioned fixture dataset.",
    )
    .requiredOption("--dataset <path>", "YAML eval dataset")
    .option(
      "--output <dir>",
      "evaluation output directory",
      ".decisiontrace/eval",
    )
    .action(async (options: { dataset: string; output: string }) => {
      const root = await findRepositoryRoot(process.cwd());
      const datasetCandidate = path.isAbsolute(options.dataset)
        ? resolveInsideRoot(
            root,
            path.relative(root, options.dataset),
            "dataset",
          )
        : resolveInsideRoot(root, options.dataset, "dataset");
      const datasetPath = await resolveExistingInsideRoot(
        root,
        datasetCandidate,
        "dataset",
      );
      const outputDirectory = path.isAbsolute(options.output)
        ? resolveInsideRoot(root, path.relative(root, options.output), "output")
        : resolveInsideRoot(root, options.output, "output");
      await assertSafeWritePath(root, outputDirectory, "output");
      const result = await runEvaluation({ datasetPath, outputDirectory });
      io.stdout(
        `Evaluated ${result.report.caseCounts.total} case(s); Gate E1 ${result.report.gateE1.achieved ? "achieved" : "not achieved"}; report ${result.jsonPath}\n`,
      );
    });

  program
    .command("semantic-review")
    .description(
      "Append a human disposition for an exploratory semantic candidate.",
    )
    .argument("<report.json>", "canonical scan report")
    .requiredOption("--candidate <id>", "semantic candidate ID")
    .addOption(
      new Option("--decision <value>", "semantic candidate disposition")
        .choices(semanticReviewDecisionSchema.options)
        .makeOptionMandatory(),
    )
    .requiredOption("--reason <text>", "non-empty review reason")
    .option("--reviewer <label>", "optional local reviewer label")
    .action(
      async (
        reportPath: string,
        options: {
          candidate: string;
          decision: SemanticReviewDecision;
          reason: string;
          reviewer?: string;
        },
      ) => {
        const result = await recordSemanticReview({
          cwd: process.cwd(),
          reportPath,
          candidateId: options.candidate,
          decision: options.decision,
          reason: options.reason,
          ...(options.reviewer === undefined
            ? {}
            : { reviewer: options.reviewer }),
        });
        io.stdout(
          `Recorded semantic ${result.review.decision} in ${result.reviewPath}\n`,
        );
      },
    );

  try {
    await program.parseAsync(argv);
    if (argv.length <= 2) program.outputHelp();
    return commandExitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (
        error.code === "commander.helpDisplayed" ||
        error.code === "commander.version"
      ) {
        return 0;
      }
      return 2;
    }
    const exitCode = error instanceof DecisionTraceError ? error.exitCode : 2;
    io.stderr(`${errorMessage(error)}\n`);
    return exitCode;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = await main();
}
