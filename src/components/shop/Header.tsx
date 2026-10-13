import Link from "next/link";
import CountryPicker from "./CountryPicker";

export default function Header({ country, signedIn }: { country: string; signedIn: boolean }) {
  return (
    <header className="border-b border-road-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-2 font-sign text-2xl font-bold tracking-tight">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden><rect width="26" height="26" rx="6" fill="#14171f" /><path d="M5 18 L21 8" stroke="#ffd23f" strokeWidth="3" strokeLinecap="round" /><circle cx="21" cy="8" r="2.5" fill="#fff" /></svg>
          Waypoint
        </Link>
        <nav className="ml-auto flex items-center gap-4 text-sm font-medium">
          <Link href="/watch" className="hidden hover:underline sm:inline">Price alerts</Link>
          <Link href="/how-we-earn" className="hidden hover:underline sm:inline">How we earn</Link>
          {!signedIn && <Link href="/login" className="whitespace-nowrap hover:underline">Sign in</Link>}
          <CountryPicker value={country} />
        </nav>
      </div>
    </header>
  );
}
