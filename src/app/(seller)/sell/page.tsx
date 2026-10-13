import Link from "next/link";

const features = [
  ["Opportunity radar", "Scans your niches, scores demand, margin and competition, and screens out restricted categories."],
  ["Profit digital twin", "4,000-run Monte-Carlo simulation of the first 90 days: P10/P50/P90 profit and probability of loss, before a dollar is spent."],
  ["AI listings", "Claude writes policy-aware titles, bullets and keywords for each product."],
  ["Self-tuning ads", "Thompson-sampling bidding learns each keyword's real conversion rate and pauses the ones that bleed."],
  ["Guardrailed repricing", "Tracks the Buy Box but never below your margin floor, with capped moves per cycle."],
  ["You stay in control", "Approval mode, spend caps, inventory caps and a full audit log. Nothing runs outside the limits you set."],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-sm font-medium text-accent">AMAZON AUTOPILOT</p>
      <h1 className="mt-3 text-4xl font-bold text-white sm:text-5xl">Pick a niche. The autopilot finds, launches and optimizes the products.</h1>
      <p className="mt-5 max-w-2xl text-lg text-slate-400">
        An AI engine that researches products, simulates risk, writes listings, runs Sponsored Products ads and reprices, inside budgets you control.
        Results are never guaranteed; the simulator is there to show you the downside.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/register" className="btn-primary">Get started</Link>
        <Link href="/login" className="btn-ghost">Sign in</Link>
      </div>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(([t, d]) => (
          <div key={t} className="card">
            <h3 className="font-semibold text-white">{t}</h3>
            <p className="mt-2 text-sm text-slate-400">{d}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
