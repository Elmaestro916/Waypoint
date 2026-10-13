import { requireUser } from "@/lib/auth";
import SettingsForm from "@/components/SettingsForm";
import StoreForm from "@/components/StoreForm";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const u = await requireUser();
  const s = u.settings;
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold text-white">Autopilot &amp; store</h1>
      <SettingsForm
        initial={{
          enabled: s.enabled,
          approvalMode: s.approvalMode,
          niches: s.niches,
          monthlyAdBudget: s.monthlyAdBudget,
          maxLaunchBudget: s.maxLaunchBudget,
          maxActiveProducts: s.maxActiveProducts,
          minMarginPct: s.minMarginPct,
          targetAcos: s.targetAcos,
          maxProbLoss: s.maxProbLoss,
          minScore: s.minScore,
        }}
      />
      <StoreForm mode={u.store.mode} connected={!!u.store.spRefreshToken} />
    </div>
  );
}
