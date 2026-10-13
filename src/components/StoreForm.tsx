"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StoreForm({ mode, connected }: { mode: string; connected: boolean }) {
  const router = useRouter();
  const [live, setLive] = useState(mode === "live");
  const [sellerId, setSellerId] = useState("");
  const [sp, setSp] = useState("");
  const [adsProfile, setAdsProfile] = useState("");
  const [ads, setAds] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/store", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: live ? "live" : "mock",
        ...(sellerId && { sellerId }),
        ...(sp && { spRefreshToken: sp }),
        ...(adsProfile && { adsProfileId: adsProfile }),
        ...(ads && { adsRefreshToken: ads }),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? "Saved." : j.error || "Failed");
    if (res.ok) {
      setSp("");
      setAds("");
      router.refresh();
    }
  }

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold text-white">Amazon account</h2>
      <p className="text-sm text-slate-400">
        Simulation mode needs nothing and is the safe way to try the product. Live mode uses the real Selling Partner and Ads APIs and
        needs a registered SP-API app plus your authorised refresh tokens. Tokens are encrypted at rest and never shown again.
        {connected && " A seller account is already connected."}
      </p>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
        Use live Amazon APIs (real listings, real ad spend)
      </label>
      {live && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Seller ID</label><input className="input" value={sellerId} onChange={(e) => setSellerId(e.target.value)} /></div>
          <div><label className="label">SP-API refresh token</label><input className="input" type="password" value={sp} onChange={(e) => setSp(e.target.value)} /></div>
          <div><label className="label">Ads profile ID</label><input className="input" value={adsProfile} onChange={(e) => setAdsProfile(e.target.value)} /></div>
          <div><label className="label">Ads refresh token</label><input className="input" type="password" value={ads} onChange={(e) => setAds(e.target.value)} /></div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</button>
        {msg && <span className="text-sm text-slate-400">{msg}</span>}
      </div>
    </div>
  );
}
