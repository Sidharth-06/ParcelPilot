import { describe, expect, it } from "vitest";
import { cosine, rankBySimilarity, vectorsReady } from "@/lib/retrieval/vectors";
import { getEmbeddingProvider } from "@/lib/retrieval/embeddings";
import { searchDocuments } from "@/lib/retrieval/search";

describe("cosine similarity", () => {
  it("scores identical vectors as 1 and orthogonal as 0", () => {
    const a = [1, 0, 2];
    expect(cosine(a, [2, 0, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });

  it("ranks descending by score", () => {
    const q = [1, 0];
    const ranked = rankBySimilarity(q, [
      { id: "weak", vec: [-1, 0.1] },
      { id: "strong", vec: [3, 0] },
      { id: "mid", vec: [1, 0.5] },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["strong", "mid", "weak"]);
  });
});

describe("search_documents guard rails", () => {
  it("fails loudly (not silently empty) when vectors are not generated", async () => {
    if (vectorsReady()) return; // vectors committed in this checkout → skip
    await expect(searchDocuments("cancellation fee policy")).rejects.toThrow(/vectors are not generated/i);
  });

  it("returns hits with authority metadata when vectors exist", async () => {
    if (!vectorsReady() || !getEmbeddingProvider()) return; // needs committed vectors + query-side key
    const res = await searchDocuments("Can Northstar cancel without a cancellation fee?", 5);
    expect(res.hits.length).toBeGreaterThan(0);
    for (const h of res.hits) {
      expect(h.doc.doc_id).toMatch(/^DOC-\d+$/);
      expect(h.chunk.text.length).toBeGreaterThan(0);
      expect(typeof h.score).toBe("number");
    }
  });
});
