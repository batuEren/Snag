"use client";

import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KeyboardEvent, useRef, useState } from "react";
import { RefreshCw, Paperclip } from "lucide-react";
import React from "react";
import NegotiationCopilot from "@/components/NegotiationCopilot";

interface ResultCard {
  title: string;
  platform: string;
  price: string;
  condition: "Excellent" | "Very Good" | "Good";
  valueScore: number;
  savings: string;
  location: string;
  link?: string;
  image?: string;
}

interface Message {
  message: string;
  type: "bot" | "user";
  isThinking?: boolean;
  results?: ResultCard[];
  images?: string[];
}

type FlowStep = "asking_item" | "asking_budget" | "asking_specs" | "searching" | "chat";

interface SearchParams {
  item: string;
  budget: string;
  specs: string;
}

// Score arc ring displayed next to each result card
function ScoreRing({ score }: { score: number }) {
  const r = 13;
  const circ = 2 * Math.PI * r;
  const filled = circ * (score / 100);
  const color = score >= 80 ? "#4ade80" : score >= 65 ? "#fb923c" : "#f87171";
  return (
    <svg width="38" height="38" viewBox="0 0 36 36" className="flex-shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
      <circle
        cx="18" cy="18" r={r}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="22.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={color}>
        {score}
      </text>
    </svg>
  );
}

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

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

type ClaudeMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

function imageToContentBlock(dataUrl: string): ContentBlock | null {
  const match = dataUrl.match(/^data:(image\/[\w+]+);base64,([\s\S]+)$/);
  if (!match) return null;
  return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
}

function buildClaudeMessages(
  conversation: Message[],
  newInput: string,
  imageBase64?: string | null
): ClaudeMessage[] {
  const history: ClaudeMessage[] = conversation
    .filter((m) => !m.isThinking && m.message.trim() && m.message !== "...")
    .map((m) => {
      if (m.type === "user" && m.images && m.images.length > 0) {
        const blocks: ContentBlock[] = [];
        for (const img of m.images) {
          const block = imageToContentBlock(img);
          if (block) blocks.push(block);
        }
        blocks.push({ type: "text", text: m.message });
        return { role: "user" as const, content: blocks };
      }
      return { role: (m.type === "user" ? "user" : "assistant") as "user" | "assistant", content: m.message };
    });

  let newContent: string | ContentBlock[];
  if (imageBase64) {
    const block = imageToContentBlock(imageBase64);
    newContent = block
      ? [block, { type: "text", text: newInput }]
      : newInput;
  } else {
    newContent = newInput;
  }

  const all: ClaudeMessage[] = [...history, { role: "user" as const, content: newContent }];
  const recent = all.slice(-12);
  const firstUser = recent.findIndex((m) => m.role === "user");
  return firstUser >= 0 ? recent.slice(firstUser) : [{ role: "user", content: newContent }];
}

async function callChatAPI(
  messages: ClaudeMessage[],
  searchParams: SearchParams,
  results: ResultCard[],
  flowStep?: string
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, searchParams, results, flowStep }),
  });
  const data = await res.json();
  return data.reply as string;
}

const INITIAL_MESSAGE: Message = {
  message: "Hey! I'm Scout, your personal deal hunter 🔍 What are you looking to buy today?",
  type: "bot",
};

const conditionColor = {
  Excellent:  { bg: "#16a34a18", text: "#4ade80" },
  "Very Good": { bg: "#2563eb18", text: "#60a5fa" },
  Good:       { bg: "#78716c18", text: "#a8a29e" },
} as const;

export default function BuyShitFast() {
  const scrollRef = useRef<null | HTMLDivElement>(null);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const [userInput, setUserInput] = useState("");
  const [flowStep, setFlowStep] = useState<FlowStep>("asking_item");
  const [searchParams, setSearchParams] = useState<SearchParams>({ item: "", budget: "", specs: "" });
  const [searchResults, setSearchResults] = useState<ResultCard[]>([]);
  const [conversation, setConversation] = useState<Message[]>([INITIAL_MESSAGE]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [inputHint, setInputHint] = useState("What would you like to buy?");
  const [negotiatingListing, setNegotiatingListing] = useState<ResultCard | null>(null);

  const hintForStep: Record<FlowStep, string> = {
    asking_item:   "What would you like to buy?",
    asking_budget: "Your budget (e.g. €300)",
    asking_specs:  "Requirements, or 'any' to skip",
    searching:     "Searching for deals…",
    chat:          "Ask Scout anything…",
  };

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

    const searchPromise = fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    })
      .then((r) => r.json())
      .catch(() => ({ results: [] }));

    const steps: [number, string][] = [
      [1100, "Searching Marktplaats..."],
      [1000, "Checking prices & availability..."],
      [1200, "Analyzing value & deals..."],
    ];

    for (const [ms, msg] of steps) {
      await new Promise<void>((r) => setTimeout(r, ms));
      setConversation((old) => [
        ...old.slice(0, -1),
        { message: msg, type: "bot", isThinking: true },
      ]);
    }

    const searchData = await searchPromise;
    const liveResults: ResultCard[] = searchData.results ?? [];
    const results: ResultCard[] =
      liveResults.length > 0 ? liveResults : generateMockResults(params.item, params.budget);

    await new Promise<void>((r) => setTimeout(r, 500));

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

    const summaryMessages = buildClaudeMessages([], `I found ${results.length} deals for a ${params.item} within ${params.budget}. Give a short summary of the best pick and offer to help.`);
    const summaryReply = await callChatAPI(summaryMessages, params, results);

    setConversation((old) => [
      ...old,
      { message: summaryReply, type: "bot" },
    ]);
    setInputHint(hintForStep["chat"]);
    scrollToBottom();

    setFlowStep("chat");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX = 512;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      setUploadedImage(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.src = URL.createObjectURL(file);
  };

  const handleSendMessage = async () => {
    const input = userInput.trim();
    if (!input || flowStep === "searching") return;

    const currentImage = uploadedImage;
    setUploadedImage(null);
    setUserInput("");
    addMessage({ message: input, type: "user", images: currentImage ? [currentImage] : undefined });

    switch (flowStep) {
      case "asking_item": {
        const newParams = { item: input, budget: "", specs: "" };
        setSearchParams(newParams);
        setFlowStep("asking_budget");
        setConversation((old) => [...old, { message: "...", type: "bot", isThinking: true }]);
        scrollToBottom();
        const budgetPromptMsgs = buildClaudeMessages(conversation, input, currentImage);
        const budgetQuestion = await callChatAPI(budgetPromptMsgs, newParams, [], "asking_budget");
        setConversation((old) => [...old.slice(0, -1), { message: budgetQuestion, type: "bot" }]);
        setInputHint(hintForStep["asking_budget"]);
        scrollToBottom();
        break;
      }

      case "asking_budget": {
        const looksLikeBudget = /\d/.test(input) || /[€$£]/.test(input) ||
          /\b(any|whatever|flexible|open|no limit|no budget|doesn't matter|don't care|idc)\b/i.test(input);

        const looksLikeNewItem = !!currentImage ||
          /\b(actually|instead|changed my mind|want to buy|looking for|find me|i need|how about|what about|i want|search for|buy a|get a|find a|i changed|forget it|nevermind|never mind)\b/i.test(input);

        if (!looksLikeBudget && looksLikeNewItem) {
          const newParams = { item: input, budget: "", specs: "" };
          setSearchParams(newParams);
          setFlowStep("asking_budget");
          setConversation((old) => [...old, { message: "...", type: "bot", isThinking: true }]);
          scrollToBottom();
          const redirectMsgs = buildClaudeMessages(conversation, input, currentImage);
          const budgetQuestion = await callChatAPI(redirectMsgs, newParams, [], "asking_budget");
          setConversation((old) => [...old.slice(0, -1), { message: budgetQuestion, type: "bot" }]);
          setInputHint(hintForStep["asking_budget"]);
          scrollToBottom();
          break;
        }

        if (!looksLikeBudget) {
          const nudge = "I need a rough budget to find you the best deals! Even a range like €100–300 or just 'any' works fine.";
          setConversation((old) => [...old, { message: nudge, type: "bot" }]);
          scrollToBottom();
          break;
        }

        const newParams = { ...searchParams, budget: input };
        setSearchParams(newParams);
        setFlowStep("asking_specs");
        setConversation((old) => [...old, { message: "...", type: "bot", isThinking: true }]);
        scrollToBottom();
        const specsPromptMsgs = buildClaudeMessages(conversation, input, currentImage);
        const specsQuestion = await callChatAPI(specsPromptMsgs, newParams, [], "asking_specs");
        setConversation((old) => [...old.slice(0, -1), { message: specsQuestion, type: "bot" }]);
        setInputHint(hintForStep["asking_specs"]);
        scrollToBottom();
        break;
      }

      case "asking_specs": {
        const looksLikeNewItemInSpecs = !!currentImage ||
          /\b(actually|instead|changed my mind|want to buy|looking for|find me|i need|how about|what about|i want|search for|buy a|get a|find a|i changed|forget it|nevermind|never mind)\b/i.test(input);

        if (looksLikeNewItemInSpecs) {
          const newParams = { item: input, budget: "", specs: "" };
          setSearchParams(newParams);
          setFlowStep("asking_budget");
          setConversation((old) => [...old, { message: "...", type: "bot", isThinking: true }]);
          scrollToBottom();
          const redirectMsgs = buildClaudeMessages(conversation, input, currentImage);
          const budgetQuestion = await callChatAPI(redirectMsgs, newParams, [], "asking_budget");
          setConversation((old) => [...old.slice(0, -1), { message: budgetQuestion, type: "bot" }]);
          setInputHint(hintForStep["asking_budget"]);
          scrollToBottom();
          break;
        }

        const specs = input.toLowerCase() === "any" ? "" : input;
        const fullParams = { ...searchParams, specs };
        setSearchParams(fullParams);
        setTimeout(() => runSearch(fullParams), 200);
        break;
      }

      case "chat": {
        const newSearchIntent =
          /\b(search(?:ing)? for|find (?:me |a |an |some )|look(?:ing)? for|show me (?:a |some |listings? for)|i want (?:to buy|to find|to search)|i(?:'m| am) looking for|can you (?:find|search|look for)|also (?:find|search|look for)|what about (?:buying |finding |searching for )?(?:a |an )?|how about (?:a |an )?)\b/i.test(input);

        if (newSearchIntent) {
          setConversation((old) => [...old, { message: "...", type: "bot", isThinking: true }]);
          scrollToBottom();
          const extractMsgs = buildClaudeMessages(conversation, input, currentImage);
          const rawItem = await callChatAPI(extractMsgs, searchParams, [], "extract_item");
          const cleanItem = rawItem.trim().replace(/[.!?,]$/, "") || input;
          const newParams = { item: cleanItem, budget: "", specs: "" };
          setSearchParams(newParams);
          setFlowStep("asking_budget");
          const budgetMsgs = buildClaudeMessages(conversation, input, currentImage);
          const budgetQuestion = await callChatAPI(budgetMsgs, newParams, [], "asking_budget");
          setConversation((old) => [...old.slice(0, -1), { message: budgetQuestion, type: "bot" }]);
          setInputHint(hintForStep["asking_budget"]);
          scrollToBottom();
          break;
        }

        setConversation((old) => [...old, { message: "...", type: "bot", isThinking: true }]);
        scrollToBottom();
        const msgs = buildClaudeMessages(conversation, input, currentImage);
        const reply = await callChatAPI(msgs, searchParams, searchResults);
        setConversation((old) => [
          ...old.slice(0, -1),
          { message: reply, type: "bot" },
        ]);
        setInputHint(hintForStep["chat"]);
        scrollToBottom();
        break;
      }
    }
  };

  const handleReset = () => {
    setFlowStep("asking_item");
    setSearchParams({ item: "", budget: "", specs: "" });
    setSearchResults([]);
    setUserInput("");
    setUploadedImage(null);
    setConversation([INITIAL_MESSAGE]);
    setInputHint(hintForStep["asking_item"]);
  };

  const handleEnter = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getPlaceholder = () => {
    if (flowStep === "searching") return "Searching for deals...";
    return inputHint;
  };

  return (
    <main
      className="h-screen flex flex-col"
      style={{
        background: "radial-gradient(ellipse at 20% 0%, rgba(79,70,229,0.28) 0%, transparent 52%), radial-gradient(ellipse at 80% 100%, rgba(16,185,129,0.12) 0%, transparent 50%), #0c0c10",
      }}
    >
      {/* Slim header bar */}
      <div
        className="w-full flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: "rgba(33,150,243,0.12)",
              border: "1px solid rgba(33,150,243,0.3)",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#2196f3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-white font-bold text-lg leading-none">Scout</span>
            <span className="text-gray-500 text-xs">deal hunter</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-gray-500 text-xs">online</span>
        </div>
      </div>

      <ScrollArea ref={scrollRef} className="flex-1 overflow-x-hidden">
        <div className="flex flex-col gap-2 p-4 max-w-3xl mx-auto">
          {conversation.map((msg, i) => (
            <div key={i} className="flex gap-2 first:mt-2 msg-slide-in">
              {msg.type === "bot" ? (
                <div
                  className="w-full overflow-hidden p-4 text-white relative font-medium max-w-[75%] mr-auto"
                  style={{
                    borderRadius: "14px",
                    background: "rgba(22,22,30,0.75)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
                  }}
                >
                  {msg.isThinking ? (
                    <span className="inline-block animate-pulse text-2xl tracking-widest">···</span>
                  ) : (
                    <>
                      <span className="whitespace-pre-wrap break-words">{msg.message}</span>
                      {msg.results && msg.results.length > 0 && (
                        <div className="flex flex-col gap-2.5 mt-3 w-full">
                          {msg.results.map((r, ri) => (
                            <div
                              key={ri}
                              className="p-3 relative transition-all hover:brightness-110"
                              style={{
                                background: "rgba(255,255,255,0.04)",
                                backdropFilter: "blur(8px)",
                                WebkitBackdropFilter: "blur(8px)",
                                border: "1px solid rgba(255,255,255,0.07)",
                                borderLeft: ri === 0 ? "3px solid #4ade80" : "3px solid rgba(255,255,255,0.07)",
                                borderRadius: "12px",
                              }}
                            >
                              <div className="flex gap-3 items-start">
                                {r.image && (
                                  <img
                                    src={r.image}
                                    alt={r.title}
                                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-white font-semibold text-sm leading-snug flex-1">
                                      {r.title}
                                    </span>
                                    <ScoreRing score={r.valueScore} />
                                  </div>
                                  <span className="text-gray-500 text-xs">
                                    {r.platform} · 📍 {r.location}
                                  </span>
                                  <div className="flex items-baseline gap-2 mt-1.5">
                                    <span className="text-[#2196f3] text-lg font-bold">{r.price}</span>
                                    <span className="text-green-400 text-xs">{r.savings}</span>
                                  </div>
                                  <div className="flex items-center justify-between mt-2">
                                    <span
                                      className="text-xs px-2 py-0.5 rounded-full"
                                      style={{
                                        background: conditionColor[r.condition].bg,
                                        color: conditionColor[r.condition].text,
                                      }}
                                    >
                                      {r.condition}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => setNegotiatingListing(r)}
                                        className="text-xs px-2.5 py-1 rounded-lg font-semibold transition-all hover:scale-105 active:scale-95"
                                        style={{
                                          background: "rgba(33,150,243,0.15)",
                                          color: "#60a5fa",
                                          border: "1px solid rgba(33,150,243,0.25)",
                                        }}
                                      >
                                        Make Offer
                                      </button>
                                      {r.link && (
                                        <a
                                          href={r.link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[#2196f3] text-xs font-medium no-underline hover:underline"
                                        >
                                          View ↗
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div
                  className="max-w-[60%] flex flex-col text-white ml-auto items-start gap-2 p-4 text-left text-base font-medium"
                  style={{
                    borderRadius: "14px",
                    background: "rgba(33,150,243,0.88)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    boxShadow: "0 4px 20px rgba(33,150,243,0.22)",
                  }}
                >
                  {msg.images?.map((src, ii) => (
                    <img key={ii} src={src} alt="attached" className="w-full rounded-xl object-cover max-h-48" />
                  ))}
                  <span className="whitespace-pre-wrap break-words">{msg.message}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div ref={messagesEndRef} className="mb-2" />
      </ScrollArea>

      {/* Negotiation Copilot overlay */}
      {negotiatingListing && (
        <NegotiationCopilot
          listing={negotiatingListing}
          onClose={() => setNegotiatingListing(null)}
        />
      )}

      {/* Input bar */}
      <div className="w-full sm:max-w-3xl mx-auto">
        <div className="p-6">
          <div
            className="input-container flex flex-row items-center gap-4 px-4 py-3"
            style={{
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: "16px",
              background: "rgba(22,22,30,0.8)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
            }}
          >
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center justify-center h-10 w-10 rounded-full focus:outline-none transition-all hover:opacity-70 hover:scale-110 active:scale-95"
              style={{ color: "#2196f3" }}
              tabIndex={0}
              aria-label="Start new search"
              title="Start new search"
            >
              <RefreshCw className="h-5 w-5" />
            </button>

            <AutosizeTextarea
              className="flex-1 outline-none border-0 bg-transparent text-white placeholder-gray-500 text-xl px-0"
              placeholder={getPlaceholder()}
              minHeight={25}
              maxHeight={55}
              rows={1}
              onKeyDown={handleEnter}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              disabled={flowStep === "searching"}
            />

            {flowStep !== "searching" && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {uploadedImage && (
                  <div className="relative">
                    <img src={uploadedImage} alt="preview" className="h-10 w-10 rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => setUploadedImage(null)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: "#ef4444", lineHeight: 1 }}
                      aria-label="Remove image"
                    >
                      ×
                    </button>
                  </div>
                )}
                <label
                  className="flex items-center cursor-pointer transition-all hover:scale-110"
                  style={{ color: uploadedImage ? "#4fc3f7" : "#6b7280" }}
                  title={uploadedImage ? "Photo attached — click to change" : "Attach a photo"}
                >
                  <Paperclip className="h-5 w-5" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
            )}

            <Button
              onClick={handleSendMessage}
              disabled={flowStep === "searching" || !userInput.trim()}
              className="h-10 w-10 p-0 bg-[#2196f3] hover:bg-blue-500 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 hover:shadow-[0_0_16px_rgba(33,150,243,0.5)]"
              style={{ minWidth: 40, minHeight: 40 }}
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
                className="h-5 w-5 text-white"
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
