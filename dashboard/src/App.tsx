import { Route, Routes } from "react-router";
import { MainLayout } from "./components/layout/main-layout";
import { DecisionsPage } from "./pages/decisions";
import { DecisionDetailPage } from "./pages/decisions/[id]";
import { NotFoundPage } from "./pages/not-found";
import { SessionsPage } from "./pages/sessions";
import { SessionDetailPage } from "./pages/sessions/[id]";

export default function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<SessionsPage />} />
        <Route path="/sessions/:id" element={<SessionDetailPage />} />
        <Route path="/decisions" element={<DecisionsPage />} />
        <Route path="/decisions/:id" element={<DecisionDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MainLayout>
  );
}
