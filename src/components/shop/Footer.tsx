import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-road-line bg-white">
      <div className="mx-auto max-w-6xl space-y-3 px-5 py-8 text-sm text-road-mute">
        <p>
          Links marked with a yellow dot are affiliate links: if you buy through them the store may pay us a commission, and it never changes your price.
          Stores aren&rsquo;t paid to rank higher. <Link href="/how-we-earn" className="underline">How ranking and earnings work</Link>.
        </p>
        <p>Prices and stock come from the stores and can change before you check out. The store you click through to sets the final price, shipping and returns.</p>
        <p>
          {process.env.AMAZON_PARTNER_TAG ? "As an Amazon Associate we earn from qualifying purchases. " : ""}Waypoint is not affiliated with the stores listed.{" "}
          <Link href="/sell" className="underline">Selling online? See the seller autopilot</Link>.
        </p>
      </div>
    </footer>
  );
}
