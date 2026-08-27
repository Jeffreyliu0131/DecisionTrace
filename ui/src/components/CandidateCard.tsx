import type {
  SemanticCandidate,
  SemanticReview,
  SemanticReviewRequest,
} from "../types.js";
import { Badge, statusTone } from "./Badge.js";
import { SemanticReviewForm } from "./ReviewForm.js";

function candidateDetail(candidate: SemanticCandidate): string {
  if (candidate.kind === "claim") {
    return `${candidate.proposedContract.title} · ${candidate.proposedContract.topic}`;
  }
  if (candidate.kind === "edge") {
    return `${candidate.fromContractId} ${candidate.relation} ${candidate.toSourceId}`;
  }
  return `${candidate.driftType} · ${candidate.contractIds.join(", ")}`;
}

export function CandidateCard({
  candidate,
  reportKey,
  review,
  submitReview,
}: {
  candidate: SemanticCandidate;
  reportKey: string;
  review?: SemanticReview;
  submitReview: (request: SemanticReviewRequest) => Promise<void>;
}) {
  return (
    <article className="finding-card candidate-card" id={candidate.id}>
      <header className="card-header">
        <div>
          <div className="badge-row">
            <Badge tone="purple">{candidate.kind}</Badge>
            <Badge tone={statusTone(candidate.status)}>
              {candidate.status}
            </Badge>
            {review === undefined ? (
              <Badge tone="warning">unreviewed</Badge>
            ) : (
              <Badge tone={statusTone(review.decision)}>
                {review.decision}
              </Badge>
            )}
          </div>
          <h3>{candidate.id}</h3>
          <p className="contract-list">{candidateDetail(candidate)}</p>
        </div>
        <div className="confidence-block">
          <span>{Math.round(candidate.confidence * 100)}%</span>
          <progress
            max={1}
            value={candidate.confidence}
            aria-label="Candidate confidence"
          />
        </div>
      </header>
      <div className="model-inference-panel">
        <span className="field-label">
          Model inference · {candidate.provider}
        </span>
        <p>{candidate.statement}</p>
      </div>
      <div className="source-block">
        <span className="field-label">Locally validated sources</span>
        <div className="source-list">
          {candidate.sources.map((source, index) => (
            <code key={`${candidate.id}-source-${index}`}>
              {source.path}
              {source.startLine === undefined ? "" : `:${source.startLine}`}
            </code>
          ))}
        </div>
      </div>
      <div className="suggested-review">
        <span className="field-label">Suggested human review</span>
        <p>{candidate.suggestedReview}</p>
      </div>
      <SemanticReviewForm
        reportKey={reportKey}
        candidateId={candidate.id}
        existing={review}
        submit={submitReview}
      />
    </article>
  );
}
