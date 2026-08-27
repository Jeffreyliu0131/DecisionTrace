import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { PROJECT_ROOT } from "./helpers/repository.js";

describe("GitHub shadow integration", () => {
  it("[AC-028, AC-029] uploads before preserving scan status and requests only read access", async () => {
    const actionRaw = await readFile(
      path.join(PROJECT_ROOT, "action.yml"),
      "utf8",
    );
    const action = parse(actionRaw) as {
      runs: { steps: { name: string; uses?: string }[] };
    };
    const stepNames = action.runs.steps.map((step) => step.name);
    expect(stepNames[0]).toBe("Validate local boundaries");
    expect(stepNames.indexOf("Upload DecisionTrace reports")).toBeLessThan(
      stepNames.indexOf("Preserve trusted scan status"),
    );
    expect(actionRaw).not.toContain("pull-requests: write");
    expect(actionRaw).not.toContain("issues: write");
    expect(actionRaw).toContain('realpath "$GITHUB_WORKSPACE"');

    const actionUses = [...actionRaw.matchAll(/uses:\s+([^\s#]+)/gu)].map(
      (match) => match[1],
    );
    expect(actionUses.every((value) => /@[a-f0-9]{40}$/u.test(value!))).toBe(
      true,
    );

    for (const workflow of ["ci.yml", "shadow.yml"]) {
      const raw = await readFile(
        path.join(PROJECT_ROOT, ".github/workflows", workflow),
        "utf8",
      );
      const parsed = parse(raw) as { permissions: { contents: string } };
      expect(parsed.permissions).toEqual({ contents: "read" });
      const uses = [...raw.matchAll(/uses:\s+([^\s#]+)/gu)].map(
        (match) => match[1],
      );
      expect(
        uses.every((value) => value === "./" || /@[a-f0-9]{40}$/u.test(value!)),
      ).toBe(true);
      expect(raw).toContain("persist-credentials: false");
    }

    const shadowRaw = await readFile(
      path.join(PROJECT_ROOT, ".github/workflows/shadow.yml"),
      "utf8",
    );
    expect(shadowRaw).toContain("branches: [main]");
  });
});
