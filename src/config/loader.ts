import { readFile } from "node:fs/promises";

import { parseDocument } from "yaml";

import { DecisionTraceError } from "../errors.js";
import {
  configSchema,
  contractRegistrySchema,
  type ContractRegistry,
  type DecisionTraceConfig,
} from "../schemas/index.js";
import { parseSchema } from "../schemas/validation.js";
import { sha256 } from "../utils/hash.js";
import {
  resolveExistingInsideRoot,
  resolveInsideRoot,
  validateRepoRelativePattern,
} from "../utils/paths.js";

export type LoadedConfiguration = {
  config: DecisionTraceConfig;
  registry: ContractRegistry;
  configHash: string;
  registryHash: string;
  configPath: string;
  registryPath: string;
};

function parseYaml(raw: string, label: string): unknown {
  const document = parseDocument(raw, { prettyErrors: true, uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new DecisionTraceError(
      `${label} YAML parse failed: ${document.errors.map((error) => error.message).join("; ")}`,
      { code: "YAML_PARSE_FAILED" },
    );
  }
  return document.toJS({ maxAliasCount: 100 });
}

function validateConfigurationPaths(
  root: string,
  config: DecisionTraceConfig,
  registry: ContractRegistry,
): void {
  for (const [category, definition] of Object.entries(config.sources)) {
    definition.include.forEach((pattern, index) =>
      validateRepoRelativePattern(
        pattern,
        `sources.${category}.include[${index}]`,
      ),
    );
  }
  config.exclude.forEach((pattern, index) =>
    validateRepoRelativePattern(pattern, `exclude[${index}]`),
  );
  resolveInsideRoot(root, config.contracts, "contracts");
  resolveInsideRoot(root, config.reports, "reports");

  registry.contracts.forEach((contract, contractIndex) => {
    const relationGroups = [
      ["defined_by", contract.defined_by],
      ["implemented_by", contract.implemented_by],
      ["enforced_by", contract.enforced_by],
      ["verified_by", contract.verified_by],
      ["claimed_in", contract.claimed_in],
    ] as const;
    relationGroups.forEach(([relation, links]) => {
      links.forEach((link, linkIndex) => {
        validateRepoRelativePattern(
          link.path ?? link.glob ?? "",
          `contracts[${contractIndex}].${relation}[${linkIndex}]`,
        );
      });
    });
  });
}

export async function loadConfiguration(
  root: string,
): Promise<LoadedConfiguration> {
  const configPath = resolveInsideRoot(root, ".decisiontrace.yml", "config");
  let configRaw: string;
  try {
    configRaw = await readFile(
      await resolveExistingInsideRoot(root, configPath, "config"),
      "utf8",
    );
  } catch (error) {
    if (error instanceof DecisionTraceError) throw error;
    throw new DecisionTraceError(
      "Missing .decisiontrace.yml. Run 'decisiontrace init' first.",
      { code: "CONFIG_NOT_FOUND" },
    );
  }
  const config = parseSchema(
    configSchema,
    parseYaml(configRaw, ".decisiontrace.yml"),
    ".decisiontrace.yml",
  );
  const registryPath = resolveInsideRoot(root, config.contracts, "contracts");
  let registryRaw: string;
  try {
    registryRaw = await readFile(
      await resolveExistingInsideRoot(root, registryPath, "contracts"),
      "utf8",
    );
  } catch (error) {
    if (error instanceof DecisionTraceError) throw error;
    throw new DecisionTraceError(
      `Contract registry not found: ${config.contracts}`,
      { code: "CONTRACT_REGISTRY_NOT_FOUND" },
    );
  }
  const registry = parseSchema(
    contractRegistrySchema,
    parseYaml(registryRaw, config.contracts),
    config.contracts,
  );
  validateConfigurationPaths(root, config, registry);
  return {
    config,
    registry,
    configHash: sha256(configRaw),
    registryHash: sha256(registryRaw),
    configPath,
    registryPath,
  };
}
