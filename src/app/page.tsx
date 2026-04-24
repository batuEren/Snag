"use client";

import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KeyboardEvent, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import React from "react";

interface ResultCard {
  title: string;
  platform: string;
  price: string;
  condition: "Excellent" | "Very Good" | "Good";
  valueScore: number;
  savings: string;
  location: string;
}

interface Message {
  message: string;
  type: "bot" | "user";
  isThinking?: boolean;
  results?: ResultCard[];
}

type FlowStep = "asking_item" | "asking_budget" | "asking_specs" | "searching" | "chat";

interface SearchParams {
  item: string;
  budget: string;
  specs: string;
}

const GRADIENT_BORDER =
  "linear-gradient(#2C2C2E, #2C2C2E) padding-box, linear-gradient(to right, #4fc3f7, #81c784, #ffeb3b, #ff9800, #f06292) border-box";
const GRADIENT_INPUT =
  "linear-gradient(#262628, #262628) padding-box, linear-gradient(to right, #4fc3f7, #81c784, #ffeb3b, #ff9800, #f06292) border-box";

function generateMockResults(item: string, budget: string): ResultCard[] {
  const budgetNum = parseInt(budget.replace(/[^0-9]/g, "")) || 500;
  const lower = item.toLowerCase();

  let titles: [string, string, string];
  if (lower.includes("macbook") || (lower.includes("laptop") && lower.includes("apple"))) {
    titles = ["MacBook Pro 14\" M1 Pro 2021", "MacBook Air M2 2022 8GB/256GB", "MacBook Pro 13\" M1 2020"];
  } else if (lower.includes("laptop") || lower.includes("notebook")) {
    titles = ["Dell XPS 15 9510 i7/16GB/512GB", "Lenovo ThinkPad X1 Carbon Gen 10", "HP Spectre x360 14\" OLED"];
  } else if (lower.includes("iphone")) {
    titles = ["iPhone 14 Pro 128GB Deep Purple", "iPhone 14 Pro Max 256GB", "iPhone 13 Pro 128GB"];
  } else if (lower.includes("samsung") || (lower.includes("phone") && !lower.includes("i"))) {
    titles = ["Samsung Galaxy S23 Ultra 256GB", "Samsung Galaxy S23+ 128GB", "Samsung Galaxy A54 5G"];
  } else if (lower.includes("phone") || lower.includes("smartphone")) {
    titles = ["iPhone 14 128GB Midnight", "Samsung Galaxy S23 128GB", "Google Pixel 7 Pro 256GB"];
  } else if (lower.includes("bike") || lower.includes("fiets") || lower.includes("bicycle")) {
    titles = ["Trek FX3 Disc City Bike 2022", "Gazelle Miss Grace C7 Electric", "Batavus Dinsdag 7-Speed"];
  } else if (lower.includes("camera") || lower.includes("dslr") || lower.includes("mirrorless")) {
    titles = ["Sony A7 IV Mirrorless + 28-70mm", "Canon EOS R6 Body Only", "Fujifilm X-T4 + XF 18-55mm"];
  } else if (lower.includes("tv") || lower.includes("television")) {
    titles = ["LG OLED 55\" C2 4K 2022", "Samsung QLED 55\" Q80B", "Sony Bravia 50\" X90K"];
  } else if (lower.includes("ps5") || lower.includes("playstation")) {
    titles = ["PlayStation 5 Disc + 2 Controllers", "PS5 Digital Edition + DualSense", "PS5 Disc + 3 Games Bundle"];
  } else if (lower.includes("xbox")) {
    titles = ["Xbox Series X 1TB", "Xbox Series X + Game Pass 3mo", "Xbox Series S 512GB"];
  } else if (lower.includes("headphone") || lower.includes("airpod") || lower.includes("earphone")) {
    titles = [`${item} — Sony WH-1000XM5`, `${item} — Bose QuietComfort 45`, `${item} — AirPods Pro 2nd Gen`];
  } else {
    titles = [`${item} — Premium Edition`, `${item} — Like New`, `${item} — Good Condition`];
  }

  const prices = [
    Math.round(budgetNum * 0.67),
    Math.round(budgetNum * 0.79),
    Math.round(budgetNum * 0.89),
  ];
  const valueScores = [91, 83, 74];
  const conditions: ("Excellent" | "Very Good" | "Good")[] = ["Excellent", "Very Good", "Good"];
  const platforms = ["Marktplaats", "2dehands.be", "eBay.nl"];
  const locations = ["Amsterdam", "Rotterdam", "Utrecht"];
  const retailMultipliers = [0.48, 0.38, 0.27];

  return titles.map((title, i) => ({
    title,
    platform: platforms[i],
    price: `€${prices[i]}`,
    condition: conditions[i],
    valueScore: valueScores[i],
    savings: `Save €${Math.round(budgetNum * retailMultipliers[i])} vs retail`,
    location: locations[i],
  }));
}

function generateChatResponse(input: string, params: SearchParams, results: ResultCard[]): string {
  const lower = input.toLowerCase();

  if (lower.includes("cheaper") || lower.includes("lower") || lower.includes("less") || lower.includes("budget")) {
    return `The third option at ${results[2]?.price || "a lower price"} is the most budget-friendly. Once live scraping is active, I can filter for even fresher listings under your budget in real time.`;
  }
  if (lower.includes("negotiat") || lower.includes("offer") || lower.includes("haggle") || lower.includes("counter")) {
    const topPrice = parseInt(results[0]?.price?.replace(/[^0-9]/g, "") || "400");
    return `For second-hand deals, open at around 85% of the asking price. On the top listing that's roughly €${Math.round(topPrice * 0.85)}. Mentioning "cash payment today" on Marktplaats works surprisingly well!`;
  }
  if (lower.includes("more") || lower.includes("other") || lower.includes("different") || lower.includes("else") || lower.includes("another")) {
    return `Once web scraping is live I can also pull from Facebook Marketplace, Vinted, BackMarket, and Swappie simultaneously. Want me to try a slightly different search query in the meantime?`;
  }
  if (lower.includes("best") || lower.includes("recommend") || lower.includes("which") || lower.includes("top") || lower.includes("pick")) {
    const top = results[0];
    return `I'd go with the ${top?.title} — ${top?.valueScore}% deal score, ${top?.condition.toLowerCase()} condition, and the biggest savings vs retail. It's the strongest value across all three results.`;
  }
  if (lower.includes("condition") || lower.includes("quality") || lower.includes("damage") || lower.includes("scratch")) {
    return `"Excellent" means no visible wear and all original accessories present. "Very Good" may have minor surface marks. Always ask the seller for extra photos and check if the battery health is included in the listing.`;
  }
  if (lower.includes("ship") || lower.includes("deliver") || lower.includes("pickup") || lower.includes("meet")) {
    return `All three listings are within the Netherlands. Marktplaats listings usually offer both local pickup and PostNL shipping. For valuables I always recommend meeting in person or using Marktplaats Aanbetaling for buyer protection.`;
  }
  return `Good question! Once web scraping goes live I'll be able to pull real-time data to answer that accurately. For now, the value scores factor in current market prices, condition, and platform averages for your item.`;
}

const INITIAL_MESSAGE: Message = {
  message: "Hey! I'm Scout, your personal deal hunter 🔍 What are you looking to buy today?",
  type: "bot",
};

export default function BuyShitFast() {
  const scrollRef = useRef<null | HTMLDivElement>(null);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const [userInput, setUserInput] = useState("");
  const [flowStep, setFlowStep] = useState<FlowStep>("asking_item");
  const [searchParams, setSearchParams] = useState<SearchParams>({ item: "", budget: "", specs: "" });
  const [searchResults, setSearchResults] = useState<ResultCard[]>([]);
  const [conversation, setConversation] = useState<Message[]>([INITIAL_MESSAGE]);

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const addMessage = (message: Message) => {
    setConversation((old) => [...old, message]);
    if (message.type === "user") {
      scrollToBottom();
    } else {
      const end = messagesEndRef.current?.getBoundingClientRect()?.top || 0;
      const top = scrollRef.current?.getBoundingClientRect()?.top || 0;
      const height = scrollRef.current?.clientHeight || 0;
      if (height - (end - top) >= -200) scrollToBottom();
    }
  };

  const runSearch = async (params: SearchParams) => {
    setFlowStep("searching");

    setConversation((old) => [
      ...old,
      { message: "On it! Scanning the best second-hand platforms...", type: "bot", isThinking: true },
    ]);
    scrollToBottom();

    const steps: [number, string][] = [
      [1100, "Searching Marktplaats..."],
      [1000, "Checking 2dehands.be..."],
      [1200, "Analyzing value & prices..."],
    ];

    for (const [ms, msg] of steps) {
      await new Promise<void>((r) => setTimeout(r, ms));
      setConversation((old) => [
        ...old.slice(0, -1),
        { message: msg, type: "bot", isThinking: true },
      ]);
    }

    await new Promise<void>((r) => setTimeout(r, 1300));

    const results = generateMockResults(params.item, params.budget);
    setSearchResults(results);

    setConversation((old) => [
      ...old.slice(0, -1),
      {
        message: `Found ${results.length} great deals matching your criteria! Here are the best ones:`,
        type: "bot",
        results,
      },
    ]);
    scrollToBottom();

    await new Promise<void>((r) => setTimeout(r, 500));

    const top = results[0];
    setConversation((old) => [
      ...old,
      {
        message: `Best value pick: ${top.title} at ${top.price} — ${top.valueScore}% deal score. Want to refine the search or need help negotiating a lower price?`,
        type: "bot",
      },
    ]);
    scrollToBottom();

    setFlowStep("chat");
  };

  const handleSendMessage = async () => {
    const input = userInput.trim();
    if (!input || flowStep === "searching") return;

    setUserInput("");
    addMessage({ message: input, type: "user" });

    switch (flowStep) {
      case "asking_item": {
        const newParams = { item: input, budget: "", specs: "" };
        setSearchParams(newParams);
        setFlowStep("asking_budget");
        setTimeout(() => {
          addMessage({
            message: `Nice! What's your budget for the ${input}? (e.g., €500 or "under €800")`,
            type: "bot",
          });
        }, 400);
        break;
      }

      case "asking_budget": {
        const newParams = { ...searchParams, budget: input };
        setSearchParams(newParams);
        setFlowStep("asking_specs");
        setTimeout(() => {
          addMessage({
            message: `Got it — budget of ${input}. Any specific requirements? (brand, storage, condition, color, etc.) Type "any" to skip.`,
            type: "bot",
          });
        }, 400);
        break;
      }

      case "asking_specs": {
        const specs = input.toLowerCase() === "any" ? "" : input;
        const fullParams = { ...searchParams, specs };
        setSearchParams(fullParams);
        setTimeout(() => runSearch(fullParams), 200);
        break;
      }

      case "chat": {
        setTimeout(() => {
          setConversation((old) => [...old, { message: "...", type: "bot", isThinking: true }]);
          scrollToBottom();
          setTimeout(() => {
            setConversation((old) => [
              ...old.slice(0, -1),
              {
                message: generateChatResponse(input, searchParams, searchResults),
                type: "bot",
              },
            ]);
            scrollToBottom();
          }, 1400);
        }, 300);
        break;
      }
    }
  };

  const handleReset = () => {
    setFlowStep("asking_item");
    setSearchParams({ item: "", budget: "", specs: "" });
    setSearchResults([]);
    setUserInput("");
    setConversation([INITIAL_MESSAGE]);
  };

  const handleEnter = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getPlaceholder = () => {
    switch (flowStep) {
      case "asking_item":   return "What would you like to buy?";
      case "asking_budget": return "Enter your budget (e.g., €500)";
      case "asking_specs":  return "Any requirements? (or type 'any' to skip)";
      case "searching":     return "Searching for deals...";
      case "chat":          return "Ask Scout anything...";
    }
  };

  return (
    <main className="h-screen flex flex-col" style={{ background: "#181614" }}>
      {/* Scout header */}
      <div className="w-full flex justify-center items-center py-4 mb-2">
        <div
          className="w-16 h-16 flex items-center justify-center text-3xl mr-4 flex-shrink-0"
          style={{
            border: "3px solid transparent",
            borderRadius: "50%",
            background: GRADIENT_BORDER,
            backgroundClip: "padding-box, border-box",
          }}
        >
          🔍
        </div>
        <div className="flex flex-col justify-center">
          <span className="text-white text-2xl font-bold leading-tight">Scout</span>
          <span className="text-white text-sm font-light tracking-wide mt-1">buy shit fast agent</span>
        </div>
      </div>

      <ScrollArea ref={scrollRef} className="flex-1 overflow-x-hidden">
        <div className="flex flex-col gap-1 p-2 max-w-3xl mx-auto">
          {conversation.map((msg, i) => (
            <div key={i} className="flex gap-2 first:mt-2">
              {msg.type === "bot" ? (
                <div
                  className="w-full overflow-hidden p-4 rounded-[20px] text-white relative font-medium max-w-[75%] mr-auto"
                  style={{
                    border: "3px solid transparent",
                    borderRadius: "20px",
                    background: GRADIENT_BORDER,
                    backgroundClip: "padding-box, border-box",
                  }}
                >
                  {msg.isThinking ? (
                    <span className="inline-block animate-pulse text-2xl">...</span>
                  ) : (
                    <>
                      <span className="whitespace-pre-wrap break-words">{msg.message}</span>
                      {msg.results && msg.results.length > 0 && (
                        <div className="flex flex-col gap-3 mt-3 w-full">
                          {msg.results.map((r, ri) => (
                            <div
                              key={ri}
                              className="rounded-2xl p-3 relative"
                              style={{ background: "#1a1a1c", border: "1px solid #3a3a3c" }}
                            >
                              {ri === 0 && (
                                <span
                                  className="absolute -top-2.5 left-3 text-xs font-bold px-2 py-0.5 rounded-full"
                                  style={{ background: "#16a34a", color: "#fff" }}
                                >
                                  Best Deal
                                </span>
                              )}
                              <div className="flex justify-between items-start gap-2 mt-1">
                                <span className="text-white font-semibold text-sm flex-1 leading-snug">
                                  {r.title}
                                </span>
                                <span
                                  className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                                  style={{
                                    background:
                                      r.valueScore >= 80
                                        ? "#16a34a33"
                                        : r.valueScore >= 65
                                        ? "#d9770633"
                                        : "#dc262633",
                                    color:
                                      r.valueScore >= 80
                                        ? "#4ade80"
                                        : r.valueScore >= 65
                                        ? "#fb923c"
                                        : "#f87171",
                                  }}
                                >
                                  {r.valueScore}% deal
                                </span>
                              </div>
                              <div className="text-gray-500 text-xs mt-0.5">
                                {r.platform} · 📍 {r.location}
                              </div>
                              <div className="flex justify-between items-end mt-2">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[#2196f3] text-xl font-bold">{r.price}</span>
                                  <span className="text-green-400 text-xs">{r.savings}</span>
                                </div>
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full"
                                  style={{
                                    background:
                                      r.condition === "Excellent"
                                        ? "#16a34a22"
                                        : r.condition === "Very Good"
                                        ? "#2563eb22"
                                        : "#78716c22",
                                    color:
                                      r.condition === "Excellent"
                                        ? "#4ade80"
                                        : r.condition === "Very Good"
                                        ? "#60a5fa"
                                        : "#a8a29e",
                                  }}
                                >
                                  {r.condition}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="max-w-[60%] flex flex-col text-white bg-[#2196f3] ml-auto items-start gap-2 rounded-[20px] p-4 text-left text-base font-medium transition-all whitespace-pre-wrap break-words">
                  {msg.message}
                </div>
              )}
            </div>
          ))}
        </div>
        <div ref={messagesEndRef} className="mb-2" />
      </ScrollArea>

      {/* Input bar */}
      <div className="w-full sm:max-w-3xl mx-auto">
        <div className="p-8">
          <div
            className="flex flex-row items-center gap-4 border-none px-4 py-3"
            style={{
              border: "3px solid transparent",
              borderRadius: "40px",
              background: GRADIENT_INPUT,
              backgroundClip: "padding-box, border-box",
            }}
          >
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center justify-center h-12 w-12 rounded-full focus:outline-none transition-opacity hover:opacity-70"
              style={{ color: "#2196f3" }}
              tabIndex={0}
              aria-label="Start new search"
              title="Start new search"
            >
              <RefreshCw className="h-6 w-6" />
            </button>

            <AutosizeTextarea
              className="flex-1 outline-none border-0 bg-transparent text-white placeholder-gray-400 text-2xl px-0"
              placeholder={getPlaceholder()}
              minHeight={25}
              maxHeight={55}
              rows={1}
              onKeyDown={handleEnter}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              disabled={flowStep === "searching"}
            />

            <Button
              onClick={handleSendMessage}
              disabled={flowStep === "searching" || !userInput.trim()}
              className="h-12 w-12 p-0 bg-[#2196f3] hover:bg-blue-600 rounded-full flex items-center justify-center"
              style={{ minWidth: 48, minHeight: 48 }}
              aria-label="Send message"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 text-white"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
