"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { COUNTRIES } from "@/lib/shop/countries";

export default function CountryPicker({ value }: { value: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm text-road-mute">
      <span className="sr-only">Shipping to</span>
      <span aria-hidden className="hidden sm:inline">Ships to</span>
      <select
        value={value}
        disabled={pending}
        onChange={async (e) => {
          await fetch("/api/shop/country", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country: e.target.value }) });
          start(() => router.refresh());
        }}
        className="rounded-md border border-road-line bg-white px-2 py-1.5 text-sm font-medium text-road-ink"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>{c.name}</option>
        ))}
      </select>
    </label>
  );
}
