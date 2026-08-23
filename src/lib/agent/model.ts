import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env, llmConfigured } from "@/lib/env";

/**
 * LLM gateway resolution — Groq primary (OpenAI-compatible), OpenCode Zen
 * fallback. `deep` toggles a heavier model when a gateway defines one.
 */
export function getModel(deep = false) {
  if (!llmConfigured()) {
    throw new Error("No LLM key configured. Set GROQ_API_KEY (or OPENCODE_API_KEY) in .env.local.");
  }
  const e = env();
  if (e.GROQ_API_KEY) {
    const groq = createOpenAICompatible({
      name: "groq",
      baseURL: e.GROQ_BASE_URL,
      apiKey: e.GROQ_API_KEY,
    });
    // Single-model gateway: both tiers map to the configured model.
    void deep;
    return groq.chatModel(e.GROQ_MODEL);
  }
  const zen = createOpenAICompatible({
    name: "opencode-zen",
    baseURL: e.OPENCODE_BASE_URL,
    apiKey: e.OPENCODE_API_KEY!,
  });
  return zen.chatModel(e.GROQ_MODEL);
}
