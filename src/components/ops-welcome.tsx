"use client";

import { ThreadPrimitive } from "@assistant-ui/react";
import type { FC } from "react";
import { ArrowUpRight } from "lucide-react";

const QUICK_PROMPTS = [
  {
    title: "Northstar Cancellation Fee",
    prompt: "Can Northstar cancel ORD-1001 without a cancellation fee? Explain why.",
  },
  {
    title: "Service Credit Eligibility",
    prompt: "ORD-2002's pickup was missed and the carrier accepted fault. Is a service credit due?",
  },
  {
    title: "SLA Breach & Escalations",
    prompt: "Which open tickets have breached their SLA, and what should I do next?",
  },
  {
    title: "Bulk Upload Limit Conflict",
    prompt: "What did we previously tell customers about bulk upload limits, and what is correct now?",
  },
];

export const OpsWelcome: FC = () => {
  return (
    <div className="flex flex-col items-center text-center px-4 py-8 gap-6 w-full max-w-xl mx-auto">
      {/* Title */}
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          ParcelPilot Support Console
        </h1>
        <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
          Retrieval over policy docs, agreements, and ticket data with deterministic engines.
        </p>
      </div>

      {/* Suggested Queries */}
      <div className="w-full text-left pt-2">
        <p className="text-xs font-medium text-muted-foreground mb-2.5 px-0.5">
          Suggested Queries
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
          {QUICK_PROMPTS.map((p) => (
            <ThreadPrimitive.Suggestion
              key={p.prompt}
              prompt={p.prompt}
              send
              render={
                <button className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 text-left transition-colors hover:border-muted-foreground/40 hover:bg-secondary/40 cursor-pointer" />
              }
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                    {p.title}
                  </p>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                </div>
                <p className="text-[11.5px] text-muted-foreground leading-snug line-clamp-2">
                  {p.prompt}
                </p>
              </div>
            </ThreadPrimitive.Suggestion>
          ))}
        </div>
      </div>
    </div>
  );
};
