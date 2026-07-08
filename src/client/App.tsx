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
import { NotFoundPage } from "./routes/NotFoundPage";
import { SourcesPage } from "./routes/SourcesPage";
import { SearchPage } from "./routes/SearchPage";
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

function LegacyBriefsRedirect() {
  const location = useLocation();
  const { briefId } = useParams();
  const parameters = new URLSearchParams(location.search);
  parameters.set("archive", "briefs");
  if (briefId) {
    parameters.set("brief", briefId);
  }
  return <Navigate replace to={`/?${parameters.toString()}`} />;
}

function LegacyStackRedirect() {
  const location = useLocation();
  const parameters = new URLSearchParams(location.search);
  parameters.set("context", "stack");
  return <Navigate replace to={`/theses?${parameters.toString()}`} />;
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
            <Route path="briefs" element={<LegacyBriefsRedirect />} />
            <Route path="briefs/:briefId" element={<LegacyBriefsRedirect />} />
            <Route path="signals" element={<UpdatesPage />} />
            <Route path="updates" element={<LegacyUpdatesRedirect />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="stack" element={<LegacyStackRedirect />} />
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
