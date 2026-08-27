import { createHash } from "node:crypto";

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }
  return value;
}

export function stableJson(value: unknown, indentation = 2): string {
  return `${JSON.stringify(sortJsonValue(value), null, indentation)}\n`;
}

export function stableHash(value: unknown): string {
  return sha256(stableJson(value, 0));
}
