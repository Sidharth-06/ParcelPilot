"use client";

import { memo, useState } from "react";
import { Check, Loader2, XCircle, AlertTriangle, ChevronDown } from "lucide-react";
import {
  type ToolCallMessagePartComponent,
  useToolCallElapsed,
} from "@assistant-ui/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ToolMeta = {
  label: string;
  runningLabel: string;
  guarded?: boolean;
};

const TOOL_META: Record<string, ToolMeta> = {
  search_documents: {
    label: "Searched documents & policies",
    runningLabel: "Searching documents…",
  },
  get_order: {
    label: "Fetched order record",
    runningLabel: "Fetching order…",
  },
  get_orders: {
    label: "Listed orders",
    runningLabel: "Listing orders…",
  },
  get_ticket: {
    label: "Fetched ticket record",
    runningLabel: "Fetching ticket…",
  },
  get_tickets: {
    label: "Listed tickets",
    runningLabel: "Listing tickets…",
  },
  get_account: {
    label: "Fetched account profile",
    runningLabel: "Fetching account…",
  },
  calculate_cancellation: {
    label: "Calculated cancellation ruling",
    runningLabel: "Calculating cancellation…",
  },
  calculate_service_credit: {
    label: "Calculated service credit",
    runningLabel: "Calculating credit…",
  },
  check_sla: {
    label: "Audited SLA targets",
    runningLabel: "Auditing SLA…",
  },
  create_escalation: {
    label: "Prepared escalation draft",
    runningLabel: "Preparing escalation…",
    guarded: true,
  },
  update_ticket: {
    label: "Prepared ticket update",
    runningLabel: "Preparing update…",
    guarded: true,
  },
  create_task: {
    label: "Prepared follow-up task",
    runningLabel: "Preparing task…",
    guarded: true,
  },
};

const fallbackMeta = (toolName: string): ToolMeta => ({
  label: `Executed ${toolName}`,
  runningLabel: `Executing ${toolName}…`,
});

function Duration() {
  const ms = useToolCallElapsed();
  if (ms === undefined) return null;
  const s = ms / 1000;
  const text = ms < 1000 ? "<1s" : s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
  return (
    <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums ml-1">{text}</span>
  );
}

type IntentResult = {
  status?: string;
  action_id?: string;
  summary?: string;
  token?: string;
  error?: string;
};

function ConfirmCard({ result }: { result: IntentResult }) {
  const [state, setState] = useState<"idle" | "confirming" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  if (result.status === "forbidden") {
    return (
      <div className="my-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 space-y-1 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-destructive">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>Action Forbidden (RBAC Restricted)</span>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          {result.error ?? "Action not permitted for your role."}
        </p>
      </div>
    );
  }

  if (result.status !== "awaiting_confirmation") return null;

  async function confirm() {
    if (!result.token) return;
    setState("confirming");
    try {
      const res = await fetch("/api/actions/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: result.token }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setState("done");
        setMsg(data.receipt ?? "Action executed successfully.");
      } else {
        setState("error");
        setMsg(data.error ?? "Execution failed.");
      }
    } catch {
      setState("error");
      setMsg("Network error.");
    }
  }

  return (
    <div className="my-2.5 rounded-xl border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2.5 shadow-xs transition-all">
      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-sm font-semibold tracking-tight">Confirmation Required</span>
      </div>
      <p className="text-xs text-foreground/90 leading-relaxed font-normal">
        {result.summary}
      </p>
      <div className="flex items-center justify-between text-[10.5px] font-mono text-muted-foreground pt-0.5">
        <span>
          Action ID: <span className="text-foreground/75 font-semibold">{result.action_id}</span>
        </span>
      </div>

      {state === "done" ? (
        <div className="text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/50 border border-emerald-500/40 rounded-lg p-2.5 flex items-center gap-2 mt-1">
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{msg}</span>
        </div>
      ) : state === "error" ? (
        <div className="text-xs font-medium text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-2.5 flex items-center gap-2 mt-1">
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
          <span>{msg}</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 pt-1">
          <Button
            size="sm"
            className="h-8 text-xs font-medium px-4 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white shadow-xs transition-colors cursor-pointer"
            disabled={state === "confirming"}
            onClick={confirm}
          >
            {state === "confirming" ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Executing…
              </span>
            ) : (
              "Confirm"
            )}
          </Button>
          <span className="text-[11.5px] text-muted-foreground font-medium">
            Requires user approval
          </span>
        </div>
      )}
    </div>
  );
}

const OpsToolFallbackImpl: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
}) => {
  const meta = TOOL_META[toolName] ?? fallbackMeta(toolName);
  const isRunning = status?.type === "running";
  const isError = status?.type === "incomplete";
  const [open, setOpen] = useState(false);

  const intentResult = meta.guarded && result && typeof result === "object"
    ? (result as IntentResult)
    : null;

  if (meta.guarded) {
    return (
      <div className="my-2 w-full">
        {isRunning && (
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
            <span className="font-medium text-foreground">{meta.runningLabel}</span>
            <Duration />
          </div>
        )}
        {isError && (
          <div className="inline-flex items-center gap-1.5 text-xs text-destructive py-1">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">Action execution interrupted</span>
          </div>
        )}

        {/* The prominent Escalation / Confirmation card directly visible */}
        {intentResult && <ConfirmCard result={intentResult} />}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-1">
      <CollapsibleTrigger className="group inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-0.5">
        {isRunning ? (
          <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
        ) : isError ? (
          <XCircle className="h-3 w-3 text-destructive shrink-0" />
        ) : (
          <Check className="h-3 w-3 text-emerald-600 shrink-0" />
        )}
        <span className="font-medium text-foreground">
          {isRunning ? meta.runningLabel : meta.label}
        </span>
        <Duration />
        {(argsText || result) && (
          <ChevronDown
            className={cn(
              "h-3 w-3 text-muted-foreground/50 transition-transform duration-150 ml-0.5",
              open && "rotate-180",
            )}
          />
        )}
      </CollapsibleTrigger>

      {/* Collapsible raw data payload */}
      {(argsText || (result && !meta.guarded)) && (
        <CollapsibleContent className="overflow-hidden data-open:animate-in data-closed:animate-out">
          <div className="mt-1 max-w-md space-y-1 bg-secondary/30 border border-border/60 rounded-md p-2 text-[11px]">
            {argsText && (
              <div>
                <span className="font-mono text-[10px] font-medium text-muted-foreground block mb-0.5">
                  Parameters
                </span>
                <pre className="font-mono text-[10.5px] text-foreground/80 whitespace-pre-wrap">
                  {argsText}
                </pre>
              </div>
            )}
            {result && !meta.guarded && (
              <div>
                <span className="font-mono text-[10px] font-medium text-muted-foreground block mb-0.5">
                  Result
                </span>
                <pre className="font-mono text-[10.5px] text-foreground/80 whitespace-pre-wrap max-h-36 overflow-y-auto">
                  {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
};

export const OpsToolFallback = memo(OpsToolFallbackImpl) as ToolCallMessagePartComponent;
OpsToolFallback.displayName = "OpsToolFallback";
