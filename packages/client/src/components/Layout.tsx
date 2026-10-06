import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        minWidth: 0,
        padding: '16px',
        marginLeft: 'var(--sidebar-width)',
      }}>
        {children}
      </main>
    </div>
  );
}
