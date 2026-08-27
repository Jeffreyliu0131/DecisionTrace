import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "purple";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function statusTone(
  value: string,
): "neutral" | "success" | "warning" | "danger" | "info" | "purple" {
  if (["complete", "confirmed", "true_drift"].includes(value)) return "success";
  if (["failed", "critical", "rejected", "false_positive"].includes(value)) {
    return "danger";
  }
  if (
    ["partial", "high", "needs_context", "insufficient_evidence"].includes(
      value,
    )
  ) {
    return "warning";
  }
  if (["exploratory", "candidate", "local", "cloud"].includes(value)) {
    return "purple";
  }
  if (["formal", "D1", "D2", "D3"].includes(value)) return "info";
  return "neutral";
}
