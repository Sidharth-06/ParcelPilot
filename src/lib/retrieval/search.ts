import { allChunks, docById } from "@/lib/data/store";
import { getEmbeddingProvider, RetrievalUnavailableError } from "./embeddings";
import { rankBySimilarity, vectorsFile, vectorsReady } from "./vectors";
import type { DocChunk, DocMeta } from "@/lib/data/types";

export interface SearchHit {
  chunk: DocChunk;
  doc: DocMeta;
  score: number;
}

export interface SearchResult {
  hits: SearchHit[];
  model: string;
}

/**
 * Pure vector retrieval: embed the query, cosine-rank against committed
 * chunk embeddings, attach document metadata for trust badges.
 */
export async function searchDocuments(query: string, k = 6): Promise<SearchResult> {
  if (!vectorsReady()) {
    throw new RetrievalUnavailableError(
      "document vectors are not generated — run `npm run embed` with an embedding API key configured"
    );
  }
  const provider = getEmbeddingProvider();
  if (!provider) {
    throw new RetrievalUnavailableError("no embedding provider configured (set GOOGLE_API_KEY or JINA_API_KEY)");
  }
  const [qvec] = await provider.embed([query], "query");
  const ranked = rankBySimilarity(qvec, vectorsFile().collections.chunks).slice(0, k);
  const hits: SearchHit[] = [];
  for (const r of ranked) {
    const chunk = allChunks().find((c) => c.chunk_id === r.id);
    if (!chunk) continue;
    const doc = docById(chunk.doc_id);
    if (!doc) continue;
    hits.push({ chunk, doc, score: r.score });
  }
  return { hits, model: `${provider.name}/${provider.model}` };
}
