"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function EarningsImport() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const text = String(new FormData(e.currentTarget).get("csv") ?? "");
        const r = await fetch("/api/admin/earnings", { method: "POST", headers: { "Content-Type": "text/csv" }, body: text });
        const j = (await r.json()) as { imported?: number; error?: string };
        setMsg(r.ok ? `Imported ${j.imported} rows.` : j.error ?? "Failed");
        if (r.ok) router.refresh();
      }}
    >
      <textarea name="csv" rows={5} required className="w-full rounded-md border border-road-line bg-white p-2 font-mono text-xs" placeholder={"retailer,periodStart,periodEnd,clicks,orders,sales,commission,currency\nebay,2026-10-01,2026-10-31,1200,40,2100.50,63.02,USD"} />
      <button className="rounded-md bg-road-ink px-4 py-2 text-sm font-medium text-white">Import earnings</button>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </form>
  );
}
