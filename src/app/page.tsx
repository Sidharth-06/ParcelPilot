"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck, Zap, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandBadge } from "@/components/brand-badge";

type Persona = {
  role: string;
  icon: React.ElementType;
  title: string;
  badge: string;
  tagline: string;
  blurb: string;
};

const PERSONAS: Persona[] = [
  {
    role: "analyst",
    icon: ShieldCheck,
    title: "Read-only Analyst",
    badge: "Read Only",
    tagline: "Investigate without write access",
    blurb: "Corpus search, account lookups, SLA calculations & proactive insights scan. Write actions blocked at tool layer.",
  },
  {
    role: "agent",
    icon: Ticket,
    title: "Support Agent",
    badge: "Guarded Actions",
    tagline: "Prepare actions, human confirms",
    blurb: "Full retrieval & calculation capabilities, plus draft escalations, ticket updates & follow-up tasks. Every mutation requires user approval.",
  },
  {
    role: "manager",
    icon: Zap,
    title: "Ops Manager",
    badge: "Full Authority",
    tagline: "Unrestricted execution",
    blurb: "Unrestricted execution including high-value operational overrides and manager approvals under SOP v4 rules.",
  },
];

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function login(role: string) {
    setBusy(role);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Sign-in failed");
      router.push("/console");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-background flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <BrandBadge href="/" />
      </header>

      {/* Body Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-3xl flex flex-col gap-8">

          {/* Hero */}
          <div className="text-center space-y-2 max-w-xl mx-auto">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Support &amp; Operations Console
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Policy retrieval, contract precedence, deterministic engines &amp; tool-guarded operations. Access controls enforced at tool layer.
            </p>
          </div>

          {/* Role Cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            {PERSONAS.map((p) => {
              const Icon = p.icon;
              const isLoading = busy === p.role;
              return (
                <button
                  key={p.role}
                  onClick={() => login(p.role)}
                  disabled={busy !== null}
                  className={cn(
                    "group flex flex-col justify-between rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/40 hover:bg-secondary/30 cursor-pointer",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded bg-secondary text-primary border border-border">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground border border-border bg-secondary px-2 py-0.5 rounded">
                        {p.badge}
                      </span>
                    </div>

                    <h2 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {p.title}
                    </h2>
                    <p className="text-[11px] font-medium text-muted-foreground mt-0.5">{p.tagline}</p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground/90">{p.blurb}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs font-medium text-primary">
                    <span>{isLoading ? "Signing in…" : "Select Role"}</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive text-center">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-card px-6 py-3 min-h-[3rem]" />
    </main>
  );
}
