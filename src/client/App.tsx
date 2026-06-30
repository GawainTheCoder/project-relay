import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { DashboardProvider } from "./context/DashboardProvider";
import { BeliefDetailPage } from "./routes/BeliefDetailPage";
import { BeliefsPage } from "./routes/BeliefsPage";
import { BriefDetailPage } from "./routes/BriefDetailPage";
import { BriefsPage } from "./routes/BriefsPage";
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

function LegacyThesesRedirect() {
  const location = useLocation();
  const { beliefId } = useParams();
  const target = beliefId
    ? `/theses/${encodeURIComponent(beliefId)}`
    : "/theses";
  return <Navigate replace to={`${target}${location.search}`} />;
}

export function App() {
  return (
    <BrowserRouter>
      <DashboardProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<TodayPage />} />
            <Route path="theses" element={<BeliefsPage />} />
            <Route path="theses/:beliefId" element={<BeliefDetailPage />} />
            <Route path="briefs" element={<BriefsPage />} />
            <Route path="briefs/:briefId" element={<BriefDetailPage />} />
            <Route path="signals" element={<UpdatesPage />} />
            <Route path="updates" element={<LegacyUpdatesRedirect />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="stack" element={<StackPage />} />
            <Route path="beliefs" element={<LegacyThesesRedirect />} />
            <Route
              path="beliefs/:beliefId"
              element={<LegacyThesesRedirect />}
            />
            <Route path="companies" element={<LegacyThesesRedirect />} />
            <Route
              path="companies/:beliefId"
              element={<LegacyThesesRedirect />}
            />
            <Route path="sources" element={<SourcesPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </DashboardProvider>
    </BrowserRouter>
  );
}
