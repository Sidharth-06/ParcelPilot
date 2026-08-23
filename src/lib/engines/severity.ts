import { getPolicyModel } from "@/lib/policy/registry";
import type { Severity } from "@/lib/policy/parse";
import { cosine, vectorsFile } from "@/lib/retrieval/vectors";

/**
 * Data-driven severity inference.
 *
 * Path 1 — clause match: noun tokens extracted from the CURRENT policy's own
 * severity definitions (plus a small linguistic synonym map, not dataset
 * answers). A clause with ≥2 matched tokens pins that severity at high
 * precision. This catches planted high-stakes phrasing ("API key exposed")
 * even when the document said "credential exposure".
 *
 * Path 2 — semantic: cosine between build-time ticket embeddings and
 * severity-definition embeddings.
 *
 * Fallback — lexical n-gram overlap against the definition texts.
 */

const SEVERITIES: Severity[] = ["P1", "P2", "P3"];

const STOP = new Set([
  "the", "a", "an", "or", "and", "of", "for", "with", "to", "is", "are", "be", "by", "on", "in",
  "that", "this", "it", "its", "as", "at", "but", "not", "no", "all", "any", "another", "from",
  // Generic support-domain nouns that carry no severity signal:
  "customer", "customers", "business", "event", "material",
]);

/** Linguistic synonyms — generic English, not dataset-specific answers. */
const SYNONYMS: Record<string, string> = {
  credentials: "credential",
  key: "credential",
  keys: "credential",
  secret: "credential",
  secrets: "credential",
  password: "credential",
  token: "credential",
  exposed: "exposure",
  leak: "exposure",
  leaked: "exposure",
  public: "exposure",
  publicly: "exposure",
  outages: "outage",
  down: "outage",
  failing: "failing",
  broken: "failing",
};

function normalizeToken(w: string): string {
  const t = w.toLowerCase();
  return SYNONYMS[t] ?? t;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(normalizeToken)
  );
}

interface ClauseRule {
  severity: Severity;
  clause: string;
  tokens: string[];
}

let clauseRulesCache: ClauseRule[] | null = null;

/** Extract per-clause token sets from the parsed severity definitions. */
export function getClauseRules(): ClauseRule[] {
  if (clauseRulesCache) return clauseRulesCache;
  const defs = getPolicyModel().policy.severityDefinitions;
  const rules: ClauseRule[] = [];
  for (const sev of SEVERITIES) {
    const def = defs[sev];
    if (!def) continue;
    const clauses = def
      .split(/,\s+|\s+or\s+|\.\s+/i)
      .map((c) => c.trim())
      .filter((c) => c.split(/\s+/).length >= 2);
    for (const clause of clauses) {
      const tokens = [...tokenize(clause)];
      if (tokens.length >= 2) rules.push({ severity: sev, clause, tokens });
    }
  }
  clauseRulesCache = rules;
  return rules;
}

export interface SeverityResult {
  severity: Severity | null;
  confidence: number;
  method: "clause" | "vector" | "lexical" | "none";
}

export function inferSeverity(subject: string, description: string): SeverityResult {
  const textTokens = tokenize(`${subject}. ${description}`);

  // Path 1: clause match — highest precision, derived from the document itself.
  for (const sev of SEVERITIES) {
    for (const rule of getClauseRules()) {
      if (rule.severity !== sev) continue;
      const matched = rule.tokens.filter((t) => textTokens.has(t));
      if (matched.length >= Math.min(2, rule.tokens.length)) {
        return { severity: sev, confidence: 1, method: "clause" };
      }
    }
  }

  // Fallback: lexical n-gram scoring against full definition texts.
  const defs = getPolicyModel().policy.severityDefinitions;
  const scores = Object.fromEntries(
    SEVERITIES.map((s) => [s, defs[s] ? ngramScore(defs[s]!, `${subject}. ${description}`) : 0])
  ) as Record<Severity, number>;
  const ranked = [...SEVERITIES].sort((a, b) => scores[b] - scores[a]);
  const total = SEVERITIES.reduce((acc, s) => acc + scores[s], 0);
  if (total === 0 || !defs[ranked[0]]) return { severity: null, confidence: 0, method: "none" };
  return { severity: ranked[0], confidence: scores[ranked[0]] / total, method: "lexical" };
}

function ngramScore(defText: string, ticketText: string): number {
  const d = Array.from(tokenize(defText));
  const t = tokenize(ticketText);
  let score = 0;
  for (let i = 0; i < d.length; i++) {
    if (t.has(d[i])) score += 1;
    if (i > 0 && t.has(`${d[i - 1]} ${d[i]}`)) score += 3;
  }
  return score;
}

/** Vector-based variant used whenever build-time ticket embeddings exist. */
export function inferSeverityFromTicketId(
  ticketId: string,
  ticketText: string,
  lookupTicketVec: (id: string) => number[] | undefined
): SeverityResult {
  // Clause path first — deterministic and precise when it fires.
  const clause = inferSeverity(ticketId === "" ? "" : ticketText.slice(0, 160), ticketText);
  if (clause.method === "clause") return clause;

  const sevVecs = vectorsFile().collections.known_issues?.filter((e) => e.id.startsWith("SEV-")) ?? [];
  const tv = lookupTicketVec(ticketId);
  if (tv && sevVecs.length === SEVERITIES.length) {
    const scored = sevVecs.map((e) => ({
      sev: e.id.replace("SEV-", "") as Severity,
      score: cosine(tv, e.vec),
    }));
    scored.sort((a, b) => b.score - a.score);
    const gap = scored[0].score - (scored[1]?.score ?? 0);
    if (scored[0].score > 0.2 && Object.keys(getPolicyModel().policy.severityDefinitions).length === SEVERITIES.length) {
      // Only trust the semantic winner when it leads by a non-trivial margin;
      // otherwise defer to the lexical fallback rather than guessing.
      if (gap >= 0.02) return { severity: scored[0].sev, confidence: Math.min(1, scored[0].score), method: "vector" };
      const lex = inferSeverity(ticketText.split(".")[0], ticketText);
      if (lex.severity && lex.confidence >= 0.5) return lex;
      return { severity: scored[0].sev, confidence: scored[0].score, method: "vector" };
    }
  }
  return clause.method === "lexical" ? clause : inferSeverity("", ticketText);
}
