/** Dependency-free SVG bar chart: green above zero, red below. */
export default function BarChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-slate-500">No data yet. Run a cycle to generate activity.</p>;
  const W = 640;
  const H = 160;
  const pad = 24;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const bw = (W - pad * 2) / data.length;
  const mid = H / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img" aria-label="Daily profit">
      <line x1={pad} x2={W - pad} y1={mid} y2={mid} stroke="#2b3856" />
      {data.map((d, i) => {
        const h = (Math.abs(d.value) / max) * (mid - 14);
        const x = pad + i * bw + bw * 0.15;
        return (
          <g key={d.label}>
            <rect x={x} y={d.value >= 0 ? mid - h : mid} width={bw * 0.7} height={Math.max(h, 1)} rx={2} fill={d.value >= 0 ? "#34d399" : "#f87171"}>
              <title>{`${d.label}: ${d.value.toFixed(2)}`}</title>
            </rect>
            {(data.length <= 10 || i % 2 === 0) && (
              <text x={x + bw * 0.35} y={H - 2} textAnchor="middle" fontSize="9" fill="#94a3b8">{d.label.slice(5)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
