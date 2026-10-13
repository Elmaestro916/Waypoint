import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

const nav = [
  ["/dashboard", "Overview"],
  ["/dashboard/opportunities", "Opportunities"],
  ["/dashboard/products", "Products"],
  ["/dashboard/campaigns", "Ad campaigns"],
  ["/dashboard/activity", "Activity log"],
  ["/dashboard/settings", "Autopilot & store"],
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const mock = user.store.mode !== "live";
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-1 border-b border-ink-700 bg-ink-900 p-4 md:w-60 md:border-b-0 md:border-r">
        <p className="mb-3 text-sm font-bold tracking-wide text-accent">AMAZON AUTOPILOT</p>
        {nav.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-ink-800">
            {label}
          </Link>
        ))}
        <div className="mt-auto space-y-2 pt-6">
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-5 md:p-8">
        {mock && (
          <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            Simulation mode: the marketplace is simulated, so no real listings, ads or money are involved. Connect a live account under Autopilot &amp; store.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
