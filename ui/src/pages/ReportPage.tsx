import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  getReport,
  submitFindingReview,
  submitSemanticReview,
} from "../api.js";
import { Badge, statusTone } from "../components/Badge.js";
import { CandidateCard } from "../components/CandidateCard.js";
import { FindingCard } from "../components/FindingCard.js";
import { EmptyState, ErrorState, LoadingState } from "../components/States.js";
import { errorText, formatDate, shortSha } from "../lib.js";
import type {
  FindingReviewRequest,
  ReportDetail,
  SemanticReviewRequest,
} from "../types.js";

type Tab = "findings" | "semantic" | "diagnostics" | "coverage";

export function ReportPage() {
  const { reportKey = "" } = useParams();
  const [detail, setDetail] = useState<ReportDetail>();
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<Tab>("findings");
  const [search, setSearch] = useState("");
  const [driftType, setDriftType] = useState("all");
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [reviewState, setReviewState] = useState("all");

  const load = useCallback(async () => {
    try {
      setError(undefined);
      setDetail(await getReport(reportKey));
    } catch (caught) {
      setError(errorText(caught));
    }
  }, [reportKey]);

  useEffect(() => void load(), [load]);

  const findings = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (detail === undefined) return [];
    return detail.report.findings.filter((finding) => {
      if (driftType !== "all" && finding.driftType !== driftType) return false;
      if (status !== "all" && finding.status !== status) return false;
      if (severity !== "all" && finding.severity !== severity) return false;
      const reviewed = detail.reviews.findings[finding.id] !== undefined;
      if (reviewState === "reviewed" && !reviewed) return false;
      if (reviewState === "unreviewed" && reviewed) return false;
      if (needle === "") return true;
      return [
        finding.id,
        ...finding.contractIds,
        ...finding.facts.map((fact) => fact.statement),
        ...finding.inferences.map((inference) => inference.statement),
        ...finding.sources.map((source) => source.path),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [detail, driftType, reviewState, search, severity, status]);

  async function reviewFinding(request: FindingReviewRequest) {
    await submitFindingReview(request);
    await load();
  }

  async function reviewSemantic(request: SemanticReviewRequest) {
    await submitSemanticReview(request);
    await load();
  }

  if (error !== undefined)
    return <ErrorState message={error} retry={() => void load()} />;
  if (detail === undefined)
    return <LoadingState label="正在验证并读取 canonical report…" />;

  const report = detail.report;
  return (
    <>
      <div className="breadcrumbs">
        <Link to="/scans">扫描历史</Link>
        <span>/</span>
        <span>{report.scanId}</span>
      </div>
      <div className="page-heading report-heading">
        <div>
          <div className="badge-row">
            <Badge tone={statusTone(report.result)}>{report.result}</Badge>
            <Badge>{report.mode}</Badge>
            <Badge tone={statusTone(report.semantic.status)}>
              semantic {report.semantic.status}
            </Badge>
          </div>
          <h1>{report.scanId}</h1>
          <p>
            {formatDate(report.completedAt)} · head{" "}
            <code>{shortSha(report.repository.head)}</code>
            {report.repository.base === undefined ? (
              ""
            ) : (
              <>
                {" "}
                · base <code>{shortSha(report.repository.base)}</code>
              </>
            )}
          </p>
        </div>
        <div className="heading-actions">
          <Link
            className="button button-secondary"
            to={`/compare?right=${detail.key}`}
          >
            与其他报告对比
          </Link>
        </div>
      </div>

      <section className="metric-grid metric-grid-compact">
        <Metric
          label="Total findings"
          value={report.summary.total}
          tone="neutral"
        />
        <Metric
          label="Formal"
          value={report.summary.formal}
          tone={report.summary.formal > 0 ? "warning" : "success"}
        />
        <Metric
          label="Exploratory"
          value={report.summary.exploratory}
          tone="purple"
        />
        <Metric
          label="Semantic"
          value={report.semantic.candidates.length}
          tone={report.semantic.status === "complete" ? "purple" : "neutral"}
        />
        <Metric label="Artifacts" value={report.artifacts.length} tone="info" />
        <Metric
          label="Diagnostics"
          value={report.diagnostics.length}
          tone={report.diagnostics.length > 0 ? "warning" : "success"}
        />
      </section>

      <div className="tabs" role="tablist" aria-label="Report sections">
        <TabButton
          active={tab === "findings"}
          onClick={() => setTab("findings")}
        >
          Findings <span>{report.findings.length}</span>
        </TabButton>
        <TabButton
          active={tab === "semantic"}
          onClick={() => setTab("semantic")}
        >
          Semantic <span>{report.semantic.candidates.length}</span>
        </TabButton>
        <TabButton
          active={tab === "diagnostics"}
          onClick={() => setTab("diagnostics")}
        >
          Diagnostics <span>{report.diagnostics.length}</span>
        </TabButton>
        <TabButton
          active={tab === "coverage"}
          onClick={() => setTab("coverage")}
        >
          Coverage <span>{report.coverage.included.length}</span>
        </TabButton>
      </div>

      {tab === "findings" && (
        <section>
          <div className="filter-bar finding-filters">
            <label className="search-field">
              <span>搜索 findings</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ID、contract、source 或 statement"
              />
            </label>
            <Filter
              label="Drift"
              value={driftType}
              set={setDriftType}
              values={["D1", "D2", "D3"]}
            />
            <Filter
              label="Status"
              value={status}
              set={setStatus}
              values={["formal", "exploratory", "abstained"]}
            />
            <Filter
              label="Severity"
              value={severity}
              set={setSeverity}
              values={["critical", "high", "medium", "low", "info"]}
            />
            <Filter
              label="Review"
              value={reviewState}
              set={setReviewState}
              values={["reviewed", "unreviewed"]}
            />
            <span className="filter-count">
              {findings.length} / {report.findings.length}
            </span>
          </div>
          <div className="card-stack">
            {findings.length === 0 ? (
              <EmptyState
                title="没有匹配的 finding"
                body="当前筛选条件没有结果。"
              />
            ) : (
              findings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  reportKey={detail.key}
                  review={detail.reviews.findings[finding.id]}
                  submitReview={reviewFinding}
                />
              ))
            )}
          </div>
        </section>
      )}

      {tab === "semantic" && (
        <section>
          <div className="notice semantic-cost-notice">
            <strong>{report.semantic.provider}</strong>
            <span>{semanticCostLabel(report)}</span>
          </div>
          <div className="card-stack">
            {report.semantic.candidates.length === 0 ? (
              <EmptyState
                title="没有 semantic candidate"
                body={`Semantic stage: ${report.semantic.status} via ${report.semantic.provider}.`}
              />
            ) : (
              report.semantic.candidates.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  reportKey={detail.key}
                  review={detail.reviews.semanticCandidates[candidate.id]}
                  submitReview={reviewSemantic}
                />
              ))
            )}
          </div>
        </section>
      )}

      {tab === "diagnostics" && (
        <section className="panel">
          {report.diagnostics.length === 0 ? (
            <EmptyState
              title="没有 diagnostics"
              body="本次扫描没有记录 parser、Git、coverage 或 provider diagnostics。"
            />
          ) : (
            <ul className="diagnostic-list">
              {report.diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${index}`}>
                  <Badge tone={statusTone(diagnostic.severity)}>
                    {diagnostic.severity}
                  </Badge>
                  <code>{diagnostic.code}</code>
                  <span>{diagnostic.message}</span>
                  {diagnostic.recovery === undefined ? null : (
                    <small>{diagnostic.recovery}</small>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "coverage" && (
        <div className="coverage-grid">
          <section className="panel">
            <div className="panel-heading">
              <h2>Included artifacts</h2>
              <span>{report.coverage.included.length}</span>
            </div>
            <div className="path-list">
              {report.coverage.included.map((item) => (
                <code key={item}>{item}</code>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Skipped artifacts</h2>
              <span>{report.coverage.skipped.length}</span>
            </div>
            {report.coverage.skipped.length === 0 ? (
              <p className="muted">None</p>
            ) : (
              <ul className="diagnostic-list">
                {report.coverage.skipped.map((item, index) => (
                  <li key={`${item.path}-${index}`}>
                    <Badge>{item.reason}</Badge>
                    <code>{item.path}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: Parameters<typeof Badge>[0]["tone"];
}) {
  return (
    <article className="mini-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <Badge tone={tone}>{label}</Badge>
    </article>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "tab tab-active" : "tab"}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Filter({
  label,
  value,
  set,
  values,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  values: string[];
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => set(event.target.value)}>
        <option value="all">All</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function semanticCostLabel(detail: ReportDetail["report"]): string {
  const cost = detail.semantic.cost;
  if (cost.status === "reported") {
    return `Reported ${cost.reportedUsd} USD · ${cost.reportedInputTokens} input / ${cost.reportedOutputTokens} output tokens`;
  }
  if (cost.status === "estimated") {
    return `Preflight max ${cost.estimatedMaxUsd} USD · ${cost.estimatedInputTokens} estimated input / ${cost.maxOutputTokens} max output tokens`;
  }
  return "No paid provider cost applies to this scan.";
}
