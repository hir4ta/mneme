import { Navigate, Route, Routes } from "react-router";
import { MainLayout } from "./components/layout/main-layout";
import { DevRulesPage } from "./pages/dev-rules";
import { GraphPage } from "./pages/graph";
import { GuidePage } from "./pages/guide";
import { GuideCommandsPage } from "./pages/guide/commands";
import { GuideFaqPage } from "./pages/guide/faq";
import { GuideUseCasesPage } from "./pages/guide/use-cases";
import { GuideWorkflowPage } from "./pages/guide/workflow";
import { NotFoundPage } from "./pages/not-found";
import { SessionsPage } from "./pages/sessions";
import { SessionDetailPage } from "./pages/sessions/[id]";
import { StatsPage } from "./pages/stats";

export default function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<SessionsPage />} />
        <Route path="/sessions/:id" element={<SessionDetailPage />} />
        <Route path="/dev-rules" element={<DevRulesPage />} />
        {/* Redirects for old routes */}
        <Route
          path="/decisions"
          element={<Navigate to="/dev-rules?type=decision" replace />}
        />
        <Route
          path="/decisions/:id"
          element={<Navigate to="/dev-rules?type=decision" replace />}
        />
        <Route
          path="/patterns"
          element={<Navigate to="/dev-rules?type=pattern" replace />}
        />
        <Route
          path="/rules"
          element={<Navigate to="/dev-rules?type=rule" replace />}
        />
        <Route path="/units" element={<Navigate to="/dev-rules" replace />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/guide/workflow" element={<GuideWorkflowPage />} />
        <Route path="/guide/commands" element={<GuideCommandsPage />} />
        <Route path="/guide/use-cases" element={<GuideUseCasesPage />} />
        <Route path="/guide/faq" element={<GuideFaqPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MainLayout>
  );
}
