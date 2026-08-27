import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { getSession } from "../api.js";

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

export function Layout() {
  const [version, setVersion] = useState("local");

  useEffect(() => {
    void getSession()
      .then((session) => setVersion(`v${session.toolVersion}`))
      .catch(() => setVersion("API unavailable"));
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            DT
          </div>
          <div>
            <strong>DecisionTrace</strong>
            <span>Review Console</span>
          </div>
        </div>
        <nav aria-label="主导航">
          <NavLink className={navClass} to="/" end>
            <span aria-hidden="true">⌂</span> Dashboard
          </NavLink>
          <NavLink className={navClass} to="/scans">
            <span aria-hidden="true">≡</span> 扫描历史
          </NavLink>
          <NavLink className={navClass} to="/compare">
            <span aria-hidden="true">⇄</span> 报告对比
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>Local-only UI</strong>
            <span>{version} · 127.0.0.1</span>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">Product contract observability</span>
          </div>
          <div className="topbar-note">
            <span className="status-dot" aria-hidden="true" />
            报告只读 · Disposition 追加记录
          </div>
        </header>
        <div className="page-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
