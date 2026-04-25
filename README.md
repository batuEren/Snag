# Snag — AI-Powered Deal Hunting Assistant

Snag is a conversational AI chatbot that helps you find the best second-hand deals on Dutch marketplaces. Tell it what you want, set your budget, and it searches Marktplaats in real time; then helps you haggle for the best price.

Built for the **Bunq Hackathon 7.0**.

---

## Features

### Conversational Search Flow
Snag guides you through a structured conversation to understand exactly what you need:
1. **What do you want to buy?** — Describe the item in natural language
2. **What's your budget?** — Set a price ceiling (or say "any" for no limit)
3. **Any specific requirements?** — Brand, storage size, color, condition, etc. (or skip with "any")
4. Snag then searches live marketplaces and presents ranked results with deal scores

After results appear you can keep chatting — ask follow-up questions, request a new search, or compare items.

### Live Marktplaats Search
- Searches [Marktplaats.nl](https://www.marktplaats.nl) in real time using the official listing API
- Also surfaces results from 2dehands.be and eBay.nl
- Filters results by your budget automatically
- Infers listing condition from Dutch attribute labels (Conditie, Staat)

### AI-Powered Deal Scoring
Each result is scored 0–100 based on:
- **Semantic match** (60%) — how well the listing text matches your wishlist
- **Price savings** (40%) — how much below your budget the listing is
- If you upload a reference photo, **visual similarity** is factored in (replaces 40% of the text score)

Results are ranked and displayed as cards showing price, condition, location, savings vs. your budget, and a color-coded score ring (green ≥ 80, orange ≥ 65, red < 65).

### Image Recognition
- Upload a photo of the item you want (from your camera roll, a product page, etc.)
- Snag resizes and encodes it client-side (max 512px, JPEG 0.8 quality)
- The image is passed to Claude for visual understanding and compared pixel-level against listing thumbnails
- Works alongside text matching — no image required, but it improves relevance when provided

### Listing URL Analyzer
Paste any Marktplaats listing URL directly into the chat and Snag will analyze it instantly — no need to go through the search flow:
- Snag fetches the listing page server-side and extracts the title, price, condition, description, location, and seller name
- Claude Sonnet assesses the listing against typical Dutch second-hand market rates and returns a verdict:
  - **Great Deal** — priced well below fair market value
  - **Fair Price** — in line with what you'd expect to pay
  - **Overpriced** — asking more than the market supports
- The analysis card shows a color-coded verdict badge, a fair price range (min–max), Claude's reasoning, and a suggested offer price
- Click **Make Offer** to open the Negotiation Copilot pre-filled with the suggested offer as your target price
- Works in any part of the conversation — just paste the URL and Snag handles the rest

### Negotiation Copilot
Click **Make Offer** on any result card to open the Negotiation Copilot:
- Enter your target offer price (defaults to 80% of asking price)
- Claude Sonnet generates **3 negotiation message drafts**, each with a different style:
  - **Direct** — professional and to the point
  - **Friendly** — warm and rapport-building
  - **Haggler** — references market comparables and item condition to justify a lower price
- One-click copy for each draft

### Dutch & English Negotiation Messages
The Negotiation Copilot supports both languages:
- Toggle between **NL** and **EN** with a single click
- Messages are culturally appropriate for Marktplaats conversations
- Language can be switched mid-session before regenerating

### Multiple Chat Sessions
- Every search starts a new chat session saved automatically to `localStorage`
- The sidebar lists all past sessions grouped by date (Today, Yesterday, Last 7 days, Older)
- Each session preserves the full conversation history, search parameters, and result cards
- Click any session to resume exactly where you left off
- Delete sessions individually (hover to reveal the delete button)
- Start a fresh session anytime with the **New chat** button

### Three Themes — Dark, Light, High Contrast
Switch themes at any time via the dropdown in the header:
- **Dark** — default; deep background with radial gradient and blue accents
- **Light** — clean white and indigo, easy on the eyes in bright environments
- **High Contrast** — stark black and white for accessibility needs

Theme preference persists across sessions via `localStorage`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript, TailwindCSS |
| AI (chat) | Claude Haiku 4.5 |
| AI (search, negotiate & URL analysis) | Claude Sonnet 4.6 |
| Marketplace API | Marktplaats LRP API (live, no auth required) |
| State / persistence | React hooks + localStorage (no database) |
| Python prototype | Sentence Transformers, Pillow, NumPy |

---

## Getting Started

### Prerequisites
- Node.js 18+
- An Anthropic API key

### Install & run

```bash
npm install
```

Create `.env.local`:

```
ANTHROPIC_API_KEY=your_key_here
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Python backend (optional prototype)

```bash
cd backend
pip install -r requirements.txt
python agent.py
```

The Python agent is a standalone ML pipeline demo using Sentence Transformers for semantic and visual matching. The Next.js app does not depend on it.

---

## Project Structure

```
src/
  app/
    page.tsx              # Main UI — chat, sidebar, flow logic, result cards
    globals.css           # Theme definitions and CSS variables
    api/
      chat/route.ts       # Claude Haiku conversation endpoint
      search/route.ts     # Multi-stage ranking pipeline + Marktplaats integration
      negotiate/route.ts     # Claude Sonnet negotiation message generator
      analyze-url/route.ts  # Listing URL fetcher, parser, and AI price verdict
  components/
    NegotiationCopilot.tsx  # Make Offer modal
    ui/                     # Shared primitives (textarea, button, scroll area)
backend/
  agent.py                # Python prototype (parse → source → rank → output)
  requirements.txt
```
