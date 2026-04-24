export const runtime = "nodejs";

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Schemas ───────────────────────────────────────────────────────────────────

interface WishlistAttributes {
  category: string;
  color: string | null;
  budget_max: number;
  budget_min: number;
  condition_pref: string;
  tags: string[];
}

interface RawListing {
  id: string;
  title: string;
  price: number;
  description: string;
  image_url: string;
  condition: "Excellent" | "Very Good" | "Good";
  location: string;
  platform: string;
  link?: string;
}

// ── Marktplaats API ───────────────────────────────────────────────────────────

interface MarktplaatsListing {
  itemId?: string;
  title?: string;
  priceInfo?: { priceCents?: number };
  vipUrl?: string;
  pictures?: { mediumUrl?: string; extraSmallUrl?: string }[];
  location?: { cityName?: string };
  attributes?: Array<{ key?: string; value?: string }>;
}

type Condition = "Excellent" | "Very Good" | "Good";

function inferCondition(attributes: Array<{ key?: string; value?: string }> = []): Condition {
  const condAttr = attributes.find((a) => {
    const k = (a.key ?? "").toLowerCase();
    return k.includes("conditie") || k.includes("condition") || k.includes("staat");
  });
  if (!condAttr?.value) return "Good";
  const val = condAttr.value.toLowerCase();
  if (
    val.includes("nieuw") ||
    val.includes("uitstekend") ||
    val.includes("excellent") ||
    val.includes("zo goed als nieuw")
  )
    return "Excellent";
  if (val.includes("zeer goed") || val.includes("very good") || val.includes("goed")) return "Very Good";
  return "Good";
}

async function fetchMarktplaatsListings(query: string, budgetMax: number): Promise<RawListing[]> {
  const url = new URL("https://www.marktplaats.nl/lrp/api/search");
  url.searchParams.set("query", query);
  url.searchParams.set("searchInTitleAndDescription", "true");
  url.searchParams.set("viewOptions", "list-view");
  url.searchParams.set("limit", "15");
  url.searchParams.append("attributeRanges[]", `PriceCents:0:${Math.round(budgetMax * 100)}`);

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
  });

  if (!response.ok) throw new Error(`Marktplaats returned ${response.status}`);

  const data = await response.json();
  const listings: MarktplaatsListing[] = data.listings ?? [];

  return listings.map((l, i) => {
    const priceEur = (l.priceInfo?.priceCents ?? 0) / 100;
    const attrs = l.attributes ?? [];
    const descParts = attrs.map((a) => `${a.key ?? ""}: ${a.value ?? ""}`).join(", ");
    return {
      id: l.itemId ?? String(i),
      title: l.title ?? "Unknown listing",
      price: priceEur,
      description: descParts || (l.title ?? ""),
      image_url: l.pictures?.[0]?.extraSmallUrl ?? l.pictures?.[0]?.mediumUrl ?? "",
      condition: inferCondition(attrs),
      location: l.location?.cityName ?? "Netherlands",
      platform: "Marktplaats",
      link: l.vipUrl ? `https://www.marktplaats.nl${l.vipUrl}` : undefined,
    };
  });
}

// ── Step A: Parse wishlist with Claude ────────────────────────────────────────

async function parseWishlistWithClaude(
  item: string,
  budget: string,
  specs: string,
  imageBase64?: string,
): Promise<WishlistAttributes> {
  const prompt = `Extract buyer intent from this marketplace search request.

Item: "${item}"
Budget: "${budget}"
Additional specs: "${specs}"

Return ONLY a JSON object with these exact fields (no markdown, no explanation):
{
  "category": one of [bike, phone, laptop, camera, tv, console, headphones, any],
  "color": color preference as a lowercase string or null,
  "budget_max": numeric max budget in euros (default 500 if unclear),
  "budget_min": numeric min budget in euros (default 0),
  "condition_pref": one of [any, Excellent, Very Good, Good],
  "tags": array of relevant search keywords (e.g. ["mountain", "hardtail", "disc"])
}`;

  const content: Anthropic.MessageParam["content"] = [];

  if (imageBase64) {
    const match = imageBase64.match(/^data:(image\/\w+);base64,([\s\S]+)$/);
    if (match) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: match[2],
        },
      });
    }
  }

  content.push({ type: "text", text: prompt });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON found");
    return JSON.parse(jsonMatch[0]) as WishlistAttributes;
  } catch {
    const budgetNum = parseFloat(budget.replace(/[^0-9.]/g, "")) || 500;
    return {
      category: "any",
      color: null,
      budget_max: budgetNum,
      budget_min: 0,
      condition_pref: "any",
      tags: item.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
    };
  }
}

// ── Step B: Score listings with Claude ────────────────────────────────────────

interface ScoreEntry {
  id: string;
  text_score: number;
  visual_score: number;
}

async function scoreListingsWithClaude(
  listings: RawListing[],
  attrs: WishlistAttributes,
  imageBase64?: string,
): Promise<ScoreEntry[]> {
  const listingsSummary = listings.map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description,
    condition: l.condition,
  }));

  const prompt = `You are scoring second-hand marketplace listings for a buyer.

BUYER WISHLIST:
- Category: ${attrs.category}
- Color preference: ${attrs.color ?? "any"}
- Condition preference: ${attrs.condition_pref}
- Keywords: ${attrs.tags.join(", ")}
${imageBase64 ? "- The buyer also attached a reference photo of what they want." : ""}

LISTINGS TO SCORE:
${JSON.stringify(listingsSummary, null, 2)}

For each listing return a JSON array (no markdown, just the array):
[{ "id": "1", "text_score": 0.85, "visual_score": 0.70 }, ...]

text_score  = 0.0-1.0 semantic match between buyer wishlist and listing title/description.
visual_score = 0.0-1.0 visual match to the reference photo (use 0.5 if no photo was provided).

Return ONLY the JSON array.`;

  const content: Anthropic.MessageParam["content"] = [];

  if (imageBase64) {
    const match = imageBase64.match(/^data:(image\/\w+);base64,([\s\S]+)$/);
    if (match) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: match[2],
        },
      });
    }
  }

  content.push({ type: "text", text: prompt });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("no JSON array in response");
    return JSON.parse(jsonMatch[0]) as ScoreEntry[];
  } catch {
    return listings.map((l) => ({ id: l.id, text_score: 0.5, visual_score: 0.5 }));
  }
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { item, budget, specs, imageBase64 } = body as {
      item: string;
      budget: string;
      specs: string;
      imageBase64?: string;
    };

    if (!item || !budget) {
      return NextResponse.json({ error: "item and budget are required" }, { status: 400 });
    }

    // Step A: parse wishlist intent with Claude
    const attrs = await parseWishlistWithClaude(item, budget, specs ?? "", imageBase64);

    // Step B: fetch real Marktplaats listings
    const queryParts = [item, specs].filter((s) => s && String(s).toLowerCase() !== "any");
    const query = queryParts.join(" ").trim() || item;

    let listings: RawListing[];
    try {
      listings = await fetchMarktplaatsListings(query, attrs.budget_max);
    } catch (e) {
      console.error("Marktplaats fetch error:", e);
      return NextResponse.json({ error: "Failed to reach Marktplaats", results: [] }, { status: 502 });
    }

    if (listings.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Step C: score with Claude
    const scores = await scoreListingsWithClaude(listings, attrs, imageBase64);
    const scoreMap = new Map(scores.map((s) => [s.id, s]));

    // Step D: compute final scores, format, and sort
    const scored = listings.map((listing) => {
      const s = scoreMap.get(listing.id) ?? { text_score: 0.5, visual_score: 0.5 };
      const combined = imageBase64
        ? s.text_score * 0.6 + s.visual_score * 0.4
        : s.text_score;
      const priceSavingsPct = attrs.budget_max > 0 ? Math.max(0, 1 - listing.price / attrs.budget_max) : 0;
      const valueScore = Math.min(100, Math.round(combined * 60 + priceSavingsPct * 40));
      const savedAmount = Math.max(0, Math.round(attrs.budget_max - listing.price));
      return {
        title: listing.title,
        platform: listing.platform,
        price: `€${listing.price.toFixed(0)}`,
        condition: listing.condition,
        valueScore,
        savings: savedAmount > 0 ? `€${savedAmount} under budget` : "At budget",
        location: listing.location,
        link: listing.link,
        image: listing.image_url || undefined,
        _score: combined,
      };
    });

    scored.sort((a, b) => b._score - a._score);
    const results = scored.slice(0, 6).map(({ _score, ...r }) => r);

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Search error:", message);
    return NextResponse.json({ error: message, results: [] }, { status: 500 });
  }
}
