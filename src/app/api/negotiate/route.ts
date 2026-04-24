import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

const buildSystemPrompt = (language: "nl" | "en") => {
  const lang = language === "nl" ? "Dutch" : "English";
  return `You are a negotiation expert helping a Marktplaats buyer craft the perfect opening message to a seller. Generate exactly 3 message drafts in ${lang}, each with a distinct negotiation style.

Return a valid JSON array with exactly 3 objects. No markdown, no explanation — only the JSON array.

Each object must have:
- "style": exactly one of "direct", "friendly", or "haggler"
- "label": short English label (e.g. "The Direct Buyer")
- "message": the message text in ${lang} (2–4 sentences, no markdown)

Styles:
1. direct — "The Direct Buyer": Professional, no small talk. Makes a clear offer slightly below the target price.
2. friendly — "The Friendly Neighbor": Warm, builds rapport. Mentions genuine interest, asks about condition, offers politely.
3. haggler — "The Hard Haggler": Points out comparable market prices or minor concerns to justify a lower offer. Confident but not rude.

Rules:
- All messages must be written in ${lang}
- Naturally reference the item title and the target price
- Keep messages realistic and respectful — these are real people on Marktplaats`;
};

export async function POST(req: NextRequest) {
  try {
    const { listing, targetPrice, language = "nl" } = await req.json();
    const lang = language === "en" ? "en" : "nl";

    const userMessage = `Listing:
Title: ${listing.title}
Asking price: ${listing.price}
Condition: ${listing.condition ?? "Not specified"}
Location: ${listing.location ?? "Not specified"}
Target offer price: ${targetPrice}

Generate 3 ${lang === "nl" ? "Dutch" : "English"} negotiation message drafts as a JSON array.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      system: [
        {
          type: "text",
          text: buildSystemPrompt(lang),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "";

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("No JSON array found in response:", text);
      return NextResponse.json({ error: "Failed to parse message drafts" }, { status: 500 });
    }

    const drafts = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ drafts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Negotiate API error:", message);
    return NextResponse.json({ error: `API error: ${message}` }, { status: 500 });
  }
}
