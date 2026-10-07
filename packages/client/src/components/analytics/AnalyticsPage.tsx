import { useState, useEffect, useCallback } from 'react';
import { TokenChart } from './TokenChart';
import { CostChart } from './CostChart';
import { ModelBreakdown } from './ModelBreakdown';

interface Summary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  totalSessions: number;
  avgCostPerSession: number;
}

interface DailyData {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  sessions: number;
}

interface ModelData {
  model: string;
  count: number;
  totalTokens: number;
  totalCost: number;
}

const PERIODS = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
  { label: 'All time', value: '' },
];

export function AnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [models, setModels] = useState<ModelData[]>([]);

  const refresh = useCallback(async () => {
    try {
      const qs = period ? `?period=${period}` : '';
      const [s, d, m] = await Promise.all([
        fetch(`/api/analytics/summary${qs}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/analytics/daily${qs}`).then(r => r.ok ? r.json() : []),
        fetch(`/api/analytics/models${qs}`).then(r => r.ok ? r.json() : []),
      ]);
      if (s) setSummary(s);
      setDaily(d);
      setModels(m);
    } catch { /* network error */ }
  }, [period]);

  useEffect(() => { refresh(); }, [refresh]);

  const cardStyle = {
    padding: '14px 18px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--bg-surface)',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Analytics</h2>
        <div style={{ display: 'flex', gap: '4px' }}>
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)} style={{
              padding: '4px 12px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 500,
              background: period === p.value ? 'var(--purple)' : 'var(--bg-surface)',
              color: period === p.value ? 'white' : 'var(--fg3)',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.7rem', color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Tokens</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{(summary.totalInputTokens + summary.totalOutputTokens).toLocaleString()}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.7rem', color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Cost</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>${summary.totalCost.toFixed(2)}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.7rem', color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sessions</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{summary.totalSessions}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '0.7rem', color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg / Session</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>${summary.avgCostPerSession.toFixed(4)}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <TokenChart data={daily} />
        <CostChart data={daily} />
      </div>
      <ModelBreakdown data={models} />
    </div>
  );
}
