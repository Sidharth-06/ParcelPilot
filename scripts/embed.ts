/**
 * Build-time embedding pass.
 * Embeds: doc chunks, known-issue summaries, and ticket texts into
 * src/data/generated/vectors.json. Re-run whenever the data pack changes;
 * a content hash detects staleness at runtime.
 *
 * Requires GOOGLE_API_KEY or JINA_API_KEY. Run: npm run embed
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { allChunks, allTickets } from "../src/lib/data/store";
import { getPolicyModel } from "../src/lib/policy/registry";
import { getEmbeddingProvider } from "../src/lib/retrieval/embeddings";
import type { VectorEntry, VectorsFile } from "../src/lib/retrieval/vectors";

/** Minimal .env.local loader — tsx does not apply Next.js env loading. */
function loadEnvLocal(): void {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || m[1].startsWith("#")) continue;
      const val = m[2].replace(/^["']|["']$/g, "");
      if (!(m[1] in process.env)) process.env[m[1]] = val;
    }
  } catch {
    /* no .env.local — provider resolution will report what's missing */
  }
}
loadEnvLocal();

async function main() {
  const provider = getEmbeddingProvider();
  if (!provider) {
    console.error("No embedding provider configured. Set GOOGLE_API_KEY or JINA_API_KEY.");
    process.exit(1);
  }

  // Validates that the policy model parses cleanly before we spend tokens.
  const model = getPolicyModel();
  if (model.policy.warnings.length) {
    console.warn("Policy warnings:", model.policy.warnings);
  }

  const chunkTexts = new Map(allChunks().map((c) => [c.chunk_id, `${c.title}\n${c.text}`]));
  const kiTexts = new Map(
    model.policy.knownIssues.map((k) => [k.ki_id, `Known issue ${k.ki_id}: ${k.title}. ${k.description} ${k.workaround ?? ""}`])
  );
  // Severity definitions get their own vectors so ticket→severity is semantic.
  for (const [sev, def] of Object.entries(model.policy.severityDefinitions)) {
    kiTexts.set(`SEV-${sev}`, `Severity class ${sev} definition: ${def}`);
  }
  const ticketTexts = new Map(
    allTickets().map((t) => {
      const acc = t.account_id;
      return [t.ticket_id, `Ticket ${t.ticket_id} (${acc}, ${t.status}): ${t.subject}. ${t.description}`];
    })
  );

  async function embedAll(map: Map<string, string>, purpose: "document"): Promise<VectorEntry[]> {
    const entries: VectorEntry[] = [];
    const ids = [...map.keys()];
    const BATCH = 32;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batchIds = ids.slice(i, i + BATCH);
      const batchTexts = batchIds.map((id) => map.get(id)!);
      process.stdout.write(`embed ${purpose} ${i + 1}-${i + batchIds.length}/${ids.length}\n`);
      const vecs = await provider!.embed(batchTexts, purpose);
      batchIds.forEach((id, j) => entries.push({ id, vec: vecs[j] }));
    }
    return entries;
  }

  const chunks = await embedAll(chunkTexts, "document");
  const known_issues = kiTexts.size ? await embedAll(kiTexts, "document") : [];
  const tickets = await embedAll(ticketTexts, "document");

  const hash = createHash("sha256");
  for (const [id, text] of [...chunkTexts.entries()].sort()) hash.update(`${id}:${text}`);
  for (const t of allTickets().map((t) => [t.ticket_id, t.subject + t.description] as const).sort()) hash.update(`${t[0]}:${t[1]}`);

  const file: VectorsFile = {
    provider_model: `${provider.name}/${provider.model}`,
    dim: chunks[0]?.vec.length ?? 0,
    generated_at: new Date().toISOString(),
    content_hash: hash.digest("hex"),
    collections: { chunks, known_issues, tickets },
  };
  writeFileSync(new URL("../src/data/generated/vectors.json", import.meta.url), JSON.stringify(file));
  console.log(`vectors.json written: model=${file.provider_model} dim=${file.dim} chunks=${chunks.length} kIs=${known_issues.length} tickets=${tickets.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
