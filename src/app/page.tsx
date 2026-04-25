"use client";

import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { RefreshCw, Paperclip, Plus, MessageSquare, X, Sun, Moon, ChevronDown } from "lucide-react";
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
type Theme = "dark" | "light" | "hc";

interface SearchParams {
  item: string;
  budget: string;
  specs: string;
}

interface ChatSession {
  id: string;
  title: string;
  conversation: Message[];
  flowStep: FlowStep;
  searchParams: SearchParams;
  searchResults: ResultCard[];
  updatedAt: number;
}

function groupSessionsByDate(sessions: ChatSession[]) {
  const today = new Date().setHours(0, 0, 0, 0);
  const yesterday = today - 86400000;
  const week = today - 7 * 86400000;

  const groups: { label: string; sessions: ChatSession[] }[] = [
    { label: "Today", sessions: [] },
    { label: "Yesterday", sessions: [] },
    { label: "Previous 7 days", sessions: [] },
    { label: "Older", sessions: [] },
  ];

  for (const s of [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (s.updatedAt >= today) groups[0].sessions.push(s);
    else if (s.updatedAt >= yesterday) groups[1].sessions.push(s);
    else if (s.updatedAt >= week) groups[2].sessions.push(s);
    else groups[3].sessions.push(s);
  }

  return groups.filter((g) => g.sessions.length > 0);
}

// Score arc ring displayed next to each result card
function ScoreRing({ score }: { score: number }) {
  const r = 13;
  const circ = 2 * Math.PI * r;
  const filled = circ * (score / 100);
  const color = score >= 80 ? "#4ade80" : score >= 65 ? "#fb923c" : "#f87171";
  return (
    <svg width="38" height="38" viewBox="0 0 36 36" className="flex-shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" style={{ stroke: "var(--color-score-track)" }} strokeWidth="2.5" />
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

function ThemeSelector({ theme, onThemeChange }: { theme: Theme; onThemeChange: (t: Theme) => void }) {
  const [open, setOpen] = useState(false);

  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "dark",  label: "Dark",          icon: <Moon className="h-3.5 w-3.5" /> },
    { value: "light", label: "Light",         icon: <Sun  className="h-3.5 w-3.5" /> },
    { value: "hc",    label: "High Contrast", icon: <span className="text-[10px] font-bold leading-none">HC</span> },
  ];

  const current = options.find((o) => o.value === theme)!;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
        style={{
          background: "var(--bg-theme-btn)",
          border: "1px solid var(--border-theme-btn)",
          color: "var(--color-text-secondary)",
        }}
      >
        {current.icon}
        <span>{current.label}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-50 min-w-[140px]"
          style={{
            background: "var(--bg-theme-dropdown)",
            border: "1px solid var(--border-theme-dropdown)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onMouseDown={() => { onThemeChange(opt.value); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left transition-all"
              style={{
                color: "var(--color-text-secondary)",
                background: opt.value === theme ? "var(--bg-theme-option-active)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (opt.value !== theme)
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-theme-option-hover)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  opt.value === theme ? "var(--bg-theme-option-active)" : "transparent";
              }}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const rawHistory: ClaudeMessage[] = conversation
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

  // Anthropic requires strict user/assistant alternation. Merge consecutive same-role
  // messages so two bot messages in a row (e.g. results card + summary) don't cause a 400.
  const history: ClaudeMessage[] = [];
  for (const msg of rawHistory) {
    const last = history[history.length - 1];
    if (last && last.role === msg.role && typeof last.content === "string" && typeof msg.content === "string") {
      last.content = last.content + "\n" + msg.content;
    } else {
      history.push({ ...msg });
    }
  }

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
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, searchParams, results, flowStep }),
    });
    const data = await res.json();
    return data.reply as string;
  } catch {
    return "Sorry, I couldn't connect right now. Please try again.";
  }
}

const INITIAL_MESSAGE: Message = {
  message: "Hey! I'm Snag, your personal deal hunter 🔍 What are you looking to buy today?",
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

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("scout_theme") as Theme) || "dark";
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("scout_theme", theme);
  }, [theme]);

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    if (typeof window === "undefined") return "default";
    return crypto.randomUUID();
  });

  const currentSessionIdRef = useRef(currentSessionId);

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("scout_sessions") || "[]");
    } catch {
      return [];
    }
  });

  const hintForStep: Record<FlowStep, string> = {
    asking_item:   "What would you like to buy?",
    asking_budget: "Your budget (e.g. €300)",
    asking_specs:  "Requirements, or 'any' to skip",
    searching:     "Searching for deals…",
    chat:          "Ask Snag anything…",
  };

  // Keep ref in sync so async closures can read the latest session id
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Persist sessions to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("scout_sessions", JSON.stringify(sessions));
    }
  }, [sessions]);

  // Auto-save current session whenever conversation changes
  useEffect(() => {
    const userMsgs = conversation.filter(
      (m) => m.type === "user" && !m.isThinking && m.message.trim()
    );
    if (userMsgs.length === 0) return;

    const title = userMsgs[0].message.slice(0, 50) || "Chat";
    const conversationToSave = conversation.filter((m) => !m.isThinking);

    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === currentSessionId);
      const session: ChatSession = {
        id: currentSessionId,
        title,
        conversation: conversationToSave,
        flowStep,
        searchParams,
        searchResults,
        updatedAt: Date.now(),
      };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = session;
        return next;
      }
      return [session, ...prev];
    });
  }, [conversation, flowStep, searchParams, searchResults, currentSessionId]);

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  // Update conversation for a specific session — if it's the active one, update live state;
  // otherwise patch the persisted session store so the user sees it when they switch back.
  const setConversationForSession = (sessionId: string, updater: (old: Message[]) => Message[]) => {
    if (sessionId === currentSessionIdRef.current) {
      setConversation(updater);
    } else {
      setSessions((prev) =>
        prev.map((s) =>
          s.id !== sessionId ? s : { ...s, conversation: updater(s.conversation), updatedAt: Date.now() }
        )
      );
    }
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

  const handleReset = () => {
    setFlowStep("asking_item");
    setSearchParams({ item: "", budget: "", specs: "" });
    setSearchResults([]);
    setUserInput("");
    setUploadedImage(null);
    setConversation([INITIAL_MESSAGE]);
    setInputHint(hintForStep["asking_item"]);
  };

  const handleNewChat = () => {
    setCurrentSessionId(crypto.randomUUID());
    setFlowStep("asking_item");
    setSearchParams({ item: "", budget: "", specs: "" });
    setSearchResults([]);
    setUserInput("");
    setUploadedImage(null);
    setConversation([INITIAL_MESSAGE]);
    setInputHint(hintForStep["asking_item"]);
  };

  const handleLoadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setConversation(session.conversation);
    setFlowStep(session.flowStep);
    setSearchParams(session.searchParams);
    setSearchResults(session.searchResults);
    setUserInput("");
    setUploadedImage(null);
    setInputHint(hintForStep[session.flowStep]);
    scrollToBottom();
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === currentSessionId) {
      handleNewChat();
    }
  };

  const runSearch = async (params: SearchParams, sessionId: string) => {
    if (sessionId === currentSessionIdRef.current) setFlowStep("searching");

    setConversationForSession(sessionId, (old) => [
      ...old,
      { message: "On it! Scanning the best second-hand platforms...", type: "bot", isThinking: true },
    ]);
    if (sessionId === currentSessionIdRef.current) scrollToBottom();

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
      setConversationForSession(sessionId, (old) => [
        ...old.slice(0, -1),
        { message: msg, type: "bot", isThinking: true },
      ]);
    }

    const searchData = await searchPromise;
    const results: ResultCard[] = searchData.results ?? [];

    await new Promise<void>((r) => setTimeout(r, 500));

    if (results.length === 0) {
      setConversationForSession(sessionId, (old) => [
        ...old.slice(0, -1),
        {
          message: `Oops, I couldn't find any ${params.item} listings that matched what you're looking for. Want to try different specs or a broader search?`,
          type: "bot",
        },
      ]);
      if (sessionId === currentSessionIdRef.current) {
        setInputHint(hintForStep["chat"]);
        scrollToBottom();
        setFlowStep("chat");
      }
      return;
    }

    if (sessionId === currentSessionIdRef.current) setSearchResults(results);

    setConversationForSession(sessionId, (old) => [
      ...old.slice(0, -1),
      {
        message: `Found ${results.length} great deals matching your criteria! Here are the best ones:`,
        type: "bot",
        results,
      },
    ]);
    if (sessionId === currentSessionIdRef.current) scrollToBottom();

    await new Promise<void>((r) => setTimeout(r, 500));

    const summaryMessages = buildClaudeMessages([], `I found ${results.length} deals for a ${params.item} within ${params.budget}. Give a short summary of the best pick and offer to help.`);
    const summaryReply = await callChatAPI(summaryMessages, params, results);

    setConversationForSession(sessionId, (old) => [
      ...old,
      { message: summaryReply, type: "bot" },
    ]);

    if (sessionId === currentSessionIdRef.current) {
      setInputHint(hintForStep["chat"]);
      scrollToBottom();
      setFlowStep("chat");
    } else {
      setSessions((prev) =>
        prev.map((s) =>
          s.id !== sessionId ? s : { ...s, flowStep: "chat" as FlowStep, searchResults: results }
        )
      );
    }
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

    const sessionId = currentSessionId;

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
        setConversationForSession(sessionId, (old) => [...old.slice(0, -1), { message: budgetQuestion, type: "bot" }]);
        if (sessionId === currentSessionIdRef.current) {
          setInputHint(hintForStep["asking_budget"]);
          scrollToBottom();
        }
        break;
      }

      case "asking_budget": {
        const looksLikeBudget = /\d/.test(input) || /[€$£]/.test(input) ||
          /\b(any|whatever|flexible|open|no limit|no budget|doesn't matter|don't care|idc)\b/i.test(input);

        const looksLikeNewItem = !!currentImage ||
          /\b(actually|instead|changed my mind|want to buy|find me|i need|how about|what about|search for|buy a|get a|find a|i changed|forget it|nevermind|never mind)\b/i.test(input);

        if (!looksLikeBudget && looksLikeNewItem) {
          const newParams = { item: input, budget: "", specs: "" };
          setSearchParams(newParams);
          setFlowStep("asking_budget");
          setConversation((old) => [...old, { message: "...", type: "bot", isThinking: true }]);
          scrollToBottom();
          const redirectMsgs = buildClaudeMessages(conversation, input, currentImage);
          const budgetQuestion = await callChatAPI(redirectMsgs, newParams, [], "asking_budget");
          setConversationForSession(sessionId, (old) => [...old.slice(0, -1), { message: budgetQuestion, type: "bot" }]);
          if (sessionId === currentSessionIdRef.current) {
            setInputHint(hintForStep["asking_budget"]);
            scrollToBottom();
          }
          break;
        }

        if (!looksLikeBudget) {
          const nudge = "I need a rough budget to find you the best deals! Even a range like €100–300 or just 'any' works fine.";
          setConversationForSession(sessionId, (old) => [...old, { message: nudge, type: "bot" }]);
          if (sessionId === currentSessionIdRef.current) scrollToBottom();
          break;
        }

        const newParams = { ...searchParams, budget: input };
        setSearchParams(newParams);
        setFlowStep("asking_specs");
        setConversation((old) => [...old, { message: "...", type: "bot", isThinking: true }]);
        scrollToBottom();
        const specsPromptMsgs = buildClaudeMessages(conversation, input, currentImage);
        const specsQuestion = await callChatAPI(specsPromptMsgs, newParams, [], "asking_specs");
        setConversationForSession(sessionId, (old) => [...old.slice(0, -1), { message: specsQuestion, type: "bot" }]);
        if (sessionId === currentSessionIdRef.current) {
          setInputHint(hintForStep["asking_specs"]);
          scrollToBottom();
        }
        break;
      }

      case "asking_specs": {
        const looksLikeNewItemInSpecs =
          /\b(actually|instead|changed my mind|want to buy|find me|i need|how about|what about|search for|buy a|get a|find a|i changed|forget it|nevermind|never mind)\b/i.test(input);

        if (looksLikeNewItemInSpecs) {
          const newParams = { item: input, budget: "", specs: "" };
          setSearchParams(newParams);
          setFlowStep("asking_budget");
          setConversation((old) => [...old, { message: "...", type: "bot", isThinking: true }]);
          scrollToBottom();
          const redirectMsgs = buildClaudeMessages(conversation, input, currentImage);
          const budgetQuestion = await callChatAPI(redirectMsgs, newParams, [], "asking_budget");
          setConversationForSession(sessionId, (old) => [...old.slice(0, -1), { message: budgetQuestion, type: "bot" }]);
          if (sessionId === currentSessionIdRef.current) {
            setInputHint(hintForStep["asking_budget"]);
            scrollToBottom();
          }
          break;
        }

        const specs = input.toLowerCase() === "any" ? "" : input;
        const fullParams = { ...searchParams, specs };
        setSearchParams(fullParams);
        setTimeout(() => runSearch(fullParams, sessionId), 200);
        break;
      }

      case "chat": {
        const reRunIntent =
          /\b(search again|refetch|re-?search|try again|redo (?:the )?search|search again on)\b/i.test(input);

        if (reRunIntent && searchParams.item && searchParams.budget) {
          setTimeout(() => runSearch(searchParams, sessionId), 200);
          break;
        }

        const newSearchIntent =
          /\b(search(?:ing)? for|find (?:me |a |an |some )|look(?:ing)? for|show me (?:a |some |listings? for|more (?:listings?|deals?|results?|offers?))|i want (?:to buy|to find|to search)|i(?:'m| am) looking for|can you (?:find|search|look for)|also (?:find|search|look for)|what about (?:buying |finding |searching for )?(?:a |an )?|how about (?:a |an )?|(?:get|show|fetch|find) (?:me )?(?:more|new|different|other|fresh) (?:listings?|results?|offers?|deals?)|new search|start (?:a )?(?:new )?search|search for something|try (?:a )?different)\b/i.test(input);

        if (newSearchIntent) {
          setConversation((old) => [...old, { message: "...", type: "bot", isThinking: true }]);
          scrollToBottom();
          const extractMsgs = buildClaudeMessages(conversation, input, currentImage);
          const rawItem = await callChatAPI(extractMsgs, searchParams, [], "extract_item");
          const cleanItem = rawItem.trim().replace(/[.!?,]$/, "") || input;
          const newParams = { item: cleanItem, budget: "", specs: "" };
          if (sessionId === currentSessionIdRef.current) {
            setSearchParams(newParams);
            setFlowStep("asking_budget");
          }
          const budgetMsgs = buildClaudeMessages(conversation, input, currentImage);
          const budgetQuestion = await callChatAPI(budgetMsgs, newParams, [], "asking_budget");
          setConversationForSession(sessionId, (old) => [...old.slice(0, -1), { message: budgetQuestion, type: "bot" }]);
          if (sessionId === currentSessionIdRef.current) {
            setInputHint(hintForStep["asking_budget"]);
            scrollToBottom();
          }
          break;
        }

        setConversation((old) => [...old, { message: "...", type: "bot", isThinking: true }]);
        scrollToBottom();
        const msgs = buildClaudeMessages(conversation, input, currentImage);
        const reply = await callChatAPI(msgs, searchParams, searchResults);
        setConversationForSession(sessionId, (old) => [
          ...old.slice(0, -1),
          { message: reply, type: "bot" },
        ]);
        if (sessionId === currentSessionIdRef.current) {
          setInputHint(hintForStep["chat"]);
          scrollToBottom();
        }
        break;
      }
    }
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

  const sessionGroups = groupSessionsByDate(sessions);

  return (
    <main
      className={`h-screen flex flex-row overflow-hidden theme-${theme}`}
      style={{ background: "var(--bg-page)" }}
    >
      {/* ── Sidebar ── */}
      <div
        className="w-64 flex-shrink-0 flex flex-col h-full"
        style={{
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border-sidebar)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: "var(--bg-logo-icon)",
              border: "1px solid var(--border-logo-icon)",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <span className="font-bold text-base" style={{ color: "var(--color-text-primary)" }}>Snag</span>
        </div>

        {/* New Chat button */}
        <div className="px-3 pb-3">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all new-chat-btn"
            style={{
              border: "1px solid var(--border-new-chat-btn)",
              color: "var(--color-text-primary)",
            }}
          >
            <Plus className="h-4 w-4" style={{ color: "var(--color-text-secondary)" }} />
            New chat
          </button>
        </div>

        {/* Divider */}
        <div className="mx-3 mb-2" style={{ height: 1, background: "var(--color-divider)" }} />

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-scrollbar) transparent" }}>
          {sessionGroups.length === 0 ? (
            <p className="text-xs px-3 py-2" style={{ color: "var(--color-text-muted)" }}>No previous chats</p>
          ) : (
            sessionGroups.map((group) => (
              <div key={group.label} className="mb-4">
                <p className="text-[10px] px-3 py-1 font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>
                  {group.label}
                </p>
                {group.sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => handleLoadSession(session)}
                    className="session-item cursor-pointer w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-all group relative mb-0.5"
                    style={{
                      background: session.id === currentSessionId ? "var(--bg-session-active)" : "transparent",
                      color: session.id === currentSessionId ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    }}
                  >
                    <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
                    <span className="flex-1 truncate pr-5 text-[13px]">{session.title}</span>
                    <button
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400 p-0.5 rounded"
                      aria-label="Delete chat"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Slim header */}
        <div
          className="w-full flex items-center justify-end px-6 py-3 flex-shrink-0 gap-3"
          style={{ borderBottom: "1px solid var(--border-header)" }}
        >
          <ThemeSelector theme={theme} onThemeChange={setTheme} />
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>online</span>
          </div>
        </div>

        <ScrollArea ref={scrollRef} className="flex-1 overflow-x-hidden">
          <div className="flex flex-col gap-2 p-4 max-w-3xl mx-auto">
            {conversation.map((msg, i) => (
              <div key={i} className="flex gap-2 first:mt-2 msg-slide-in">
                {msg.type === "bot" ? (
                  <div
                    className="w-full overflow-hidden p-4 relative font-medium max-w-[75%] mr-auto"
                    style={{
                      borderRadius: "14px",
                      background: "var(--bg-bot-msg)",
                      backdropFilter: "blur(20px)",
                      WebkitBackdropFilter: "blur(20px)",
                      border: "1px solid var(--border-bot-msg)",
                      boxShadow: "var(--shadow-bot-msg)",
                      color: "var(--color-text-primary)",
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
                                  background: "var(--bg-result-card)",
                                  backdropFilter: "blur(8px)",
                                  WebkitBackdropFilter: "blur(8px)",
                                  border: "1px solid var(--border-result-card)",
                                  borderLeft: ri === 0 ? "3px solid #4ade80" : "3px solid var(--border-result-card)",
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
                                      <span className="font-semibold text-sm leading-snug flex-1" style={{ color: "var(--color-text-primary)" }}>
                                        {r.title}
                                      </span>
                                      <ScoreRing score={r.valueScore} />
                                    </div>
                                    <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                                      {r.platform} · 📍 {r.location}
                                    </span>
                                    <div className="flex items-baseline gap-2 mt-1.5">
                                      <span className="text-lg font-bold" style={{ color: "var(--color-accent-blue)" }}>{r.price}</span>
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
                                            color: "var(--color-accent-blue)",
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
                                            className="text-xs font-medium no-underline hover:underline"
                                            style={{ color: "var(--color-accent-blue)" }}
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
                      background: "var(--bg-user-msg)",
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                      border: "1px solid var(--border-user-msg)",
                      boxShadow: "var(--shadow-user-msg)",
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
        <div className="w-full max-w-3xl mx-auto">
          <div className="p-6">
            <div
              className="input-container flex flex-row items-center gap-4 px-4 py-3"
              style={{
                border: "1px solid var(--border-input)",
                borderRadius: "16px",
                background: "var(--bg-input)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                boxShadow: "var(--shadow-input)",
              }}
            >
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center justify-center h-10 w-10 rounded-full focus:outline-none transition-all hover:opacity-70 hover:scale-110 active:scale-95"
                style={{ color: "var(--color-accent-blue)" }}
                tabIndex={0}
                aria-label="Start new search"
                title="Start new search"
              >
                <RefreshCw className="h-5 w-5" />
              </button>

              <AutosizeTextarea
                className="flex-1 outline-none border-0 bg-transparent placeholder-gray-500 text-xl px-0"
                style={{ color: "var(--color-text-primary)" }}
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
      </div>
    </main>
  );
}
