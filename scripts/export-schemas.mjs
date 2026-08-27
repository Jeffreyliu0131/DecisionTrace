import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";
import { z } from "zod";

import {
  artifactSchema,
  configSchema,
  contractRegistrySchema,
  evalCaseSchema,
  findingSchema,
  redactedSemanticInputSchema,
  reviewSchema,
  scanReportSchema,
  semanticCandidateSchema,
  semanticProviderResponseSchema,
  semanticReviewSchema,
  traceEdgeSchema,
} from "../dist/schemas/index.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const output = path.join(projectRoot, "schemas");
await mkdir(output, { recursive: true });

const schemas = [
  ["config.v1.schema.json", "DecisionTraceConfigV1", configSchema],
  [
    "contract-registry.v1.schema.json",
    "DecisionTraceContractRegistryV1",
    contractRegistrySchema,
  ],
  ["artifact.v1.schema.json", "DecisionTraceArtifactV1", artifactSchema],
  ["trace-edge.v1.schema.json", "DecisionTraceTraceEdgeV1", traceEdgeSchema],
  ["finding.v1.schema.json", "DecisionTraceFindingV1", findingSchema],
  [
    "semantic-input.v1.schema.json",
    "DecisionTraceSemanticInputV1",
    redactedSemanticInputSchema,
  ],
  [
    "semantic-provider-response.v1.schema.json",
    "DecisionTraceSemanticProviderResponseV1",
    semanticProviderResponseSchema,
  ],
  [
    "semantic-candidate.v1.schema.json",
    "DecisionTraceSemanticCandidateV1",
    semanticCandidateSchema,
  ],
  [
    "semantic-review.v1.schema.json",
    "DecisionTraceSemanticReviewV1",
    semanticReviewSchema,
  ],
  ["scan-report.v1.schema.json", "DecisionTraceScanReportV1", scanReportSchema],
  ["review.v1.schema.json", "DecisionTraceReviewV1", reviewSchema],
  ["eval-case.v1.schema.json", "DecisionTraceEvalCaseV1", evalCaseSchema],
];

for (const [fileName, name, schema] of schemas) {
  const jsonSchema = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    unrepresentable: "any",
  });
  jsonSchema.title = name;
  const rendered = await prettier.format(JSON.stringify(jsonSchema), {
    parser: "json",
  });
  await writeFile(path.join(output, fileName), rendered);
}
