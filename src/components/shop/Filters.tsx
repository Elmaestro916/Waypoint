"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/** Filters live in the URL, so every filtered view can be shared and the back button works. */
export default function Filters({ currency }: { currency: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [min, setMin] = useState(sp.get("min") ?? "");
  const [max, setMax] = useState(sp.get("max") ?? "");

  const push = (changes: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) (v ? n.set(k, v) : n.delete(k));
    n.delete("page");
    router.push(`${path}?${n.toString()}`);
  };
  const cond = sp.get("condition") ?? "";
  const sort = sp.get("sort") ?? "relevance";
  const active = ["min", "max", "condition", "brand"].some((k) => sp.get(k));

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-y border-road-line py-3 text-sm">
      <fieldset>
        <legend className="mb-1 text-road-mute">Condition</legend>
        <div className="flex overflow-hidden rounded-md border border-road-line bg-white">
          {[["", "Any"], ["new", "New"], ["used", "Used"]].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={cond === v} onClick={() => push({ condition: v || null })}
              className={`px-3 py-1.5 font-medium ${cond === v ? "bg-road-ink text-white" : "hover:bg-road-wash"}`}>{l}</button>
          ))}
        </div>
      </fieldset>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); push({ min: min || null, max: max || null }); }}>
        <label>
          <span className="mb-1 block text-road-mute">Min ({currency})</span>
          <input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value.replace(/[^\d.]/g, ""))} className="w-24 rounded-md border border-road-line bg-white px-2 py-1.5" />
        </label>
        <label>
          <span className="mb-1 block text-road-mute">Max</span>
          <input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value.replace(/[^\d.]/g, ""))} className="w-24 rounded-md border border-road-line bg-white px-2 py-1.5" />
        </label>
        <button className="rounded-md border border-road-ink px-3 py-1.5 font-medium hover:bg-road-wash">Apply</button>
      </form>
      <label>
        <span className="mb-1 block text-road-mute">Sort</span>
        <select value={sort} onChange={(e) => push({ sort: e.target.value === "relevance" ? null : e.target.value })} className="rounded-md border border-road-line bg-white px-2 py-1.5 font-medium">
          <option value="relevance">Best match</option>
          <option value="price_asc">Price, low to high</option>
          <option value="price_desc">Price, high to low</option>
          <option value="rating">Top rated</option>
        </select>
      </label>
      {active && (
        <button type="button" onClick={() => { setMin(""); setMax(""); push({ min: null, max: null, condition: null, brand: null }); }} className="pb-1.5 font-medium text-road-blue underline">
          Clear filters
        </button>
      )}
    </div>
  );
}
