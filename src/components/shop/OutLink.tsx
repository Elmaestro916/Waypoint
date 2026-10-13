"use client";
import type { ReactNode } from "react";

/** A plain link to the store. The click is reported with sendBeacon so it never delays or sits in the path of the visit. */
export default function OutLink({ href, token, affiliate, className, children, label }: {
  href: string; token: string; affiliate: boolean; className?: string; children: ReactNode; label?: string;
}) {
  const report = () => {
    try {
      const body = new Blob([JSON.stringify({ t: token })], { type: "application/json" });
      if (!navigator.sendBeacon?.("/api/shop/click", body)) fetch("/api/shop/click", { method: "POST", body, keepalive: true }).catch(() => {});
    } catch {
      // reporting is best effort
    }
  };
  return (
    <a
      href={href}
      target="_blank"
      rel={`noopener noreferrer nofollow${affiliate ? " sponsored" : ""}`}
      onClick={report}
      onAuxClick={report}
      className={className}
      aria-label={label}
    >
      {children}
    </a>
  );
}
