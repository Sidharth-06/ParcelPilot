import vectorsJson from "@/data/generated/vectors.json";

export interface VectorEntry {
  id: string;
  vec: number[];
}

export interface VectorsFile {
  provider_model: string | null;
  dim: number;
  generated_at: string | null;
  content_hash: string | null;
  collections: {
    chunks: VectorEntry[];
    known_issues?: VectorEntry[];
    tickets?: VectorEntry[];
  };
}

const vectors = vectorsJson as unknown as VectorsFile;

export function vectorsReady(): boolean {
  return Boolean(vectors.provider_model) && vectors.collections.chunks.length > 0;
}

export function vectorsFile(): VectorsFile {
  return vectors;
}

export function vectorsInfo(): { model: string | null; count: number; generatedAt: string | null } {
  return {
    model: vectors.provider_model,
    count: vectors.collections.chunks.length,
    generatedAt: vectors.generated_at,
  };
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Brute-force cosine over the committed collection — optimal at this scale. */
export function rankBySimilarity(queryVec: number[], collection: VectorEntry[]): Array<{ id: string; score: number }> {
  return collection
    .map((e) => ({ id: e.id, score: cosine(queryVec, e.vec) }))
    .sort((x, y) => y.score - x.score);
}
