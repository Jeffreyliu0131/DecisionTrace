import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { compareReports, getHistory } from "../api.js";
import { Badge, statusTone } from "../components/Badge.js";
import { EmptyState, ErrorState, LoadingState } from "../components/States.js";
import { errorText, formatDate, shortSha, signed } from "../lib.js";
import type { ReportComparison, ReportHistory } from "../types.js";

export function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [history, setHistory] = useState<ReportHistory>();
  const [comparison, setComparison] = useState<ReportComparison>();
  const [error, setError] = useState<string>();
  const [left, setLeft] = useState(searchParams.get("left") ?? "");
  const [right, setRight] = useState(searchParams.get("right") ?? "");
  const [loadingComparison, setLoadingComparison] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setError(undefined);
      const next = await getHistory();
      setHistory(next);
      setRight((current) => current || next.reports[0]?.key || "");
      setLeft(
        (current) =>
          current || next.reports[1]?.key || next.reports[0]?.key || "",
      );
    } catch (caught) {
      setError(errorText(caught));
    }
  }, []);

  useEffect(() => void loadHistory(), [loadHistory]);

  async function runComparison(event?: SyntheticEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (left === "" || right === "" || left === right) return;
    setLoadingComparison(true);
    setError(undefined);
    try {
      setComparison(await compareReports(left, right));
      setSearchParams({ left, right });
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoadingComparison(false);
    }
  }

  if (error !== undefined && history === undefined)
    return <ErrorState message={error} retry={() => void loadHistory()} />;
  if (history === undefined) return <LoadingState />;
  if (history.reports.length < 2)
    return (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">Compare</span>
            <h1>报告对比</h1>
          </div>
        </div>
        <EmptyState
          title="至少需要两份报告"
          body="生成第二份 scan report 后即可比较 stable findings、candidates 与 artifact hashes。"
        />
      </>
    );

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Compare</span>
          <h1>报告对比</h1>
          <p>
            左侧是基线，右侧是目标；added 表示目标新增，removed
            表示目标不再出现。
          </p>
        </div>
      </div>
      <form
        className="compare-controls"
        onSubmit={(event) => void runComparison(event)}
      >
        <ReportSelect
          label="Baseline"
          value={left}
          set={setLeft}
          history={history}
        />
        <span className="compare-arrow" aria-hidden="true">
          →
        </span>
        <ReportSelect
          label="Target"
          value={right}
          set={setRight}
          history={history}
        />
        <button
          className="button button-primary"
          disabled={left === right || loadingComparison}
          type="submit"
        >
          {loadingComparison ? "比较中…" : "比较"}
        </button>
      </form>
      {left === right && (
        <p className="form-error" role="alert">
          请选择两份不同的报告。
        </p>
      )}
      {error === undefined ? null : (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}

      {comparison === undefined ? (
        <EmptyState
          title="选择两份报告开始比较"
          body="Comparison 不重新运行 detector，只比较两份 canonical JSON。"
        />
      ) : (
        <ComparisonResult comparison={comparison} />
      )}
    </>
  );
}

function ReportSelect({
  label,
  value,
  set,
  history,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  history: ReportHistory;
}) {
  return (
    <label className="report-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => set(event.target.value)}>
        {history.reports.map((report) => (
          <option key={report.key} value={report.key}>
            {formatDate(report.completedAt)} · {shortSha(report.head)} ·{" "}
            {report.findings.total} findings
          </option>
        ))}
      </select>
    </label>
  );
}

function ComparisonResult({ comparison }: { comparison: ReportComparison }) {
  return (
    <div className="comparison-stack">
      <section className="comparison-header panel">
        <ReportSide label="Baseline" report={comparison.left} />
        <div className="comparison-versus">VS</div>
        <ReportSide label="Target" report={comparison.right} />
      </section>
      <section className="metric-grid metric-grid-compact">
        <Delta
          label="Total findings"
          value={comparison.summaryDelta.totalFindings}
        />
        <Delta label="Formal" value={comparison.summaryDelta.formalFindings} />
        <Delta
          label="Exploratory"
          value={comparison.summaryDelta.exploratoryFindings}
        />
        <Delta
          label="Semantic"
          value={comparison.summaryDelta.semanticCandidates}
        />
        <Delta
          label="Diagnostics"
          value={comparison.summaryDelta.diagnostics}
        />
      </section>
      <ChangePanel
        title="Findings"
        changes={comparison.findings}
        render={(item) => (
          <>
            <code>{item.id}</code>
            <Badge tone={statusTone(item.status)}>{item.status}</Badge>
            <span>
              {item.driftType} · {item.severity}
            </span>
          </>
        )}
      />
      <ChangePanel
        title="Semantic candidates"
        changes={comparison.semanticCandidates}
        render={(item) => (
          <>
            <code>{item.id}</code>
            <Badge tone="purple">{item.kind}</Badge>
            <span>{item.statement}</span>
          </>
        )}
      />
      <ChangePanel
        title="Artifacts"
        changes={comparison.artifacts}
        render={(item) => (
          <>
            <code>{item.path}</code>
            <Badge>{item.category}</Badge>
            <span>{shortSha(item.contentHash)}</span>
          </>
        )}
      />
      <section className="panel">
        <div className="panel-heading">
          <h2>Diagnostic codes</h2>
        </div>
        <div className="diagnostic-diff">
          <div>
            <span className="field-label">Added</span>
            {comparison.diagnostics.addedCodes.length === 0 ? (
              <p className="muted">None</p>
            ) : (
              comparison.diagnostics.addedCodes.map((code) => (
                <code key={code}>{code}</code>
              ))
            )}
          </div>
          <div>
            <span className="field-label">Removed</span>
            {comparison.diagnostics.removedCodes.length === 0 ? (
              <p className="muted">None</p>
            ) : (
              comparison.diagnostics.removedCodes.map((code) => (
                <code key={code}>{code}</code>
              ))
            )}
          </div>
          <div>
            <span className="field-label">Unchanged</span>
            {comparison.diagnostics.unchangedCodes.length === 0 ? (
              <p className="muted">None</p>
            ) : (
              comparison.diagnostics.unchangedCodes.map((code) => (
                <code key={code}>{code}</code>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ReportSide({
  label,
  report,
}: {
  label: string;
  report: ReportComparison["left"];
}) {
  return (
    <div>
      <span className="eyebrow">{label}</span>
      <h2>{shortSha(report.head)}</h2>
      <p>{formatDate(report.completedAt)}</p>
      <div className="badge-row">
        <Badge tone={statusTone(report.result)}>{report.result}</Badge>
        <Badge>{report.mode}</Badge>
      </div>
      <Link className="text-link" to={`/scans/${report.key}`}>
        打开报告
      </Link>
    </div>
  );
}

function Delta({ label, value }: { label: string; value: number }) {
  const tone = value > 0 ? "warning" : value < 0 ? "success" : "neutral";
  return (
    <article className="mini-metric">
      <span>{label}</span>
      <strong>{signed(value)}</strong>
      <Badge tone={tone}>
        {value === 0 ? "unchanged" : value > 0 ? "increased" : "decreased"}
      </Badge>
    </article>
  );
}

function ChangePanel<T>({
  title,
  changes,
  render,
}: {
  title: string;
  changes: {
    added: T[];
    removed: T[];
    changed: Array<{ before: T; after: T }>;
    unchanged: T[];
  };
  render: (item: T) => React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span>
          {changes.added.length} added · {changes.removed.length} removed ·{" "}
          {changes.changed.length} changed
        </span>
      </div>
      <div className="change-columns">
        <ChangeList
          title="Added"
          tone="success"
          items={changes.added}
          render={render}
        />
        <ChangeList
          title="Removed"
          tone="danger"
          items={changes.removed}
          render={render}
        />
        <div>
          <span className="field-label">Changed</span>
          {changes.changed.length === 0 ? (
            <p className="muted">None</p>
          ) : (
            <ul className="change-list">
              {changes.changed.map((item, index) => (
                <li key={index}>{render(item.after)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ChangeList<T>({
  title,
  tone,
  items,
  render,
}: {
  title: string;
  tone: "success" | "danger";
  items: T[];
  render: (item: T) => React.ReactNode;
}) {
  return (
    <div>
      <span className="field-label">
        <Badge tone={tone}>{title}</Badge>
      </span>
      {items.length === 0 ? (
        <p className="muted">None</p>
      ) : (
        <ul className="change-list">
          {items.map((item, index) => (
            <li key={index}>{render(item)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
