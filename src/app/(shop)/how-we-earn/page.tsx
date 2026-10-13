import type { Metadata } from "next";

export const metadata: Metadata = { title: "How we earn" };

export default function Page() {
  return (
    <article className="mx-auto max-w-2xl px-5 py-12 text-lg leading-relaxed">
      <h1 className="font-sign text-5xl font-bold">How Waypoint earns, and how we rank</h1>
      <p className="mt-6">Waypoint is free to use. When you open a store through a link marked with a yellow dot and then buy, that store may pay us a commission. It never changes the price you pay.</p>
      <h2 className="mt-8 font-sign text-3xl font-semibold">Ranking</h2>
      <p className="mt-2">Results are ordered by how well they match your words, whether the item is in stock, how many stores carry it, and rating where a store provides one. Commission rates are not an input. Stores can&rsquo;t pay to rank higher.</p>
      <h2 className="mt-8 font-sign text-3xl font-semibold">What we can and can&rsquo;t see</h2>
      <p className="mt-2">Prices come from store feeds and APIs and can change before you check out, so each price shows when we read it. Some stores don&rsquo;t share product data; for those we open their own search page for your query and show no price.</p>
      <h2 className="mt-8 font-sign text-3xl font-semibold">Amazon</h2>
      <p className="mt-2">Amazon results appear in their own section because Amazon controls how its prices may be shown. We earn from qualifying Amazon purchases made through our links.</p>
      <h2 className="mt-8 font-sign text-3xl font-semibold">Your data</h2>
      <p className="mt-2">We record the searches you run and which store links you open, tied to a daily-rotating anonymous code, not your IP address. If you create an account for price alerts, we store your email and the alerts you set.</p>
    </article>
  );
}
