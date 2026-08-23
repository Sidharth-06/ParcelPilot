import { pruneMessages, streamText, convertToModelMessages, stepCountIs } from "ai";
import { getSession } from "@/lib/auth/session";
import { getModel } from "@/lib/agent/model";
import { buildSystemPrompt } from "@/lib/agent/prompts";
import { buildTools } from "@/lib/agent/tools";
import { rateLimit } from "@/lib/actions/store";
import { llmConfigured } from "@/lib/env";

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!rateLimit(session.userId)) {
    return new Response("Rate limit exceeded", { status: 429 });
  }
  if (!llmConfigured()) {
    return new Response(
      JSON.stringify({
        error: "No LLM key configured. Set GROQ_API_KEY in .env.local (or on the host) and restart.",
      }),
      { status: 503, headers: { "content-type": "application/json" } }
    );
  }

  const { messages, deep } = (await req.json()) as { messages: unknown[]; deep?: boolean };

  const modelMessages = await convertToModelMessages(messages as never);
  // Reasoning models echo `reasoning_content` on assistant turns; Groq rejects
  // that property on input. Strip it (and reasoning content parts) before send.
  const sanitized = modelMessages.map((m) => {
    if (m.role !== "assistant") return m;
    const rest = { ...(m as Record<string, unknown>) };
    delete rest.reasoning_content;
    const msg = rest as typeof m;
    if (Array.isArray(msg.content)) {
      (msg as { content: unknown[] }).content = (msg.content as unknown[]).filter(
        (p) => (p as { type?: string }).type !== "reasoning"
      );
    }
    return msg;
  });

  const result = streamText({
    model: getModel(Boolean(deep)),
    system: buildSystemPrompt(session),
    messages: sanitized,
    tools: buildTools(session),
    prepareStep: async ({ messages }) => ({
      messages: pruneMessages({
        messages,
        reasoning: "all",
        emptyMessages: "remove",
      }),
    }),
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse();
}
