import { z } from "zod";

/**
 * Server-side environment. Validated lazily so UI-only routes can render
 * even before keys are configured; /api/health reports the exact status.
 */
const schema = z.object({
  /** Primary LLM gateway (OpenAI-compatible). */
  GROQ_API_KEY: z.string().min(10).optional(),
  GROQ_BASE_URL: z.string().url().default("https://api.groq.com/openai/v1"),
  GROQ_MODEL: z.string().default("qwen/qwen3.6-27b"),
  /** Optional secondary gateway used when GROQ is absent. */
  OPENCODE_API_KEY: z.string().min(10).optional(),
  OPENCODE_BASE_URL: z.string().url().default("https://opencode.ai/zen/v1"),
  GOOGLE_API_KEY: z.string().min(10).optional(),
  GEMINI_EMBED_MODEL: z.string().default("gemini-embedding-001"),
  JINA_API_KEY: z.string().min(10).optional(),
  /** HMAC secret for sessions + action intents. Dev default is loud-warned. */
  APP_SECRET: z.string().min(16).default("dev-only-insecure-secret-change-me"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment: ${parsed.error.message}`);
    }
    cached = parsed.data;
    if (cached.APP_SECRET === "dev-only-insecure-secret-change-me" && cached.NODE_ENV === "production") {
      throw new Error("APP_SECRET must be set in production");
    }
  }
  return cached;
}

export function llmConfigured(): boolean {
  const e = env();
  return Boolean(e.GROQ_API_KEY || e.OPENCODE_API_KEY);
}

export function embeddingConfigured(): boolean {
  return Boolean(env().GOOGLE_API_KEY || env().JINA_API_KEY);
}
