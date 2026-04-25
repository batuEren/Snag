import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

interface ParsedListing {
  title: string;
  price: string;
  priceCents: number | null;
  condition: string;
  description: string;
  location: string;
  sellerName: string;
  link: string;
}

function tryParseNextData(html: string, url: string): ParsedListing | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    const d = JSON.parse(m[1]);
    const pp = d?.props?.pageProps ?? {};
    const l = pp.listing ?? pp.ad ?? pp.advertisement ?? pp.item;
    if (!l?.title) return null;

    const priceCents: number | null = l.priceInfo?.priceCents ?? null;
    const price =
      priceCents != null
        ? `€${Math.round(priceCents / 100)}`
        : l.priceInfo?.priceLabel ?? "Prijs onbekend";

    const attrs: Array<{ key?: string; value?: string[] }> =
      l.attributes ??
      (l.attributeGroups ?? []).flatMap(
        (g: { attributes: unknown[] }) => g.attributes
      ) ??
      [];
    const condAttr = attrs.find((a) =>
      ["staat", "conditie", "condition"].includes((a.key ?? "").toLowerCase())
    );
    const condition = condAttr?.value?.[0] ?? "Niet opgegeven";

    return {
      title: l.title,
      price,
      priceCents,
      condition,
      description: (l.description ?? "").slice(0, 300),
      location: l.location?.cityName ?? l.location?.city ?? "",
      sellerName: l.sellerInformation?.sellerName ?? l.seller?.name ?? "",
      link: url,
    };
  } catch {
    return null;
  }
}

function tryParseJsonLd(html: string, url: string): ParsedListing | null {
  const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const d = JSON.parse(m[1]);
      const product = Array.isArray(d)
        ? d.find((x) => x["@type"] === "Product")
        : d["@type"] === "Product"
        ? d
        : null;
      if (!product?.name) continue;

      const offer = product.offers ?? {};
      const priceNum = offer.price ? parseFloat(String(offer.price)) : null;
      const priceCents = priceNum != null ? Math.round(priceNum * 100) : null;
      const price = priceNum != null ? `€${Math.round(priceNum)}` : "Prijs onbekend";

      return {
        title: product.name,
        price,
        priceCents,
        condition:
          product.itemCondition
            ?.split("/")
            .pop()
            ?.replace("Condition", "") ?? "Niet opgegeven",
        description: (product.description ?? "").slice(0, 300),
        location: offer.availableAtOrFrom?.address?.addressLocality ?? "",
        sellerName: product.seller?.name ?? "",
        link: product.url ?? url,
      };
    } catch {
      continue;
    }
  }
  return null;
}

function fallbackParse(html: string, url: string): ParsedListing {
  const titleM =
    html.match(/<h1[^>]*>([^<]+)<\/h1>/) ??
    html.match(/<title>([^|<]+)/);
  const rawTitle = titleM?.[1]?.trim() ?? "";
  const title = rawTitle
    .split(" - ")[0]
    .split(" | ")[0]
    .replace(" — Marktplaats.nl", "")
    .trim();

  const priceM = html.match(/€\s*([\d.]+(?:,\d{2})?)/);
  const priceStr = priceM?.[1]?.replace(/\./g, "").replace(",", ".") ?? "";
  const priceNum = priceStr ? parseFloat(priceStr) : null;
  const priceCents = priceNum != null ? Math.round(priceNum * 100) : null;
  const price = priceCents ? `€${Math.round(priceCents / 100)}` : "Prijs onbekend";

  return {
    title,
    price,
    priceCents,
    condition: "Niet opgegeven",
    description: "",
    location: "",
    sellerName: "",
    link: url,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || !/marktplaats\.nl/i.test(url)) {
      return NextResponse.json({ error: "Invalid Marktplaats URL" }, { status: 400 });
    }

    let html: string;
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
          "Referer": "https://www.marktplaats.nl/",
          "Upgrade-Insecure-Requests": "1",
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      html = await r.text();
    } catch (err) {
      console.error("Fetch error:", err);
      return NextResponse.json(
        { error: "Could not load the listing page. Please paste the details manually." },
        { status: 502 }
      );
    }

    const listing =
      tryParseNextData(html, url) ??
      tryParseJsonLd(html, url) ??
      fallbackParse(html, url);

    if (!listing.title || listing.title.length < 3) {
      return NextResponse.json(
        { error: "Could not read the listing. Please paste the details manually." },
        { status: 422 }
      );
    }

    const userMessage = `Analyze this Marktplaats listing and assess its value:

Title: ${listing.title}
Asking price: ${listing.price}
Condition: ${listing.condition}
Description: ${listing.description || "(no description)"}
Location: ${listing.location || "Netherlands"}
Seller: ${listing.sellerName || "Unknown"}

Return ONLY a JSON object (no markdown, no explanation):
{
  "fairPriceMin": <integer euros>,
  "fairPriceMax": <integer euros>,
  "verdict": "great deal" | "fair price" | "overpriced",
  "reasoning": "<1–2 sentences in English explaining the verdict>",
  "suggestedOffer": <integer euros, roughly 10–15% below fairPriceMin>
}`;

    const aiRes = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: [
        {
          type: "text",
          text: "You are a Dutch second-hand marketplace pricing expert with deep knowledge of typical Marktplaats prices for electronics, appliances, furniture, clothing, vehicles, and all other goods. You assess whether a listing is a great deal, fairly priced, or overpriced based on the item's condition, description, and typical Dutch market rates. Always return valid JSON only — no markdown, no preamble.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = aiRes.content.find((b) => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("No JSON in AI verdict response:", text);
      return NextResponse.json({ error: "AI verdict parsing failed" }, { status: 500 });
    }

    const verdict = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ listing, verdict });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("analyze-url error:", msg);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
