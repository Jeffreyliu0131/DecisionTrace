import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getHistory } from "../api.js";
import { Badge, statusTone } from "../components/Badge.js";
import { EmptyState, ErrorState, LoadingState } from "../components/States.js";
import { errorText, formatDate, shortSha } from "../lib.js";
import type { ReportHistory } from "../types.js";

export function HistoryPage() {
  const [history, setHistory] = useState<ReportHistory>();
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("all");
  const [result, setResult] = useState("all");

  const load = useCallback(async () => {
    try {
      setError(undefined);
      setHistory(await getHistory());
    } catch (caught) {
      setError(errorText(caught));
    }
  }, []);

  useEffect(() => void load(), [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (history?.reports ?? []).filter((report) => {
      if (mode !== "all" && report.mode !== mode) return false;
      if (result !== "all" && report.result !== result) return false;
      if (needle === "") return true;
      return [report.scanId, report.head, report.base ?? "", report.key]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [history, mode, result, search]);

  if (error !== undefined)
    return <ErrorState message={error} retry={() => void load()} />;
  if (history === undefined) return <LoadingState />;

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">History</span>
          <h1>扫描历史</h1>
          <p>每一项都来自通过 runtime schema 的 canonical report.json。</p>
        </div>
        <Link className="button button-secondary" to="/compare">
          进入报告对比
        </Link>
      </div>

      <section className="filter-bar" aria-label="History filters">
        <label className="search-field">
          <span>搜索</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Scan ID、revision 或 report key"
          />
        </label>
        <label>
          <span>Mode</span>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="all">All</option>
            <option value="full">Full</option>
            <option value="diff">Diff</option>
          </select>
        </label>
        <label>
          <span>Result</span>
          <select
            value={result}
            onChange={(event) => setResult(event.target.value)}
          >
            <option value="all">All</option>
            <option value="complete">Complete</option>
            <option value="partial">Partial</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <span className="filter-count">
          {filtered.length} / {history.reports.length}
        </span>
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          title="没有匹配的扫描"
          body="调整筛选条件，或先用 CLI 生成 report bundle。"
        />
      ) : (
        <section className="panel table-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Completed</th>
                  <th>Revision</th>
                  <th>Mode</th>
                  <th>Result</th>
                  <th>D1 / D2 / D3</th>
                  <th>Formal</th>
                  <th>Semantic</th>
                  <th>Review</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((report) => (
                  <tr key={report.key}>
                    <td>
                      <strong>{formatDate(report.completedAt)}</strong>
                      <small className="table-subtitle">{report.scanId}</small>
                    </td>
                    <td>
                      <code>{shortSha(report.head)}</code>
                    </td>
                    <td>
                      <Badge>{report.mode}</Badge>
                    </td>
                    <td>
                      <Badge tone={statusTone(report.result)}>
                        {report.result}
                      </Badge>
                    </td>
                    <td>
                      {report.findings.D1} / {report.findings.D2} /{" "}
                      {report.findings.D3}
                    </td>
                    <td>{report.findings.formal}</td>
                    <td>
                      <Badge tone={statusTone(report.semanticStatus)}>
                        {report.semanticCandidates} · {report.semanticStatus}
                      </Badge>
                    </td>
                    <td>
                      {report.reviewProgress.findingsReviewed}/
                      {report.findings.total}
                    </td>
                    <td>
                      <Link className="row-link" to={`/scans/${report.key}`}>
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(history.invalidReports.length > 0 ||
        history.reviewDiagnostics.length > 0) && (
        <section className="panel diagnostics-panel">
          <details>
            <summary>
              无法信任的本地 artifact（
              {history.invalidReports.length + history.reviewDiagnostics.length}
              ）
            </summary>
            <ul className="diagnostic-list">
              {history.invalidReports.map((item) => (
                <li key={item.relativePath}>
                  <code>{item.relativePath}</code>
                  <span>{item.error}</span>
                </li>
              ))}
              {history.reviewDiagnostics.map((item) => (
                <li key={`${item.source}-${item.line}`}>
                  <code>
                    {item.source}:{item.line}
                  </code>
                  <span>{item.error}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </>
  );
}
