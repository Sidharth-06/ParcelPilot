"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Thread } from "@/components/thread";
import type { ThreadComponents } from "@/components/thread";
import { OpsWelcome } from "@/components/ops-welcome";
import { OpsToolFallback } from "@/components/ops-tool-fallback";
import { LogOut, BarChart3 } from "lucide-react";
import { BrandBadge } from "@/components/brand-badge";
import Link from "next/link";
import { useRouter } from "next/navigation";

const THREAD_COMPONENTS: ThreadComponents = {
  Welcome: OpsWelcome,
  ToolFallback: OpsToolFallback,
};

export const Assistant = () => {
  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-dvh flex flex-col bg-background text-foreground">
        <OpsHeader />
        <div className="flex-1 min-h-0 relative">
          <Thread components={THREAD_COMPONENTS} />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
};

function OpsHeader() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <header className="shrink-0 border-b border-border/70 bg-background px-5 py-2 flex items-center justify-between">
      <BrandBadge href="/" />

      <div className="flex items-center gap-2.5 text-xs">
        <Link
          href="/insights"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card hover:bg-secondary px-3 py-1 text-xs font-medium text-foreground transition-colors cursor-pointer"
        >
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Insights</span>
        </Link>

        <button
          onClick={logout}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card hover:bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Switch Role</span>
        </button>
      </div>
    </header>
  );
}
