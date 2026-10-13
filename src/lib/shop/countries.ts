export interface Country {
  code: string;
  name: string;
  currency: string;
  locale: string;
  ebayMarketplace: string; // marketplace used to search for this country (shipping filtered by deliveryCountry)
  ebayCurrency: string; // currency of that marketplace
  amazonDomain: string | null; // null = no Amazon store for this country
}

// Marketplace domains/IDs are from the stores' public docs; confirm before relying on a new country.
export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", currency: "USD", locale: "en-US", ebayMarketplace: "EBAY_US", ebayCurrency: "USD", amazonDomain: "www.amazon.com" },
  { code: "GB", name: "United Kingdom", currency: "GBP", locale: "en-GB", ebayMarketplace: "EBAY_GB", ebayCurrency: "GBP", amazonDomain: "www.amazon.co.uk" },
  { code: "CA", name: "Canada", currency: "CAD", locale: "en-CA", ebayMarketplace: "EBAY_CA", ebayCurrency: "CAD", amazonDomain: "www.amazon.ca" },
  { code: "AU", name: "Australia", currency: "AUD", locale: "en-AU", ebayMarketplace: "EBAY_AU", ebayCurrency: "AUD", amazonDomain: "www.amazon.com.au" },
  { code: "DE", name: "Germany", currency: "EUR", locale: "de-DE", ebayMarketplace: "EBAY_DE", ebayCurrency: "EUR", amazonDomain: "www.amazon.de" },
  { code: "FR", name: "France", currency: "EUR", locale: "fr-FR", ebayMarketplace: "EBAY_FR", ebayCurrency: "EUR", amazonDomain: "www.amazon.fr" },
  { code: "ES", name: "Spain", currency: "EUR", locale: "es-ES", ebayMarketplace: "EBAY_ES", ebayCurrency: "EUR", amazonDomain: "www.amazon.es" },
  { code: "IT", name: "Italy", currency: "EUR", locale: "it-IT", ebayMarketplace: "EBAY_IT", ebayCurrency: "EUR", amazonDomain: "www.amazon.it" },
  { code: "IN", name: "India", currency: "INR", locale: "en-IN", ebayMarketplace: "EBAY_US", ebayCurrency: "USD", amazonDomain: "www.amazon.in" },
  { code: "NG", name: "Nigeria", currency: "NGN", locale: "en-NG", ebayMarketplace: "EBAY_US", ebayCurrency: "USD", amazonDomain: null },
  { code: "GH", name: "Ghana", currency: "GHS", locale: "en-GH", ebayMarketplace: "EBAY_US", ebayCurrency: "USD", amazonDomain: null },
  { code: "KE", name: "Kenya", currency: "KES", locale: "en-KE", ebayMarketplace: "EBAY_US", ebayCurrency: "USD", amazonDomain: null },
  { code: "ZA", name: "South Africa", currency: "ZAR", locale: "en-ZA", ebayMarketplace: "EBAY_US", ebayCurrency: "USD", amazonDomain: "www.amazon.co.za" },
  { code: "EG", name: "Egypt", currency: "EGP", locale: "en-EG", ebayMarketplace: "EBAY_US", ebayCurrency: "USD", amazonDomain: "www.amazon.eg" },
  { code: "AE", name: "United Arab Emirates", currency: "AED", locale: "en-AE", ebayMarketplace: "EBAY_US", ebayCurrency: "USD", amazonDomain: "www.amazon.ae" },
  { code: "MX", name: "Mexico", currency: "MXN", locale: "es-MX", ebayMarketplace: "EBAY_US", ebayCurrency: "USD", amazonDomain: "www.amazon.com.mx" },
  { code: "BR", name: "Brazil", currency: "BRL", locale: "pt-BR", ebayMarketplace: "EBAY_US", ebayCurrency: "USD", amazonDomain: "www.amazon.com.br" },
];

export const DEFAULT_COUNTRY = "US";
const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));

export function getCountry(code: string | null | undefined): Country {
  return byCode.get((code ?? "").toUpperCase()) ?? byCode.get(DEFAULT_COUNTRY)!;
}

export function isSupportedCountry(code: string | null | undefined): boolean {
  return byCode.has((code ?? "").toUpperCase());
}

/** Country hint from the hosting platform's geo headers (Vercel, Cloudflare). Returns null when unknown. */
export function countryFromHeaders(h: { get(name: string): string | null }): string | null {
  const raw = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? h.get("cloudfront-viewer-country");
  return raw && isSupportedCountry(raw) ? raw.toUpperCase() : null;
}

export const COUNTRY_COOKIE = "country";
