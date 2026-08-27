import { useState, type SyntheticEvent } from "react";

import type {
  FindingReviewRequest,
  Review,
  SemanticReview,
  SemanticReviewRequest,
} from "../types.js";
import { Badge, statusTone } from "./Badge.js";

const FINDING_DECISIONS: Array<{
  value: FindingReviewRequest["decision"];
  label: string;
}> = [
  { value: "true_drift", label: "True drift" },
  { value: "intentional_change", label: "Intentional change" },
  { value: "false_positive", label: "False positive" },
  { value: "accepted_risk", label: "Accepted risk" },
  { value: "insufficient_evidence", label: "Insufficient evidence" },
];

const SEMANTIC_DECISIONS: Array<{
  value: SemanticReviewRequest["decision"];
  label: string;
}> = [
  { value: "confirmed", label: "Confirmed candidate" },
  { value: "rejected", label: "Rejected" },
  { value: "needs_context", label: "Needs context" },
  { value: "duplicate", label: "Duplicate" },
];

function ExistingReview({ review }: { review: Review | SemanticReview }) {
  return (
    <div className="existing-review">
      <div>
        <span className="field-label">Latest disposition</span>
        <Badge tone={statusTone(review.decision)}>{review.decision}</Badge>
      </div>
      <p>{review.reason}</p>
      <small>{new Date(review.reviewedAt).toLocaleString("zh-CN")}</small>
    </div>
  );
}

export function FindingReviewForm({
  reportKey,
  findingId,
  existing,
  submit,
}: {
  reportKey: string;
  findingId: string;
  existing?: Review;
  submit: (request: FindingReviewRequest) => Promise<void>;
}) {
  const [decision, setDecision] =
    useState<FindingReviewRequest["decision"]>("true_drift");
  const [reason, setReason] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await submit({
        reportKey,
        findingId,
        decision,
        reason,
        ...(reviewer.trim() === "" ? {} : { reviewer }),
      });
      setReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="review-panel">
      {existing === undefined ? null : <ExistingReview review={existing} />}
      <details open={existing === undefined}>
        <summary>
          {existing === undefined ? "记录 disposition" : "追加新 disposition"}
        </summary>
        <form
          className="review-form"
          onSubmit={(event) => void onSubmit(event)}
        >
          <label>
            <span>Decision</span>
            <select
              value={decision}
              onChange={(event) =>
                setDecision(event.target.value as typeof decision)
              }
            >
              {FINDING_DECISIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Reason</span>
            <textarea
              required
              maxLength={2000}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="写下支持这个判断的最小充分理由"
            />
          </label>
          <label>
            <span>Reviewer label（可选）</span>
            <input
              maxLength={200}
              value={reviewer}
              onChange={(event) => setReviewer(event.target.value)}
              placeholder="local reviewer"
            />
          </label>
          {error === undefined ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button button-primary"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "写入中…" : "追加到 review log"}
          </button>
        </form>
      </details>
    </div>
  );
}

export function SemanticReviewForm({
  reportKey,
  candidateId,
  existing,
  submit,
}: {
  reportKey: string;
  candidateId: string;
  existing?: SemanticReview;
  submit: (request: SemanticReviewRequest) => Promise<void>;
}) {
  const [decision, setDecision] =
    useState<SemanticReviewRequest["decision"]>("needs_context");
  const [reason, setReason] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await submit({
        reportKey,
        candidateId,
        decision,
        reason,
        ...(reviewer.trim() === "" ? {} : { reviewer }),
      });
      setReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="review-panel review-panel-semantic">
      {existing === undefined ? null : <ExistingReview review={existing} />}
      <details open={existing === undefined}>
        <summary>
          {existing === undefined
            ? "Review semantic candidate"
            : "追加新 disposition"}
        </summary>
        <form
          className="review-form"
          onSubmit={(event) => void onSubmit(event)}
        >
          <label>
            <span>Decision</span>
            <select
              value={decision}
              onChange={(event) =>
                setDecision(event.target.value as typeof decision)
              }
            >
              {SEMANTIC_DECISIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Reason</span>
            <textarea
              required
              maxLength={2000}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="说明为何确认、拒绝或仍需上下文"
            />
          </label>
          <label>
            <span>Reviewer label（可选）</span>
            <input
              maxLength={200}
              value={reviewer}
              onChange={(event) => setReviewer(event.target.value)}
            />
          </label>
          {error === undefined ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button button-primary"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "写入中…" : "追加到 semantic review log"}
          </button>
        </form>
      </details>
    </div>
  );
}
