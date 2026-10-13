"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface S {
  enabled: boolean;
  approvalMode: boolean;
  niches: string;
  monthlyAdBudget: number;
  maxLaunchBudget: number;
  maxActiveProducts: number;
  minMarginPct: number;
  targetAcos: number;
  maxProbLoss: number;
  minScore: number;
}

export default function SettingsForm({ initial }: { initial: S }) {
  const router = useRouter();
  const [s, setS] = useState<S>(initial);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const num = (k: keyof S) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });

  async function save() {
    if (!s.approvalMode && !window.confirm("Approval mode OFF lets the autopilot list products and spend on ads without asking, up to your caps. Continue?")) return;
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? "Saved." : j.error || "Failed");
    if (res.ok) router.refresh();
  }

  return (
    <div className="card space-y-5">
      <h2 className="font-semibold text-white">Autopilot</h2>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
        Autopilot enabled (finds and prepares new products each cycle)
      </label>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={s.approvalMode} onChange={(e) => setS({ ...s, approvalMode: e.target.checked })} />
        Require my approval before launching products and starting ad spend (recommended)
      </label>
      <div>
        <label className="label">Niches (comma separated)</label>
        <input className="input" value={s.niches} onChange={(e) => setS({ ...s, niches: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div><label className="label">Monthly ad budget ($)</label><input className="input" type="number" min={0} value={s.monthlyAdBudget} onChange={num("monthlyAdBudget")} /></div>
        <div><label className="label">Max inventory capital ($)</label><input className="input" type="number" min={0} value={s.maxLaunchBudget} onChange={num("maxLaunchBudget")} /></div>
        <div><label className="label">Max live products</label><input className="input" type="number" min={1} value={s.maxActiveProducts} onChange={num("maxActiveProducts")} /></div>
        <div><label className="label">Min net margin (%)</label><input className="input" type="number" min={0} max={80} value={s.minMarginPct} onChange={num("minMarginPct")} /></div>
        <div><label className="label">Target ACoS (0-1)</label><input className="input" type="number" step="0.01" min={0.05} max={0.9} value={s.targetAcos} onChange={num("targetAcos")} /></div>
        <div><label className="label">Max simulated P(loss) (0-1)</label><input className="input" type="number" step="0.05" min={0.05} max={0.95} value={s.maxProbLoss} onChange={num("maxProbLoss")} /></div>
        <div><label className="label">Min opportunity score</label><input className="input" type="number" min={0} max={100} value={s.minScore} onChange={num("minScore")} /></div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Saving..." : "Save settings"}</button>
        {msg && <span className="text-sm text-slate-400">{msg}</span>}
      </div>
    </div>
  );
}
