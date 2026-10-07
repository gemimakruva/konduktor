import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ModelData {
  model: string;
  count: number;
  totalTokens: number;
  totalCost: number;
}

const COLORS = ['#7c3aed', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

export function ModelBreakdown({ data }: { data: ModelData[] }) {
  if (data.length === 0) {
    return <p style={{ color: 'var(--fg3)', fontSize: '0.8rem', textAlign: 'center', padding: '40px 0' }}>No model data yet</p>;
  }

  const chartData = data.map(d => ({
    name: d.model.replace('claude-', ''),
    value: d.totalCost,
    count: d.count,
  }));

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '16px' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px' }}>Model Usage</h3>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name }) => name}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem' }}
            formatter={(v) => [`$${Number(v ?? 0).toFixed(4)}`, 'Cost']}
          />
          <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
