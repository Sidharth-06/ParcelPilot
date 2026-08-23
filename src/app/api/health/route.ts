import { NextResponse } from "next/server";
import { env, embeddingConfigured, llmConfigured } from "@/lib/env";
import { getPolicyModel } from "@/lib/policy/registry";
import { vectorsInfo, vectorsReady } from "@/lib/retrieval/vectors";

export async function GET() {
  let policyOk = true;
  let policyWarnings: string[] = [];
  try {
    policyWarnings = getPolicyModel().policy.warnings;
  } catch (e) {
    policyOk = false;
    policyWarnings = [e instanceof Error ? e.message : "policy model failed"];
  }
  const e = env();
  return NextResponse.json({
    ok: policyOk,
    time: new Date().toISOString(),
    checks: {
      llm: e.GROQ_API_KEY
        ? `configured (groq/${e.GROQ_MODEL})`
        : llmConfigured()
          ? "configured (opencode-zen fallback)"
          : "missing GROQ_API_KEY",
      embeddings: embeddingConfigured() ? "provider configured" : "no provider key",
      vectors: vectorsReady()
        ? `ready (${vectorsInfo().count} chunks, ${vectorsInfo().model})`
        : "not generated — run npm run embed",
      policy: policyOk ? `parsed (${policyWarnings.length} warnings)` : "failed",
    },
    policyWarnings,
  });
}
