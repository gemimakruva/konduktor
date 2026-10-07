import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DailyData {
  date: string;
  cost: number;
}

export function CostChart({ data }: { data: DailyData[] }) {
  if (data.length === 0) {
    return <p style={{ color: 'var(--fg3)', fontSize: '0.8rem', textAlign: 'center', padding: '40px 0' }}>No cost data yet</p>;
  }

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '16px' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px' }}>Daily Cost</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--fg3)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--fg3)' }} tickFormatter={v => `$${v.toFixed(2)}`} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem' }}
            formatter={(v) => [`$${Number(v ?? 0).toFixed(4)}`, 'Cost']}
          />
          <Bar dataKey="cost" fill="#7c3aed" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
