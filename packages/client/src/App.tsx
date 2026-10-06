import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ChatPanel } from './components/chat/ChatPanel';
import { SessionsPage } from './components/sessions/SessionsPage';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ChatPanel />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/settings" element={<div style={{ padding: '24px', color: 'var(--fg2)' }}>Settings (coming next)</div>} />
      </Routes>
    </Layout>
  );
}
