import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ChatPanel } from './components/chat/ChatPanel';
import { SessionsPage } from './components/sessions/SessionsPage';
import { SettingsPage } from './components/settings/SettingsPage';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ChatPanel />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}
