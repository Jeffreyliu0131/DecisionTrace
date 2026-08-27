import { BrowserRouter, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout.js";
import { ComparePage } from "./pages/ComparePage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { ReportPage } from "./pages/ReportPage.js";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="scans" element={<HistoryPage />} />
          <Route path="scans/:reportKey" element={<ReportPage />} />
          <Route path="compare" element={<ComparePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
