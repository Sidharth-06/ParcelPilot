"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BoxIcon,
  ClockIcon,
  LayersIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import type { Insight, InsightLevel } from "@/lib/engines/insights";

const LEVEL_META: Record<InsightLevel, { label: string; bar: string; pill: string; dot: string }> = {
  critical: { label: "Critical", bar: "bg-red-500",   pill: "border-red-200 bg-red-50 text-red-700",     dot: "bg-red-500"   },
  high:     { label: "High",     bar: "bg-amber-500", pill: "border-amber-200 bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  medium:   { label: "Medium",   bar: "bg-sky-500",   pill: "border-sky-200 bg-sky-50 text-sky-700",      dot: "bg-sky-500"   },
};

const TYPE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  sla_breach:    { label: "SLA breaches",   icon: ClockIcon         },
  ki_correlation:{ label: "Known issues",   icon: LayersIcon        },
  outage_signal: { label: "Blast radius",   icon: AlertTriangleIcon },
  misguidance:   { label: "Guidance audit", icon: ShieldCheckIcon   },
  ticket_cluster:{ label: "Duplicates",     icon: BoxIcon           },
};

function InsightCard({ insight }: { insight: Insight }) {
  const meta  = LEVEL_META[insight.level];
  const tMeta = TYPE_META[insight.type] ?? TYPE_META.sla_breach;
  const Icon  = tMeta.icon;

  return (
    <article className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md group">
      {/* severity bar */}
      <span className={cn("absolute inset-y-0 left-0 w-1", meta.bar)} />

      <div className="p-5 pl-6">
        {/* type + level */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg border", meta.pill)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{tMeta.label}</span>
          </div>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", meta.pill)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
        </div>

        {/* body */}
        <h3 className="mt-3 text-[14px] font-semibold leading-snug tracking-tight text-foreground">{insight.title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{insight.detail}</p>

        {insight.recommendation && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-[12.5px] leading-relaxed text-foreground ring-1 ring-border/60">
            <SparklesIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
            {insight.recommendation}
          </p>
        )}

        {/* evidence + investigate link */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {insight.evidence.map((e) => (
            <span
              key={`${e.kind}-${e.id}`}
              className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {e.id}
            </span>
          ))}
          {insight.chatPrompt && (
            <Link
              href={`/console?q=${encodeURIComponent(insight.chatPrompt)}`}
              className={cn(
                "ml-auto inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1",
                "text-[11.5px] font-semibold text-foreground",
                "transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary",
              )}
            >
              Investigate
              <ArrowRightIcon className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function InsightsView({ insights }: { insights: Insight[] }) {
  const [level, setLevel] = useState<"all" | InsightLevel>("all");
  const [type, setType] = useState<string>("all");

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0 };
    for (const i of insights) c[i.level]++;
    return c;
  }, [insights]);

  const types   = useMemo(() => [...new Set(insights.map((i) => i.type))], [insights]);
  const filtered = insights.filter(
    (i) => (level === "all" || i.level === level) && (type === "all" || i.type === type)
  );

  if (insights.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center">
        <SparklesIcon className="mx-auto h-6 w-6 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium text-foreground">No active insights at the snapshot time.</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          Embedding-backed detections (known-issue correlation, duplicate clustering) activate after{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">npm run embed</code> generates the vector index.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3 sm:max-w-sm">
        {(Object.keys(counts) as InsightLevel[]).map((lv) => (
          <div key={lv} className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", LEVEL_META[lv].dot)} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {LEVEL_META[lv].label}
              </span>
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">{counts[lv]}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        {(["all", "critical", "high", "medium"] as const).map((lv) => (
          <Button
            key={lv}
            size="sm"
            variant={level === lv ? "default" : "outline"}
            className="h-7 rounded-full px-3 text-[12px] capitalize"
            onClick={() => setLevel(lv)}
          >
            {lv === "all" ? `All (${insights.length})` : `${LEVEL_META[lv].label} (${counts[lv]})`}
          </Button>
        ))}

        <span className="mx-1 h-4 w-px bg-border" />

        <Button
          size="sm"
          variant={type === "all" ? "secondary" : "outline"}
          className="h-7 rounded-full px-3 text-[12px]"
          onClick={() => setType("all")}
        >
          every type
        </Button>
        {types.map((t) => {
          const TIcon = TYPE_META[t]?.icon;
          return (
            <Button
              key={t}
              size="sm"
              variant={type === t ? "secondary" : "outline"}
              className="h-7 rounded-full px-3 text-[12px] gap-1.5"
              onClick={() => setType(t)}
            >
              {TIcon && <TIcon className="h-3 w-3" />}
              {TYPE_META[t]?.label ?? t}
            </Button>
          );
        })}
      </div>

      {/* Cards */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {filtered.map((i) => <InsightCard key={i.id} insight={i} />)}
      </div>

      {filtered.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">Nothing matches this filter.</p>
      )}
    </>
  );
}
