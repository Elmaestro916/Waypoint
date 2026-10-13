"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

interface Item { kind: string; label: string; slug: string }

/** Search field with typeahead (ARIA combobox: arrow keys, Enter, Escape). Free text always searches; suggestions are shortcuts. */
export default function SearchBox({ initial = "", big = false, autoFocus = false }: { initial?: string; big?: boolean; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const id = useId();
  const seq = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  // Press "/" anywhere to jump to the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setItems([]); return; }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/shop/suggest?q=${encodeURIComponent(q.trim())}`);
        const j = (await r.json()) as { items: Item[] };
        if (n === seq.current) { setItems(j.items); setActive(-1); }
      } catch { /* suggestions are optional */ }
    }, 160);
    return () => clearTimeout(t);
  }, [q]);

  const go = (text: string) => {
    const v = text.trim();
    if (!v) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(v)}`);
  };
  const pick = (it: Item) => (it.kind === "brand" ? router.push(`/brand/${it.slug}`) : go(it.label));

  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); if (active >= 0 && items[active]) pick(items[active]); else go(q); }}
      className="relative w-full"
    >
      <div className={`flex items-center gap-2 rounded-xl border-2 border-road-ink bg-white focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-road-blue ${big ? "p-2 pl-5" : "p-1.5 pl-4"} shadow-[4px_4px_0_0_#14171f]`}>
        <input
          ref={input}
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
            else if (e.key === "Escape") setOpen(false);
          }}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          aria-label="What are you looking for?"
          placeholder="Nike Pegasus under $100, a used iPhone 13, ankara fabric…"
          autoComplete="off"
          maxLength={200}
          className={`min-w-0 flex-1 bg-transparent outline-none focus-visible:outline-none placeholder:text-road-mute/70 ${big ? "text-xl sm:text-2xl" : "text-base"} font-medium`}
        />
        <button type="submit" className={`shrink-0 rounded-lg bg-road-yellow font-sign font-bold text-road-ink hover:brightness-95 ${big ? "px-6 py-3 text-xl" : "px-4 py-2 text-lg"}`}>
          Find it
        </button>
      </div>
      {open && items.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-road-line bg-white shadow-lg">
          {items.map((it, i) => (
            <li key={`${it.kind}-${it.slug}`} id={`${id}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(it); }}
              className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm ${i === active ? "bg-road-wash" : ""}`}>
              <span className="truncate font-medium">{it.label}</span>
              <span className="shrink-0 text-xs text-road-mute">{it.kind === "brand" ? "Brand" : "Product"}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
