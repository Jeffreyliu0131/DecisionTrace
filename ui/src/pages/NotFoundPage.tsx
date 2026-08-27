import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="not-found">
      <span>404</span>
      <h1>这个本地页面不存在</h1>
      <p>报告可能已被清理，或 URL 中的 report key 已失效。</p>
      <Link className="button button-primary" to="/">
        返回 Dashboard
      </Link>
    </div>
  );
}
