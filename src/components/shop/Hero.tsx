import SearchBox from "./SearchBox";

// A tangled route (every store, every tab) straightens into one line that ends at the thing you wanted.
const TANGLE = "M16 60 C 80 4, 120 116, 190 48 S 290 6, 330 70 S 420 112, 460 34 S 550 6, 600 68 S 690 108, 750 60";
const STRAIGHT = "M16 60 L 750 60";

export default function Hero({ examples }: { examples: string[] }) {
  return (
    <section className="mx-auto max-w-5xl px-5 pb-10 pt-12 sm:pt-20">
      <h1 className="max-w-3xl font-sign text-5xl font-bold leading-[0.95] tracking-tight sm:text-7xl">
        Say what you want.<br />We&rsquo;ll point to every store that sells it.
      </h1>
      <svg viewBox="0 0 780 120" className="mt-6 h-auto w-full" role="img" aria-label="A tangled route straightening into one direct line to the product">
        <path d={TANGLE} pathLength={1} className="route-tangle" fill="none" stroke="#9aa1b1" strokeWidth="4" strokeLinecap="round" />
        <path d={STRAIGHT} pathLength={1} className="route-straight" fill="none" stroke="#ffd23f" strokeWidth="9" strokeLinecap="round" />
        <g className="route-pin" style={{ transformOrigin: "750px 60px", transformBox: "view-box" }}>
          <circle cx="750" cy="60" r="13" fill="#14171f" />
          <circle cx="750" cy="60" r="5" fill="#ffd23f" />
        </g>
      </svg>
      <SearchBox big autoFocus />
      <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-base text-road-mute">
        Try
        {examples.map((e) => (
          <a key={e} href={`/search?q=${encodeURIComponent(e)}`} className="rounded-full border border-road-line bg-white px-3 py-1 text-road-ink hover:border-road-ink">
            {e}
          </a>
        ))}
      </p>
    </section>
  );
}
