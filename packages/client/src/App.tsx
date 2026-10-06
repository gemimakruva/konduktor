import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ChatPanel } from './components/chat/ChatPanel';
import { SessionsPage } from './components/sessions/SessionsPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { CapabilitiesPage } from './components/capabilities/CapabilitiesPage';
import { SystemPage } from './components/system/SystemPage';
import { LogsPage } from './components/logs/LogsPage';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ChatPanel />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/capabilities" element={<CapabilitiesPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/system" element={<SystemPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}
