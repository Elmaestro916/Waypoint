import Anthropic from "@anthropic-ai/sdk";
import type { CatalogItem } from "../amazon/types";

/**
 * All AI features degrade gracefully: with no ANTHROPIC_API_KEY (or on any API error) the engine
 * falls back to deterministic heuristics/templates, so the app never blocks on the model.
 */
const key = process.env.ANTHROPIC_API_KEY;
const client = key ? new Anthropic({ apiKey: key }) : null;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export const aiEnabled = () => client !== null;

function extractJson<T>(text: string): T {
  const start = text.search(/[\[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start < 0 || end < 0) throw new Error("no JSON in model output");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

async function askJson<T>(system: string, user: string, fallback: () => T): Promise<T> {
  if (!client) return fallback();
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return extractJson<T>(text);
  } catch (e) {
    console.error("[ai] falling back:", (e as Error).message);
    return fallback();
  }
}

// ---------------------------------------------------------------- opportunity analysis
export interface OppInsight {
  asin: string;
  angle: string; // differentiation angle for a private-label or improved variant
  risks: string; // IP / compliance / saturation concerns
  rationale: string;
  verdict: "pursue" | "skip";
}

export async function analyzeOpportunities(items: CatalogItem[]): Promise<OppInsight[]> {
  const fallback = (): OppInsight[] =>
    items.map((i) => ({
      asin: i.asin,
      angle: `Bundle ${i.title} with a complementary accessory and a higher-quality material than the top reviews complain about.`,
      risks: "Check for existing patents/trademarks and category gating before sourcing. COGS is an assumption.",
      rationale: `~${i.estMonthlyUnits} units/mo demand with ${i.sellerCount} sellers and ${i.reviewCount} reviews at $${i.price}.`,
      verdict: "pursue",
    }));

  return askJson<OppInsight[]>(
    "You are a rigorous Amazon FBA product analyst. You never recommend infringing brands, patented designs, restricted/gated categories, or health/safety-regulated goods. Respond with JSON only.",
    `Analyze these Amazon catalog candidates. For each, return an object {asin, angle, risks, rationale, verdict}.
- angle: one concrete way a NEW private-label seller could differentiate (quality, bundle, design fix) without copying a protected design.
- risks: specific IP, compliance, saturation or seasonality risks.
- rationale: 1-2 sentences grounded ONLY in the provided numbers.
- verdict: "skip" if risk is high or numbers are weak, else "pursue".
Return a JSON array in the same order.

${JSON.stringify(items, null, 1)}`,
    fallback,
  );
}

// ---------------------------------------------------------------- listing copy
export interface ListingCopy {
  title: string;
  bullets: string[];
  description: string;
  keywords: string[];
}

export async function writeListing(p: { productName: string; category: string; angle: string; price: number }): Promise<ListingCopy> {
  const fallback = (): ListingCopy => {
    const base = p.productName;
    return {
      title: `${base} - Durable, Easy to Clean, Space-Saving Design`.slice(0, 180),
      bullets: [
        `BUILT TO LAST: Made with quality materials chosen for everyday use.`,
        `SMART DESIGN: ${p.angle}`.slice(0, 240),
        `EASY CARE: Simple to clean and maintain.`,
        `GREAT VALUE: A practical upgrade at an honest price.`,
        `SATISFACTION FOCUSED: Responsive support if anything is not right.`,
      ],
      description: `${base} is designed for people who want a reliable, well-made solution. ${p.angle}`,
      keywords: [base.toLowerCase(), `${p.category} ${base.toLowerCase()}`, `best ${base.toLowerCase()}`, `${base.toLowerCase()} set`, `${base.toLowerCase()} organizer`],
    };
  };
  return askJson<ListingCopy>(
    "You write high-converting, policy-compliant Amazon listings. Rules: no medical/health claims, no unverifiable superlatives ('best', '#1', 'guaranteed'), no competitor brand names, no promotional/price claims in the title, title <= 180 chars, 5 bullets <= 240 chars each starting with a short ALL-CAPS benefit label, keywords are lowercase search phrases. Respond with JSON only.",
    `Write a listing as {title, bullets[5], description, keywords[8-12]}.
Product: ${p.productName}
Category: ${p.category}
Differentiation angle: ${p.angle}
Price point: $${p.price}`,
    fallback,
  );
}

// ---------------------------------------------------------------- ad strategy
export async function seedKeywords(p: { title: string; keywords: string[] }): Promise<string[]> {
  const fallback = () => [...new Set(p.keywords.map((k) => k.toLowerCase()))].slice(0, 10);
  const out = await askJson<{ keywords: string[] }>(
    "You are a Sponsored Products specialist. Respond with JSON only.",
    `Give 10 high-intent exact-match search terms (2-4 words, lowercase, no brand names) for: "${p.title}". Existing ideas: ${p.keywords.join(", ")}. Return {"keywords": [...]}.`,
    () => ({ keywords: fallback() }),
  );
  const cleaned = out.keywords.map((k) => k.toLowerCase().trim()).filter((k) => k.length > 2 && k.length < 60);
  return [...new Set(cleaned)].slice(0, 12);
}
