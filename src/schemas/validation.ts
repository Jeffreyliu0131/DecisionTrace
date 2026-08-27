import type { ZodType } from "zod";
import { z } from "zod";

import { DecisionTraceError } from "../errors.js";

function formatPath(path: PropertyKey[]): string {
  if (path.length === 0) return "<root>";
  return path
    .map((part, index) =>
      typeof part === "number"
        ? `[${part}]`
        : `${index === 0 ? "" : "."}${String(part)}`,
    )
    .join("");
}

export function validationMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${formatPath(issue.path)}: ${issue.message}`)
    .join("; ");
}

export function parseSchema<T>(
  schema: ZodType<T>,
  input: unknown,
  label: string,
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DecisionTraceError(
      `${label} validation failed: ${validationMessage(result.error)}`,
      { code: "SCHEMA_VALIDATION_FAILED" },
    );
  }
  return result.data;
}
