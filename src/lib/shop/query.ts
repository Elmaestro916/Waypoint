import Anthropic from "@anthropic-ai/sdk";
import type { ParsedQuery } from "./types";

const SYMBOL_CURRENCY: Record<string, string> = { $: "USD", "£": "GBP", "€": "EUR", "₦": "NGN", "₹": "INR", "R$": "BRL" };
const FILLER =
  /\b(i\s+(?:want|need|am looking for|'m looking for)|looking for|find me|show me|get me|search for|please|cheapest|cheap|affordable|good|best|the|a|an|some|for me)\b/gi;

export function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(Boolean);
}

function num(s: string): number {
  return Number(s.replace(/[,\s]/g, ""));
}

/** Deterministic parser: handles budgets, condition words, filler and a known-brand match. */
export function parseQueryHeuristic(raw: string, knownBrands: string[] = []): ParsedQuery {
  let text = raw.trim().replace(/\s+/g, " ");
  const out: ParsedQuery = { keywords: "" };

  const cur = "(R\\$|[$£€₦₹])?\\s?";
  const amt = "(\\d[\\d,]*(?:\\.\\d+)?)\\s?(k)?";
  const grab = (re: RegExp): RegExpExecArray | null => re.exec(text);
  const val = (n: string, k?: string) => num(n) * (k ? 1000 : 1);
  const symbolOf = (m: RegExpExecArray, idx: number) => (m[idx] ? SYMBOL_CURRENCY[m[idx]] : undefined);

  let m = grab(new RegExp(`\\bbetween\\s+${cur}${amt}\\s+and\\s+${cur}${amt}`, "i"));
  if (m) {
    out.minPrice = val(m[2], m[3]);
    out.maxPrice = val(m[5], m[6]);
    out.budgetCurrency = symbolOf(m, 1) ?? symbolOf(m, 4);
    text = text.replace(m[0], " ");
  } else if ((m = grab(new RegExp(`\\b(?:under|below|less than|up to|max(?:imum)?|within|at most|no more than)\\s+${cur}${amt}`, "i")))) {
    out.maxPrice = val(m[2], m[3]);
    out.budgetCurrency = symbolOf(m, 1);
    text = text.replace(m[0], " ");
  } else if ((m = grab(new RegExp(`\\b(?:over|above|more than|at least|min(?:imum)?)\\s+${cur}${amt}`, "i")))) {
    out.minPrice = val(m[2], m[3]);
    out.budgetCurrency = symbolOf(m, 1);
    text = text.replace(m[0], " ");
  }

  if (/\b(used|second[- ]?hand|pre[- ]?owned|refurbished|refurb)\b/i.test(text)) {
    out.condition = "used";
    text = text.replace(/\b(used|second[- ]?hand|pre[- ]?owned|refurbished|refurb)\b/gi, " ");
  } else if (/\bbrand[- ]new\b/i.test(text)) {
    out.condition = "new";
    text = text.replace(/\bbrand[- ]new\b/gi, " ");
  }

  text = text.replace(FILLER, " ").replace(/\s+/g, " ").trim();
  out.keywords = text;

  const lower = ` ${tokenize(text).join(" ")} `;
  const brand = [...knownBrands]
    .sort((a, b) => b.length - a.length)
    .find((b) => b.length > 1 && lower.includes(` ${tokenize(b).join(" ")} `));
  if (brand) out.brand = brand;
  return out;
}

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

/**
 * Natural-language queries ("waterproof hiking boots for wide feet under 80 dollars") get an LLM pass that
 * returns structured search terms. Only the user's own query text is sent: never product data from any store.
 * Short queries and any failure use the deterministic parser.
 */
export async function parseQuery(raw: string, knownBrands: string[] = []): Promise<ParsedQuery> {
  const base = parseQueryHeuristic(raw, knownBrands);
  const words = tokenize(raw).length;
  if (!client || words < 5) return base;
  try {
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 300,
      system:
        "You turn a shopper's request into search terms. Reply with JSON only: {\"keywords\": string, \"brand\": string|null, \"maxPrice\": number|null, \"minPrice\": number|null, \"condition\": \"new\"|\"used\"|null}. keywords = 2-6 concrete product words (no filler, no price words, no brand). Never invent a brand or price the shopper did not state.",
      messages: [{ role: "user", content: raw.slice(0, 300) }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
      keywords?: string; brand?: string | null; maxPrice?: number | null; minPrice?: number | null; condition?: string | null;
    };
    const keywords = typeof j.keywords === "string" && j.keywords.trim() ? j.keywords.trim().slice(0, 120) : base.keywords;
    return {
      keywords,
      brand: base.brand ?? (typeof j.brand === "string" && j.brand ? j.brand : undefined),
      minPrice: base.minPrice ?? (typeof j.minPrice === "number" && j.minPrice > 0 ? j.minPrice : undefined),
      maxPrice: base.maxPrice ?? (typeof j.maxPrice === "number" && j.maxPrice > 0 ? j.maxPrice : undefined),
      budgetCurrency: base.budgetCurrency,
      condition: base.condition ?? (j.condition === "new" || j.condition === "used" ? j.condition : undefined),
    };
  } catch {
    return base;
  }
}

/** Builds a safe to_tsquery string. Tokens are reduced to letters/digits so no tsquery syntax can be injected. */
export function buildTsQuery(tokens: string[], mode: "and" | "or" = "and"): string {
  const uniq = [...new Set(tokens.filter((t) => t.length >= 2))].slice(0, 8);
  return uniq.map((t) => `${t}:*`).join(mode === "and" ? " & " : " | ");
}
