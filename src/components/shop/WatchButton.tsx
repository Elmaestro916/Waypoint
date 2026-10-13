"use client";
import { useState } from "react";

export default function WatchButton({ productId, currency, country, suggested, signedIn }: {
  productId: string; currency: string; country: string; suggested: number; signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(String(Math.floor(suggested * 0.9)));
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  if (!signedIn) return <a href="/login" className="text-sm font-medium text-road-blue underline">Sign in to watch the price</a>;
  if (state === "done") return <span className="text-sm font-medium text-emerald-700">Watching. We&rsquo;ll email you at {price} {currency} or less.</span>;

  return open ? (
    <form
      className="flex flex-wrap items-center gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        const r = await fetch("/api/shop/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, targetPrice: Number(price), currency, country }) });
        if (r.ok) setState("done");
        else { setState("error"); setMsg(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save"); }
      }}
    >
      <label className="flex items-center gap-1.5">Tell me at or below <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} className="w-24 rounded-md border border-road-line px-2 py-1" /> {currency}</label>
      <button disabled={state === "saving" || !Number(price)} className="rounded-md bg-road-ink px-3 py-1 font-medium text-white disabled:opacity-50">Watch</button>
      {state === "error" && <span role="alert" className="text-red-700">{msg}</span>}
    </form>
  ) : (
    <button onClick={() => setOpen(true)} className="text-sm font-medium text-road-blue underline">Watch this price</button>
  );
}
