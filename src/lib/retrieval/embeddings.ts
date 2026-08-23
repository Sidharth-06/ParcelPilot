import { env } from "@/lib/env";

/**
 * Embedding providers. Query-side embedding is required for retrieval;
 * document-side vectors are computed once at build time (scripts/embed.ts).
 */

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  embed(texts: string[], purpose: "query" | "document"): Promise<number[][]>;
}

class HttpError extends Error {}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 10_000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new HttpError(`${res.status} ${await res.text().catch(() => "")}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ Gemini

interface GeminiBatchResponse {
  embeddings?: Array<{ values?: number[] }>;
}

function geminiProvider(apiKey: string, model: string): EmbeddingProvider {
  return {
    name: "gemini",
    model,
    async embed(texts, purpose) {
      const taskType = purpose === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`;
      const body = {
        requests: texts.map((t) => ({
          model: `models/${model}`,
          content: { parts: [{ text: t }] },
          taskType,
          // Matryoshka truncation keeps committed vectors compact.
          outputDimensionality: 768,
        })),
      };
      const data = (await postJson(url, { "x-goog-api-key": apiKey }, body)) as GeminiBatchResponse;
      const out = data.embeddings?.map((e) => e.values ?? []);
      if (!out || out.length !== texts.length) throw new Error("Gemini embedding response mismatch");
      return out;
    },
  };
}

// -------------------------------------------------------------------- Jina

interface JinaResponse {
  data?: Array<{ embedding?: number[] }>;
}

function jinaProvider(apiKey: string): EmbeddingProvider {
  return {
    name: "jina",
    model: "jina-embeddings-v3",
    async embed(texts, purpose) {
      const body = {
        model: "jina-embeddings-v3",
        task: purpose === "query" ? "retrieval.query" : "retrieval.passage",
        input: texts,
      };
      const data = (await postJson("https://api.jina.ai/v1/embeddings", { Authorization: `Bearer ${apiKey}` }, body)) as JinaResponse;
      const out = data.data?.map((d) => d.embedding ?? []);
      if (!out || out.length !== texts.length) throw new Error("Jina embedding response mismatch");
      return out;
    },
  };
}

// ---------------------------------------------------------------- resolver

export function getEmbeddingProvider(): EmbeddingProvider | null {
  const e = env();
  if (e.GOOGLE_API_KEY) return geminiProvider(e.GOOGLE_API_KEY, e.GEMINI_EMBED_MODEL);
  if (e.JINA_API_KEY) return jinaProvider(e.JINA_API_KEY);
  return null;
}

export class RetrievalUnavailableError extends Error {
  constructor(reason: string) {
    super(`Retrieval unavailable: ${reason}`);
    this.name = "RetrievalUnavailableError";
  }
}
