import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getDashboard } from "../api.js";
import { Badge, statusTone } from "../components/Badge.js";
import { EmptyState, ErrorState, LoadingState } from "../components/States.js";
import { barLevel, errorText, formatDate, shortSha } from "../lib.js";
import type { DashboardData } from "../types.js";

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setData(await getDashboard());
    } catch (caught) {
      setError(errorText(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maxTrend = useMemo(
    () =>
      Math.max(1, ...(data?.trends.map((item) => item.totalFindings) ?? [1])),
    [data],
  );

  if (error !== undefined)
    return <ErrorState message={error} retry={() => void load()} />;
  if (data === undefined)
    return <LoadingState label="正在聚合本地报告与 review queue…" />;
  if (data.reportCount === 0) {
    return (
      <>
        <PageHeading />
        <EmptyState
          title="还没有可读报告"
          body="先运行 decisiontrace scan。UI 只读取已生成的 canonical report.json，不会自动扫描或修改目标文件。"
        />
      </>
    );
  }

  const latest = data.latest!;
  return (
    <>
      <PageHeading />

      {(data.invalidReportCount > 0 || data.invalidReviewRecordCount > 0) && (
        <div className="notice notice-warning" role="status">
          <strong>存在无法信任的本地 artifact</strong>
          <span>
            {data.invalidReportCount} 份无效报告，
            {data.invalidReviewRecordCount} 条无效 review
            record。详情见扫描历史。
          </span>
        </div>
      )}

      <section className="metric-grid" aria-label="Latest scan metrics">
        <MetricCard
          label="Latest result"
          value={latest.result}
          meta={formatDate(latest.completedAt)}
          tone={latest.result}
        />
        <MetricCard
          label="Formal findings"
          value={String(latest.findings.formal)}
          meta={`${latest.findings.total} total`}
          tone={latest.findings.formal > 0 ? "formal" : "complete"}
        />
        <MetricCard
          label="Review queue"
          value={String(data.reviewQueue.unreviewedFindings)}
          meta={`${latest.reviewProgress.findingsReviewed} finding dispositions`}
          tone={
            data.reviewQueue.unreviewedFindings > 0 ? "partial" : "complete"
          }
        />
        <MetricCard
          label="Semantic queue"
          value={String(data.reviewQueue.unreviewedSemanticCandidates)}
          meta={`${latest.semanticCandidates} candidates`}
          tone={latest.semanticStatus}
        />
      </section>

      <div className="dashboard-grid">
        <section className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Trend</span>
              <h2>Finding volume</h2>
            </div>
            <span className="panel-meta">最近 {data.trends.length} 次扫描</span>
          </div>
          <div className="trend-chart" aria-label="Finding count trend">
            {data.trends.map((point) => (
              <Link
                className="trend-column"
                key={point.key}
                to={`/scans/${point.key}`}
                title={`${formatDate(point.completedAt)} · ${point.totalFindings} findings`}
              >
                <span
                  className={`trend-bar ${barLevel(point.totalFindings, maxTrend)}`}
                >
                  <span className="trend-bar-formal" />
                </span>
                <small>{point.totalFindings}</small>
              </Link>
            ))}
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-formal" /> Total findings
            </span>
            <span>
              <i className="legend-semantic" /> Semantic tracked separately
            </span>
          </div>
        </section>

        <section className="panel latest-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Latest revision</span>
              <h2>{shortSha(latest.head)}</h2>
            </div>
            <Badge tone={statusTone(latest.mode)}>{latest.mode}</Badge>
          </div>
          <dl className="compact-stats">
            <div>
              <dt>D1 conflicts</dt>
              <dd>{latest.findings.D1}</dd>
            </div>
            <div>
              <dt>D2 evidence gaps</dt>
              <dd>{latest.findings.D2}</dd>
            </div>
            <div>
              <dt>D3 change candidates</dt>
              <dd>{latest.findings.D3}</dd>
            </div>
            <div>
              <dt>Diagnostics</dt>
              <dd>{latest.diagnostics}</dd>
            </div>
          </dl>
          <Link
            className="button button-primary button-block"
            to={`/scans/${latest.key}`}
          >
            Review latest report →
          </Link>
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">History</span>
            <h2>Recent scans</h2>
          </div>
          <Link className="text-link" to="/scans">
            查看全部
          </Link>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Completed</th>
                <th>Revision</th>
                <th>Mode</th>
                <th>Result</th>
                <th>Findings</th>
                <th>Reviewed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.recentReports.map((report) => (
                <tr key={report.key}>
                  <td>{formatDate(report.completedAt)}</td>
                  <td>
                    <code>{shortSha(report.head)}</code>
                  </td>
                  <td>
                    <Badge tone="neutral">{report.mode}</Badge>
                  </td>
                  <td>
                    <Badge tone={statusTone(report.result)}>
                      {report.result}
                    </Badge>
                  </td>
                  <td>{report.findings.total}</td>
                  <td>
                    {report.reviewProgress.findingsReviewed}/
                    {report.findings.total}
                  </td>
                  <td>
                    <Link
                      className="row-link"
                      to={`/scans/${report.key}`}
                      aria-label={`Open ${report.scanId}`}
                    >
                      →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function PageHeading() {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">Overview</span>
        <h1>Contract drift at a glance</h1>
        <p>从最新 revision 出发，先处理未经 review 的高信号 finding。</p>
      </div>
      <div className="heading-actions">
        <Link className="button button-secondary" to="/compare">
          对比报告
        </Link>
        <Link className="button button-primary" to="/scans">
          打开历史
        </Link>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta: string;
  tone: string;
}) {
  return (
    <article className={`metric-card metric-${statusTone(tone)}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </article>
  );
}
