import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { DashboardProvider } from "./context/DashboardProvider";
import { BriefDetailPage } from "./routes/BriefDetailPage";
import { BriefsPage } from "./routes/BriefsPage";
import { CompaniesPage } from "./routes/CompaniesPage";
import { CompanyDetailPage } from "./routes/CompanyDetailPage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { SourcesPage } from "./routes/SourcesPage";
import { SearchPage } from "./routes/SearchPage";
import { StackPage } from "./routes/StackPage";
import { TodayPage } from "./routes/TodayPage";
import { UpdatesPage } from "./routes/UpdatesPage";

function LegacyUpdatesRedirect() {
  const location = useLocation();
  return <Navigate replace to={`/signals${location.search}`} />;
}

export function App() {
  return (
    <BrowserRouter>
      <DashboardProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<TodayPage />} />
            <Route path="briefs" element={<BriefsPage />} />
            <Route path="briefs/:briefId" element={<BriefDetailPage />} />
            <Route path="signals" element={<UpdatesPage />} />
            <Route path="updates" element={<LegacyUpdatesRedirect />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="stack" element={<StackPage />} />
            <Route path="theses" element={<CompaniesPage />} />
            <Route path="theses/:ticker" element={<CompanyDetailPage />} />
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
