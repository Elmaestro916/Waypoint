"use client";
import { useState } from "react";

/** Native share sheet on phones (WhatsApp, Messages...), WhatsApp link on desktop as the fallback. */
export default function ShareButton({ title, path }: { title: string; path: string }) {
  const [done, setDone] = useState(false);
  const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          if (navigator.share) { await navigator.share({ title, url }); return; }
        } catch { return; /* user closed the share sheet */ }
        window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, "_blank", "noopener,noreferrer");
        setDone(true);
      }}
      className="text-sm font-medium text-road-blue underline"
    >
      {done ? "Opened WhatsApp" : "Share"}
    </button>
  );
}
