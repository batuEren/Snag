"use client";

import { useState } from "react";

interface Listing {
  title: string;
  price: string;
  condition?: string;
  location?: string;
  link?: string;
}

interface Draft {
  style: string;
  label: string;
  message: string;
}

interface NegotiationCopilotProps {
  listing: Listing;
  onClose: () => void;
  initialTargetPrice?: string;
}

const STYLE_META: Record<string, { emoji: string; color: string; bg: string; border: string }> = {
  direct:   { emoji: "⚡", color: "#60a5fa", bg: "rgba(33,150,243,0.10)",  border: "rgba(33,150,243,0.22)" },
  friendly: { emoji: "🤝", color: "#4ade80", bg: "rgba(74,222,128,0.07)", border: "rgba(74,222,128,0.20)" },
  haggler:  { emoji: "🔥", color: "#fb923c", bg: "rgba(251,146,60,0.09)",  border: "rgba(251,146,60,0.22)" },
};

function suggestedPrice(price: string): string {
  const numeric = parseFloat(price.replace(/[^0-9.,]/g, "").replace(",", "."));
  if (isNaN(numeric)) return "e.g. €350";
  const symbol = price.match(/[€$£¥]/)?.[0] ?? "€";
  return `e.g. ${symbol}${Math.round(numeric * 0.8)}`;
}

export default function NegotiationCopilot({ listing, onClose, initialTargetPrice }: NegotiationCopilotProps) {
  const [targetPrice, setTargetPrice] = useState(initialTargetPrice ?? "");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [step, setStep] = useState<"input" | "results">("input");
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<"nl" | "en">("nl");

  const handleGenerate = async () => {
    if (!targetPrice.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing, targetPrice, language }),
      });
      const data = await res.json();
      if (data.drafts && data.drafts.length > 0) {
        setDrafts(data.drafts);
        setStep("results");
      } else {
        setError("Could not generate drafts. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (message: string, index: number) => {
    try {
      await navigator.clipboard.writeText(message);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Fallback for environments without clipboard API
      const el = document.createElement("textarea");
      el.value = message;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg flex flex-col"
        style={{
          background: "rgba(12,12,18,0.98)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "20px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.75)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
              style={{ background: "rgba(33,150,243,0.12)", border: "1px solid rgba(33,150,243,0.28)" }}
            >
              💬
            </div>
            <div>
              <h2 className="text-white font-bold text-sm leading-none">Negotiation Copilot</h2>
              <p className="text-gray-500 text-xs mt-0.5">Ghost-write your offer in {language === "nl" ? "Dutch" : "English"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center rounded-lg overflow-hidden text-xs font-semibold"
              style={{ border: "1px solid rgba(255,255,255,0.11)" }}
            >
              {(["nl", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => { setLanguage(lang); setStep("input"); setDrafts([]); }}
                  className="px-2.5 py-1 transition-colors"
                  style={{
                    background: language === lang ? "rgba(33,150,243,0.25)" : "transparent",
                    color: language === lang ? "#60a5fa" : "#6b7280",
                  }}
                >
                  {lang === "nl" ? "🇳🇱 NL" : "🇬🇧 EN"}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Listing summary pill */}
          <div
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{listing.title}</p>
              <p className="text-gray-400 text-xs mt-0.5">
                {listing.price}
                {listing.condition ? ` · ${listing.condition}` : ""}
                {listing.location ? ` · ${listing.location}` : ""}
              </p>
            </div>
            {listing.link && (
              <a
                href={listing.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:scale-105 flex-shrink-0 no-underline"
                style={{
                  background: "rgba(33,150,243,0.14)",
                  color: "#60a5fa",
                  border: "1px solid rgba(33,150,243,0.24)",
                }}
              >
                Go to Chat ↗
              </a>
            )}
          </div>

          {step === "input" ? (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-white font-semibold text-sm mb-1">Your Target Price</label>
                <p className="text-gray-500 text-xs">
                  What price are you hoping to pay? We'll craft 3 Dutch messages around it.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={suggestedPrice(listing.price)}
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                  className="flex-1 text-white placeholder-gray-600 text-sm px-4 py-2.5 rounded-xl outline-none"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.11)",
                  }}
                  autoFocus
                />
                <button
                  onClick={handleGenerate}
                  disabled={!targetPrice.trim() || loading}
                  className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:scale-105 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{ background: "#2196f3" }}
                >
                  {loading ? (
                    <span className="inline-block animate-pulse">Generating…</span>
                  ) : (
                    "Generate"
                  )}
                </button>
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold text-sm">
                  3 Message Drafts{" "}
                  <span className="text-gray-500 font-normal text-xs">(written in {language === "nl" ? "Dutch" : "English"})</span>
                </span>
                <button
                  onClick={() => { setStep("input"); setDrafts([]); }}
                  className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
                >
                  ← Change target
                </button>
              </div>

              {drafts.map((draft, i) => {
                const meta = STYLE_META[draft.style] ?? STYLE_META.direct;
                const isCopied = copiedIndex === i;
                return (
                  <div
                    key={i}
                    className="p-4 rounded-xl flex flex-col gap-2.5"
                    style={{
                      background: meta.bg,
                      border: `1px solid ${meta.border}`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{meta.emoji}</span>
                        <span className="text-xs font-bold" style={{ color: meta.color }}>
                          {draft.label}
                        </span>
                      </div>
                      <button
                        onClick={() => handleCopy(draft.message, i)}
                        className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all hover:scale-105 active:scale-95"
                        style={{
                          background: isCopied ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.07)",
                          color: isCopied ? "#4ade80" : "#9ca3af",
                          border: `1px solid ${isCopied ? "rgba(74,222,128,0.30)" : "rgba(255,255,255,0.09)"}`,
                        }}
                      >
                        {isCopied ? "✓ Copied!" : "Copy Message"}
                      </button>
                    </div>
                    <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                      {draft.message}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
