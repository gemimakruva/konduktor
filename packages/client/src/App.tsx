import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ChatPanel } from './components/chat/ChatPanel';
import { SessionsPage } from './components/sessions/SessionsPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { CapabilitiesPage } from './components/capabilities/CapabilitiesPage';
import { SystemPage } from './components/system/SystemPage';
import { LogsPage } from './components/logs/LogsPage';
import { KanbanPage } from './components/kanban/KanbanPage';
import { AgentWatch } from './components/agents/AgentWatch';
import { AnalyticsPage } from './components/analytics/AnalyticsPage';
import { SchedulesPage } from './components/schedules/SchedulesPage';
import { ArtifactsPage } from './components/artifacts/ArtifactsPage';
import { ProfilesPage } from './components/profiles/ProfilesPage';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ChatPanel />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/agents" element={<AgentWatch />} />
        <Route path="/capabilities" element={<CapabilitiesPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/system" element={<SystemPage />} />
        <Route path="/kanban" element={<KanbanPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/schedules" element={<SchedulesPage />} />
        <Route path="/artifacts" element={<ArtifactsPage />} />
        <Route path="/profiles" element={<ProfilesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
