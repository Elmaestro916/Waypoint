"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ActionButton({
  url,
  body,
  method = "POST",
  children,
  variant = "ghost",
  confirm,
}: {
  url: string;
  body?: unknown;
  method?: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "danger";
  confirm?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Request failed");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button className={`btn-${variant}`} onClick={run} disabled={busy}>
        {busy ? "Working..." : children}
      </button>
      {err && <span className="max-w-xs text-xs text-red-400">{err}</span>}
    </span>
  );
}
