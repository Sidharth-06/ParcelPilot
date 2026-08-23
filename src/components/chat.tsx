"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  IconAlert,
  IconArrowRight,
  IconBox,
  IconBrain,
  IconCalculator,
  IconClock,
  IconDatabase,
  IconSearch,
  IconSend,
  IconShieldCheck,
  IconSparkles,
  IconTicket,
  IconZap,
} from "@/components/icons";

const GUARDED = new Set(["create_escalation", "update_ticket", "create_task"]);

interface IntentOutput {
  status?: string;
  action_id?: string;
  summary?: string;
  token?: string;
  error?: string;
}

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  search_documents: IconSearch,
  get_order: IconBox,
  get_orders: IconBox,
  get_account: IconDatabase,
  get_ticket: IconTicket,
  get_tickets: IconTicket,
  calculate_cancellation: IconCalculator,
  calculate_service_credit: IconCalculator,
  check_sla: IconClock,
};

const QUICK_PROMPTS = [
  { icon: IconClock, text: "Which open tickets have breached their SLA, and what should I do next?" },
  { icon: IconBox, text: "Can Northstar cancel ORD-1001 without a cancellation fee? Explain why." },
  { icon: IconCalculator, text: "ORD-2002's pickup was missed and the carrier accepted fault. Is a service credit due?" },
  { icon: IconShieldCheck, text: "What did we previously tell customers about bulk upload limits, and what is correct now?" },
];

/* ------------------------------------------------------------------ pieces */

function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-[13px]";
  return (
    <div className={`flex ${dim} items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500 font-bold text-white shadow-md shadow-indigo-600/20`}>
      PP
    </div>
  );
}

function ToolPart({ part }: { part: Extract<UIMessage["parts"][number], { type: `tool-${string}` }> }) {
  const name = (part as { type: string }).type.replace(/^tool-/, "");
  const state = (part as { state?: string }).state ?? "";
  const input = (part as { input?: unknown }).input as Record<string, unknown> | undefined;
  const output = (part as { output?: unknown }).output;

  const guarded = GUARDED.has(name);
  const Icon = guarded ? IconZap : (TOOL_ICONS[name] ?? IconSparkles);
  const intent: IntentOutput | null =
    guarded && output && typeof output === "object" ? (output as IntentOutput) : null;

  const args = input
    ? Object.entries(input)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k}: ${typeof v === "string" ? (v.length > 56 ? `${v.slice(0, 53)}…` : v) : JSON.stringify(v)}`)
        .join("   ·   ")
    : "";

  return (
    <div
      className={`my-2 overflow-hidden rounded-xl border ${
        guarded && intent?.status === "awaiting_confirmation"
          ? "border-amber-200 bg-amber-50/60"
          : "border-slate-200 bg-white"
      } shadow-sm animate-fade-in`}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5">
        <span className={`flex h-5 w-5 items-center justify-center rounded-md ${guarded ? "bg-amber-100 text-amber-700" : "bg-indigo-50 text-indigo-600"}`}>
          <Icon className="h-3 w-3" />
        </span>
        <span className="font-mono text-[11px] font-semibold tracking-tight text-slate-800">{name}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-400">{state}</span>
        {guarded && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700">
            <IconShieldCheck className="h-3 w-3" /> guarded
          </span>
        )}
      </div>
      {args && <div className="px-3 pt-1.5 font-mono text-[10.5px] leading-relaxed text-slate-500">{args}</div>}
      {intent && <ConfirmCard intent={intent} toolName={name} />}
      {!intent && output !== undefined && !guarded && (
        <details className="group/det px-3 pb-2 pt-1">
          <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-[10.5px] font-medium text-slate-400 hover:text-slate-600">
            <IconArrowRight className="h-3 w-3 transition-transform group-open/det:rotate-90" /> output
          </summary>
          <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-2.5 text-[10.5px] leading-relaxed text-slate-600 ring-1 ring-slate-100">
            {JSON.stringify(output, null, 1)}
          </pre>
        </details>
      )}
    </div>
  );
}

function ConfirmCard({ intent, toolName }: { intent: IntentOutput; toolName: string }) {
  const [state, setState] = useState<"idle" | "confirming" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  if (!intent || intent.status !== "awaiting_confirmation") {
    return intent?.status === "forbidden" ? (
      <div className="mx-3 mb-3 mt-1.5 flex items-start gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-[11.5px] text-red-700">
        <IconAlert className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>{intent.error}</span>
      </div>
    ) : null;
  }

  async function confirm() {
    if (!intent.token) return;
    setState("confirming");
    try {
      const res = await fetch("/api/actions/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: intent.token }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setState("done");
        setMsg(data.receipt);
      } else {
        setState("error");
        setMsg(data.error ?? "Execution failed");
      }
    } catch {
      setState("error");
      setMsg("Network error — the signed intent stays valid until it expires.");
    }
  }

  return (
    <div className="m-3 rounded-xl border border-amber-300 bg-white p-3 shadow-sm">
      <p className="text-[10.5px] font-bold uppercase tracking-widest text-amber-600">Confirmation required · {toolName}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-800">{intent.summary}</p>
      <p className="mt-0.5 font-mono text-[10px] text-slate-400">{intent.action_id}</p>
      {state === "done" ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700">
          <IconShieldCheck className="h-4 w-4" /> {msg}
        </p>
      ) : state === "error" ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-red-600">
          <IconAlert className="h-4 w-4" /> {msg}
        </p>
      ) : (
        <button
          onClick={confirm}
          disabled={state === "confirming"}
          className="ring-focus mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-amber-500 to-amber-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
        >
          {state === "confirming" ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Executing…
            </>
          ) : (
            <>
              <IconShieldCheck className="h-3.5 w-3.5" /> Confirm action
            </>
          )}
        </button>
      )}
    </div>
  );
}

function Thinking() {
  return (
    <div className="my-2 flex items-center gap-2 pl-1">
      <IconBrain className="h-3.5 w-3.5 text-indigo-400" />
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce-dot"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
      <span className="text-[11px] text-slate-400">working through tools…</span>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  return (
    <div className="pointer-events-none sticky bottom-0 z-10 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pb-4 pt-6">
      <div className="mx-auto max-w-3xl px-4">
        <div className="pointer-events-auto flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-900/[0.04] focus-within:border-indigo-300 focus-within:shadow-indigo-900/[0.06] transition-colors">
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Ask about tickets, orders, policies, contracts…"
            className="max-h-40 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          <button
            onClick={onSubmit}
            disabled={busy || !value.trim()}
            aria-label="Send"
            className="ring-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-sm transition hover:brightness-110 active:scale-95 disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-400"
          >
            <IconSend className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 hidden text-center text-[10.5px] text-slate-400 sm:block">
          Enter ↵ to send · Shift+Enter for newline · actions always require explicit confirmation
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- shell */

export function ChatConsole({ displayName, role }: { displayName: string; role: string }) {
  const [deep, setDeep] = useState(false);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ deep }),
      }),
    [deep]
  );
  const { messages, sendMessage, status, error } = useChat({ transport });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      void sendMessage({ text: q });
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link fires once on mount
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const submit = useCallback(
    (text?: string) => {
      const v = (text ?? input).trim();
      if (!v || status === "submitted" || status === "streaming") return;
      void sendMessage({ text: v });
      setInput("");
    },
    [input, sendMessage, status]
  );

  const streaming = status === "submitted" || status === "streaming";

  return (
    <div className="relative flex h-screen flex-col">
      {/* Header */}
      <header className="z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <BrandMark size="sm" />
            <div className="leading-tight">
              <p className="text-[13px] font-bold tracking-tight text-slate-900">ParcelPilot Ops</p>
              <p className="-mt-px text-[10px] font-medium uppercase tracking-wider text-slate-400">
                internal console
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setDeep((d) => !d)}
              title="Switch reasoning model"
              className={`ring-focus inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold transition-all ${
                deep
                  ? "border-violet-200 bg-violet-50 text-violet-700 shadow-sm"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
              }`}
            >
              <IconBrain className={`h-3.5 w-3.5 ${deep ? "animate-pulse" : ""}`} />
              {deep ? "Deep mode" : "Fast mode"}
            </button>
            <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 sm:inline-flex">
              <span className={`h-1.5 w-1.5 rounded-full ${role === "manager" ? "bg-violet-500" : role === "agent" ? "bg-sky-500" : "bg-emerald-500"}`} />
              <span className="text-[11px] font-medium text-slate-600">{displayName}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 && !streaming && (
            <div className="animate-fade-up">
              <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/50 p-8 text-center shadow-sm">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <IconSparkles className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-[15px] font-semibold tracking-tight text-slate-900">
                  Ask anything about the support corpus
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
                  Policies, contracts, orders and tickets — with citations, deterministic math and
                  guarded actions.
                </p>
              </div>
              <div className="mx-auto mt-4 grid max-w-xl gap-2 sm:grid-cols-2">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.text}
                    onClick={() => submit(q.text)}
                    className="card-lift group flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm"
                  >
                    <q.icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                    <span className="text-[12.5px] leading-snug text-slate-600 group-hover:text-slate-900">{q.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`mb-5 flex gap-3 animate-fade-up ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "assistant" && (
                <div className="mt-1 shrink-0">
                  <BrandMark size="sm" />
                </div>
              )}
              <div
                className={`max-w-[88%] ${
                  m.role === "user"
                    ? "rounded-2xl rounded-br-md bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2.5 text-sm text-white shadow-md shadow-indigo-600/15"
                    : "w-fit max-w-full rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm"
                }`}
              >
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    const text = (part as { text: string }).text;
                    if (!text) return null;
                    return m.role === "user" ? (
                      <span key={i} className="whitespace-pre-wrap">{text}</span>
                    ) : (
                      <div key={i} className="prose-chat max-w-none [&_a]:text-indigo-600 [&_a]:underline">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                      </div>
                    );
                  }
                  if ((part.type as string).startsWith("tool-")) {
                    return <ToolPart key={i} part={part as never} />;
                  }
                  return null;
                })}
              </div>
            </div>
          ))}

          {status === "submitted" && <Thinking />}
          {status === "streaming" && !messages.at(-1)?.parts.some((p) => p.type === "text") && <Thinking />}

          {error && (
            <div className="my-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{error.message}</p>
                {error.message.includes("GROQ_API_KEY") && (
                  <p className="mt-0.5 text-red-600/80">Add your Groq key to .env.local (or host env vars), then redeploy.</p>
                )}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      <Composer value={input} onChange={setInput} onSubmit={() => submit()} busy={streaming} />
    </div>
  );
}
