"""
buy-shit-fast — Multimodal Buying Agent (Python Prototype)

Demonstrates the full 4-class pipeline using sentence-transformers for
text embeddings and Pillow for naive pixel-level visual similarity.
No GPU or external API calls required.

Run:
    pip install -r requirements.txt
    python backend/agent.py
    # Optionally place any bike image at backend/sample_bike.jpg first
"""

from __future__ import annotations

import re
import json
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from io import BytesIO

import numpy as np
from PIL import Image
from sentence_transformers import SentenceTransformer


# ── Shared data classes ───────────────────────────────────────────────────────

@dataclass
class WishlistAttributes:
    query: str
    category: str
    color: str | None
    size: str | None
    budget_max: float
    budget_min: float
    condition_pref: str         # "any" | "Excellent" | "Very Good" | "Good"
    tags: list[str]
    _image_array: np.ndarray | None = field(default=None, repr=False)


@dataclass
class Listing:
    id: str
    title: str
    price: float
    description: str
    image_url: str
    category: str
    color: str
    tags: list[str]
    condition: str              # "Excellent" | "Very Good" | "Good"
    location: str
    platform: str


@dataclass
class RankedListing:
    listing: Listing
    similarity_score: float     # 0.0–1.0 combined score
    tier_scores: dict
    deal_score: int             # 0–100


# ── Class 1: UserRequestParser ────────────────────────────────────────────────

CATEGORY_KEYWORDS = {
    "bike": ["bike", "fiets", "bicycle", "mtb", "mountain bike", "road bike", "city bike", "e-bike", "ebike"],
    "phone": ["phone", "smartphone", "iphone", "samsung", "pixel", "mobile"],
    "laptop": ["laptop", "notebook", "macbook", "thinkpad", "chromebook"],
    "camera": ["camera", "dslr", "mirrorless", "fujifilm", "canon", "sony a"],
    "tv": ["tv", "television", "oled", "qled", "smart tv"],
    "console": ["ps5", "playstation", "xbox", "nintendo", "switch"],
    "headphones": ["headphone", "earphone", "airpod", "earbud", "wh-1000"],
}

COLOR_KEYWORDS = [
    "matte black", "jet black", "gloss black", "black", "white", "pearl white",
    "red", "blue", "green", "yellow", "orange", "purple", "grey", "gray",
    "silver", "gold", "carbon", "olive", "navy",
]

CONDITION_MAP = {
    "like new": "Excellent", "brand new": "Excellent", "excellent": "Excellent",
    "very good": "Very Good", "good condition": "Good", "good": "Good",
    "used": "Good", "worn": "Good",
}


class UserRequestParser:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        print(f"Loading sentence-transformers model '{model_name}'...")
        self._model = SentenceTransformer(model_name)

    def parse(self, text: str, image_path: str | None = None) -> WishlistAttributes:
        lower = text.lower()

        # Budget extraction
        budget_max = 500.0
        budget_min = 0.0
        m = re.search(r"(?:under|below|max|budget|<)\s*[€$]?\s*(\d+)", lower)
        if m:
            budget_max = float(m.group(1))
        else:
            m = re.search(r"[€$]\s*(\d+)", lower)
            if m:
                budget_max = float(m.group(1))
        m_range = re.search(r"[€$]?\s*(\d+)\s*[-–to]+\s*[€$]?\s*(\d+)", lower)
        if m_range:
            budget_min = float(m_range.group(1))
            budget_max = float(m_range.group(2))

        # Category detection
        category = "any"
        for cat, keywords in CATEGORY_KEYWORDS.items():
            if any(kw in lower for kw in keywords):
                category = cat
                break

        # Color extraction (longest match first)
        color = None
        for c in sorted(COLOR_KEYWORDS, key=len, reverse=True):
            if c in lower:
                color = c
                break

        # Condition preference
        condition_pref = "any"
        for phrase, cond in CONDITION_MAP.items():
            if phrase in lower:
                condition_pref = cond
                break

        # Tags: remaining meaningful words after stripping known fields
        stopwords = {"a", "an", "the", "for", "with", "and", "or", "in", "on",
                     "of", "is", "to", "my", "i", "want", "looking", "need", "buy",
                     "under", "below", "budget", "max", "any", "good", "like", "new"}
        words = re.findall(r"[a-z]+", lower)
        tags = [w for w in words if len(w) > 3 and w not in stopwords]
        # deduplicate while preserving order
        seen: set[str] = set()
        unique_tags = [t for t in tags if not (t in seen or seen.add(t))]  # type: ignore[func-returns-value]

        # Image loading
        image_array = None
        if image_path and Path(image_path).exists():
            try:
                img = Image.open(image_path).convert("RGB").resize((224, 224))
                image_array = np.array(img, dtype=np.float32) / 255.0
            except Exception as e:
                print(f"Warning: could not load image {image_path}: {e}")

        return WishlistAttributes(
            query=text,
            category=category,
            color=color,
            size=None,
            budget_max=budget_max,
            budget_min=budget_min,
            condition_pref=condition_pref,
            tags=unique_tags,
            _image_array=image_array,
        )

    def embed_text(self, text: str) -> np.ndarray:
        return self._model.encode(text, convert_to_numpy=True)


# ── Class 2: SourcingPipeline ─────────────────────────────────────────────────

MOCK_LISTINGS: list[Listing] = [
    Listing("1",  "Trek Marlin 7 MTB 29er Matte Black",         499, "Hardtail mountain bike, disc brakes, 29er wheels, Shimano Deore drivetrain, barely used.", "https://picsum.photos/seed/bike1/400/300", "bike", "matte black",  ["mountain", "hardtail", "disc", "shimano", "29er"],  "Excellent", "Amsterdam",  "Marktplaats"),
    Listing("2",  "Giant Talon 3 Mountain Bike 2022",            380, "Great all-round MTB, aluminium frame, front suspension, 27.5\" wheels, minor scratches.", "https://picsum.photos/seed/bike2/400/300", "bike", "dark grey",    ["mountain", "suspension", "aluminium"],              "Very Good", "Rotterdam",  "2dehands.be"),
    Listing("3",  "Specialized Rockhopper Comp Matte",           520, "Hardtail MTB, 29er, matte finish, hydraulic disc brakes, 1x drivetrain.",               "https://picsum.photos/seed/bike3/400/300", "bike", "matte olive",  ["mountain", "hardtail", "hydraulic", "29er"],        "Excellent", "Utrecht",    "Marktplaats"),
    Listing("4",  "Trek FX3 City Bike Matte Black",              410, "Lightweight city/fitness bike, matte black finish, disc brakes, clean condition.",       "https://picsum.photos/seed/bike4/400/300", "bike", "matte black",  ["city", "fitness", "disc", "lightweight"],           "Very Good", "Den Haag",   "eBay.nl"),
    Listing("5",  "Canyon Exceed CF SL MTB Carbon",              890, "Carbon hardtail XC race bike, top spec components, SRAM Eagle 12-speed.",                "https://picsum.photos/seed/bike5/400/300", "bike", "matte carbon", ["mountain", "carbon", "xc", "race", "sram"],         "Excellent", "Eindhoven",  "Marktplaats"),
    Listing("6",  "Gazelle Miss Grace E-bike",                   750, "Electric city bike, 7-speed, pearl white, perfect for commuting, 60km range.",           "https://picsum.photos/seed/bike6/400/300", "bike", "pearl white",  ["electric", "city", "commute"],                     "Good",      "Groningen",  "2dehands.be"),
    Listing("7",  "Cannondale Trail 8 Hardtail MTB",             340, "Jet black hardtail, Shimano 3x8 drivetrain, mechanical disc brakes, some scuffs.",       "https://picsum.photos/seed/bike7/400/300", "bike", "jet black",    ["mountain", "hardtail", "shimano"],                 "Good",      "Breda",      "Marktplaats"),
    Listing("8",  "Scott Aspect 950 Mountain Bike",              295, "Entry MTB, black/red colourway, front suspension, good for trails.",                     "https://picsum.photos/seed/bike8/400/300", "bike", "black/red",    ["mountain", "suspension", "trails"],                "Good",      "Tilburg",    "eBay.nl"),
    Listing("9",  "Cube Aim Pro Hardtail MTB",                   450, "Matte black hardtail, 29er, Shimano Acera, hydraulic discs, excellent shape.",           "https://picsum.photos/seed/bike9/400/300", "bike", "matte black",  ["mountain", "hardtail", "29er", "hydraulic", "cube"], "Very Good", "Haarlem",    "2dehands.be"),
    Listing("10", "Trek Roscoe 8 Fat Bike Matte",                560, "Matte purple fat bike, 27.5+ wheels, great for sand and rough terrain.",                 "https://picsum.photos/seed/bike10/400/300","bike", "matte purple", ["fat", "beach", "terrain"],                         "Very Good", "Zwolle",     "Marktplaats"),
    Listing("11", "iPhone 13 Pro 128GB",                         650, "Graphite colour, excellent condition, original box, Face ID works perfectly.",           "https://picsum.photos/seed/phone1/400/300","phone","graphite",     ["apple", "ios", "128gb"],                           "Excellent", "Amsterdam",  "Marktplaats"),
    Listing("12", "Batavus Dinsdag City Bike 7sp",               220, "Classic Dutch city bike, matte grey, 7-speed, kickstand, rear carrier included.",       "https://picsum.photos/seed/bike12/400/300","bike", "matte grey",   ["city", "dutch", "7speed", "carrier"],              "Good",      "Leiden",     "eBay.nl"),
]


class SourcingPipeline:
    def fetch(
        self,
        category: str | None = None,
        max_price: float | None = None,
    ) -> list[Listing]:
        results = list(MOCK_LISTINGS)
        if category and category != "any":
            results = [l for l in results if l.category == category]
        if max_price is not None:
            results = [l for l in results if l.price <= max_price]
        return results


# ── Class 3: MultimodalEliminationFilter ──────────────────────────────────────

def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = (np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a.flatten(), b.flatten()) / (np.linalg.norm(a.flatten()) * np.linalg.norm(b.flatten())))


def _load_image_array(url: str) -> np.ndarray | None:
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            data = r.read()
        img = Image.open(BytesIO(data)).convert("RGB").resize((224, 224))
        return np.array(img, dtype=np.float32) / 255.0
    except Exception:
        return None


class MultimodalEliminationFilter:
    def __init__(self, parser: UserRequestParser):
        self._parser = parser

    def _tier1_filter(self, listings: list[Listing], attrs: WishlistAttributes) -> list[Listing]:
        survivors = []
        for l in listings:
            if attrs.category != "any" and l.category != attrs.category:
                continue
            if l.price > attrs.budget_max or l.price < attrs.budget_min:
                continue
            if attrs.color and attrs.color not in l.color:
                pass  # soft — don't reject on color alone, just note it
            survivors.append(l)
        return survivors

    def _tier2_score(self, listing: Listing, wishlist_embedding: np.ndarray) -> float:
        text = f"{listing.title} {listing.description} {' '.join(listing.tags)}"
        listing_emb = self._parser.embed_text(text)
        return max(0.0, _cosine(wishlist_embedding, listing_emb))

    def _tier3_score(
        self,
        listing_image_url: str,
        reference_image_array: np.ndarray | None,
    ) -> float:
        if reference_image_array is None:
            return 0.5
        listing_arr = _load_image_array(listing_image_url)
        if listing_arr is None:
            return 0.5
        return max(0.0, _cosine(reference_image_array, listing_arr))

    def rank(
        self,
        listings: list[Listing],
        attrs: WishlistAttributes,
        reference_image_array: np.ndarray | None = None,
    ) -> list[RankedListing]:
        survivors = self._tier1_filter(listings, attrs)
        print(f"Tier 1: {len(listings)} → {len(survivors)} listings after metadata filter")

        wishlist_text = f"{attrs.query} {' '.join(attrs.tags)}"
        wishlist_emb = self._parser.embed_text(wishlist_text)

        ranked = []
        for l in survivors:
            t2 = self._tier2_score(l, wishlist_emb)
            t3 = self._tier3_score(l.image_url, reference_image_array)
            combined = (t2 * 0.6 + t3 * 0.4) if reference_image_array is not None else t2
            price_savings_pct = max(0.0, 1.0 - l.price / attrs.budget_max) if attrs.budget_max > 0 else 0.0
            deal_score = int(combined * 60 + price_savings_pct * 40)
            ranked.append(RankedListing(
                listing=l,
                similarity_score=round(combined, 4),
                tier_scores={"tier1_pass": True, "tier2": round(t2, 4), "tier3": round(t3, 4)},
                deal_score=min(100, deal_score),
            ))

        ranked.sort(key=lambda r: r.similarity_score, reverse=True)
        return ranked


# ── Class 4: OutputGenerator ──────────────────────────────────────────────────

class OutputGenerator:
    def render_terminal(self, ranked: list[RankedListing]) -> None:
        print(f"\n{'='*80}")
        print(f"{'RANK':<5} {'TITLE':<45} {'PRICE':>6}  {'SIM%':>5}  {'DEAL':>4}  {'COND':<10}  {'PLATFORM'}")
        print(f"{'-'*80}")
        for i, r in enumerate(ranked, 1):
            l = r.listing
            marker = "  *** BEST DEAL ***" if i == 1 else ""
            print(
                f"{i:<5} {l.title[:44]:<44}  €{l.price:>5.0f}  "
                f"{r.similarity_score*100:>4.0f}%  {r.deal_score:>4}  "
                f"{l.condition:<10}  {l.platform}{marker}"
            )
        print(f"{'='*80}\n")

    def to_api_json(self, ranked: list[RankedListing]) -> list[dict]:
        result = []
        for r in ranked:
            l = r.listing
            result.append({
                "title": l.title,
                "price": l.price,
                "description": l.description,
                "image_url": l.image_url,
                "category": l.category,
                "color": l.color,
                "tags": l.tags,
                "condition": l.condition,
                "location": l.location,
                "platform": l.platform,
                "similarity_score": r.similarity_score,
                "deal_score": r.deal_score,
                "savings": f"Save €{max(0, round(500 - l.price))} vs budget",
            })
        return result


# ── Demo ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = UserRequestParser()
    sourcing = SourcingPipeline()
    filt = MultimodalEliminationFilter(parser)
    output = OutputGenerator()

    sample_image = "backend/sample_bike.jpg"
    attrs = parser.parse(
        "matte black mountain bike, budget under €600, disc brakes",
        image_path=sample_image if Path(sample_image).exists() else None,
    )

    print(f"\nParsed wishlist:")
    print(f"  category   : {attrs.category}")
    print(f"  color      : {attrs.color}")
    print(f"  budget     : €{attrs.budget_min}–€{attrs.budget_max}")
    print(f"  condition  : {attrs.condition_pref}")
    print(f"  tags       : {attrs.tags}")
    print(f"  image      : {'loaded' if attrs._image_array is not None else 'not provided'}")

    listings = sourcing.fetch()
    ranked = filt.rank(listings, attrs, reference_image_array=attrs._image_array)

    output.render_terminal(ranked)

    api_output = output.to_api_json(ranked[:3])
    print("Top 3 as API JSON:")
    print(json.dumps(api_output, indent=2))
