import type { Finding, Review } from "../types.js";
import type { FindingReviewRequest } from "../types.js";
import { Badge, statusTone } from "./Badge.js";
import { FindingReviewForm } from "./ReviewForm.js";

export function FindingCard({
  finding,
  reportKey,
  review,
  submitReview,
}: {
  finding: Finding;
  reportKey: string;
  review?: Review;
  submitReview: (request: FindingReviewRequest) => Promise<void>;
}) {
  return (
    <article className="finding-card" id={finding.id}>
      <header className="card-header">
        <div>
          <div className="badge-row">
            <Badge tone={statusTone(finding.driftType)}>
              {finding.driftType}
            </Badge>
            <Badge tone={statusTone(finding.status)}>{finding.status}</Badge>
            <Badge tone={statusTone(finding.severity)}>
              {finding.severity}
            </Badge>
            {review === undefined ? (
              <Badge tone="warning">unreviewed</Badge>
            ) : (
              <Badge tone={statusTone(review.decision)}>
                {review.decision}
              </Badge>
            )}
          </div>
          <h3>{finding.id}</h3>
          <p className="contract-list">
            {finding.contractIds.length === 0
              ? "No linked contract"
              : finding.contractIds.join(" · ")}
          </p>
        </div>
        <div className="confidence-block">
          <span>{Math.round(finding.confidence * 100)}%</span>
          <progress
            max={1}
            value={finding.confidence}
            aria-label="Finding confidence"
          />
        </div>
      </header>

      <div className="evidence-grid">
        <section>
          <span className="field-label">Facts</span>
          {finding.facts.length === 0 ? (
            <p className="muted">No deterministic facts.</p>
          ) : (
            <ul>
              {finding.facts.map((fact, index) => (
                <li key={`${finding.id}-fact-${index}`}>{fact.statement}</li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <span className="field-label">Inferences</span>
          {finding.inferences.length === 0 ? (
            <p className="muted">No semantic inference.</p>
          ) : (
            <ul>
              {finding.inferences.map((inference, index) => (
                <li key={`${finding.id}-inference-${index}`}>
                  {inference.statement}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="source-block">
        <span className="field-label">Validated sources</span>
        <div className="source-list">
          {finding.sources.map((source, index) => (
            <code key={`${finding.id}-source-${index}`}>
              {source.path}
              {source.startLine === undefined ? "" : `:${source.startLine}`}
            </code>
          ))}
        </div>
      </div>

      <div className="suggested-review">
        <span className="field-label">Suggested human review</span>
        <p>{finding.suggestedReview}</p>
      </div>

      <FindingReviewForm
        reportKey={reportKey}
        findingId={finding.id}
        existing={review}
        submit={submitReview}
      />
    </article>
  );
}
