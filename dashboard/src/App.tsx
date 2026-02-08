import { Route, Routes } from "react-router";
import { MainLayout } from "./components/layout/main-layout";
import { DecisionsPage } from "./pages/decisions";
import { DecisionDetailPage } from "./pages/decisions/[id]";
import { GraphPage } from "./pages/graph";
import { GuidePage } from "./pages/guide";
import { GuideCommandsPage } from "./pages/guide/commands";
import { GuideFaqPage } from "./pages/guide/faq";
import { GuideUseCasesPage } from "./pages/guide/use-cases";
import { GuideWorkflowPage } from "./pages/guide/workflow";
import { NotFoundPage } from "./pages/not-found";
import { PatternsPage } from "./pages/patterns";
import { RulesPage } from "./pages/rules";
import { SessionsPage } from "./pages/sessions";
import { SessionDetailPage } from "./pages/sessions/[id]";
import { StatsPage } from "./pages/stats";
import { UnitsPage } from "./pages/units";

export default function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<SessionsPage />} />
        <Route path="/sessions/:id" element={<SessionDetailPage />} />
        <Route path="/decisions" element={<DecisionsPage />} />
        <Route path="/decisions/:id" element={<DecisionDetailPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/patterns" element={<PatternsPage />} />
        <Route path="/units" element={<UnitsPage />} />
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
