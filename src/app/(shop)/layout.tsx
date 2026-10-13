import Footer from "@/components/shop/Footer";
import Header from "@/components/shop/Header";
import { shopCountry, signedInUserId } from "@/lib/shop/server";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [country, uid] = [shopCountry(), await signedInUserId()];
  return (
    <div className="min-h-screen bg-paper text-road-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to results</a>
      <Header country={country.code} signedIn={Boolean(uid)} />
      <main id="main">{children}</main>
      <Footer />
    </div>
  );
}
