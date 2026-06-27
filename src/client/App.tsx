import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { DashboardProvider } from "./context/DashboardProvider";
import { CompaniesPage } from "./routes/CompaniesPage";
import { CompanyDetailPage } from "./routes/CompanyDetailPage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { SourcesPage } from "./routes/SourcesPage";
import { StackPage } from "./routes/StackPage";
import { TodayPage } from "./routes/TodayPage";
import { UpdatesPage } from "./routes/UpdatesPage";

export function App() {
  return (
    <BrowserRouter>
      <DashboardProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<TodayPage />} />
            <Route path="updates" element={<UpdatesPage />} />
            <Route path="stack" element={<StackPage />} />
            <Route path="companies" element={<CompaniesPage />} />
            <Route path="companies/:ticker" element={<CompanyDetailPage />} />
            <Route path="sources" element={<SourcesPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </DashboardProvider>
    </BrowserRouter>
  );
}
