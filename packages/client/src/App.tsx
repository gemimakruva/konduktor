import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ChatPanel } from './components/chat/ChatPanel';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ChatPanel />} />
        <Route path="/sessions" element={<div style={{ padding: '24px', color: 'var(--fg2)' }}>Sessions (coming next)</div>} />
        <Route path="/settings" element={<div style={{ padding: '24px', color: 'var(--fg2)' }}>Settings (coming next)</div>} />
      </Routes>
    </Layout>
  );
}
