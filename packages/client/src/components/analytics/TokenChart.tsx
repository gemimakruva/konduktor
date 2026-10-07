import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DailyData {
  date: string;
  inputTokens: number;
  outputTokens: number;
}

export function TokenChart({ data }: { data: DailyData[] }) {
  if (data.length === 0) {
    return <p style={{ color: 'var(--fg3)', fontSize: '0.8rem', textAlign: 'center', padding: '40px 0' }}>No token data yet</p>;
  }

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '16px' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px' }}>Token Usage</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--fg3)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--fg3)' }} />
          <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem' }} />
          <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
          <Line type="monotone" dataKey="inputTokens" name="Input" stroke="#7c3aed" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="outputTokens" name="Output" stroke="#06b6d4" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
