# ParcelPilot — Support & Operations Console

An internal AI console for ParcelPilot's support and operations team. Built for the CalQuity AI Engineer assessment.

The agent answers policy and operational questions using vector retrieval over the supplied document corpus, evaluates SLA and fee calculations through deterministic TypeScript engines, and executes state-changing actions only after an HMAC-signed, expiring human confirmation step.

---

## Live Application

- Console: https://parcelpilot-ops-console.vercel.app
- Proactive Insights: https://parcelpilot-ops-console.vercel.app/insights
- Health check: https://parcelpilot-ops-console.vercel.app/api/health

---

## Architecture

```
Browser ── SSE stream ──► /api/chat (Vercel AI SDK tool loop, ≤8 steps)
                              │
              ┌───────────────┴────────────────┐
              │                                │
        Read / compute                   Guarded mutations
        ─────────────                    ─────────────────
        search_documents (vector)        create_escalation
        get_order / get_ticket           update_ticket
        calculate_cancellation           create_task
        calculate_service_credit
        check_sla                        ↓ on Confirm click
              │                    /api/actions/confirm
              ▼                    (re-verify RBAC + HMAC + idempotency)
        In-memory compiled
        data store + vector index
```

Single Next.js app, no external database. The data pack is compiled at build time into `src/data/generated/`.

---

## Setup

### Requirements
- Node.js 20+
- npm 10+

### Install
```bash
git clone https://github.com/<your-username>/parcelpilot-ops-console.git
cd parcelpilot-ops-console
npm install
```

### Environment variables
Create `.env.local`:
```
GROQ_API_KEY=gsk_...
GROQ_MODEL=qwen/qwen3.6-27b
GROQ_BASE_URL=https://api.groq.com/openai/v1

GOOGLE_API_KEY=AIza...
GEMINI_EMBED_MODEL=gemini-embedding-001

APP_SECRET=<random 32+ chars>
```

### Run
```bash
npm run dev   # http://localhost:3000
```

`GET /api/health` reports LLM config, embedding provider, vector index status, and policy-parse warnings.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run compile-data` | Re-extract PDFs/xlsx from `../data` into `src/data/generated/*.json` |
| `npm run embed` | Embed chunks, known issues, and tickets into `vectors.json` |
| `npm run test` | Run all tests (46 across 5 suites) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

---

## What it does

**Three mock roles** (selectable on `/`) — Analyst (read-only), Support Agent, Ops Manager.  
RBAC is enforced inside tool `execute()` and re-checked at `/api/actions/confirm` — not by prompt instructions.

**Chat console** (`/console`)  
Natural-language Q&A over policy docs, contracts, and structured ticket/order data. Every tool call renders a visible trace chip. Guarded tools return a signed confirmation card; clicking Confirm POSTs the HMAC token to the server for execution.

**Insights dashboard** (`/insights`)  
Proactive signal scan computed deterministically at snapshot time: SLA breach detection (contract-aware targets), known-issue cluster correlation, outage signal detection, and an audit of historical ticket answers that contradict current authoritative sources.

---

## Design decisions

- **No LLM arithmetic.** Money and SLA calculations run through typed TypeScript engines whose parameters are parsed from documents at boot. A data-pack change changes behaviour; a code change is not required.
- **Contract > Policy precedence.** The retrieval and engine layers enforce: customer agreement overrides current SOP, which overrides general docs. Historical ticket resolutions are context-only.
- **Stateless confirmation.** Intent tokens are HMAC-SHA256 signed and carry a 10-minute TTL. No database row-lock or external state service required; works on ephemeral serverless runtimes.
- **In-memory data store.** Brute-force cosine over ~40 committed vectors is microseconds. A vector DB (pgvector) becomes relevant above ~10k chunks; the `Retriever` interface makes the swap local. The executed-action log resets on cold start — acceptable for a mocked write path.

---

## Project layout

```
src/
  app/
    api/actions/confirm/   HMAC intent execution
    api/auth/              Login / logout / session
    api/chat/              Streaming tool loop
    api/health/            Readiness & policy-parse status
    console/               Chat interface
    insights/              Proactive issue detection
    page.tsx               Role selector / landing
  components/
    thread.tsx             Assistant UI renderer + tool grouping
    ops-tool-fallback.tsx  Tool trace chips + confirmation card
    ops-welcome.tsx        Starter prompts
    brand-badge.tsx        Header logo
    insights-view.tsx      Insights card layout
  lib/
    actions/               Intent tokens, store, executors
    agent/                 System prompt, model config, tool catalogue
    auth/                  RBAC matrix + capability guards
    data/                  In-memory entity lookups
    engines/               SLA, credit, cancellation calculation engines
    policy/                Boot-time PolicyModel parser
    retrieval/             Vector search + embedding provider
tests/                     46 integration tests
ARCHITECTURE.md            Detailed architecture note
PRODUCT.md                 Product decisions, roadmap, metric
```

---

## Tests

```
tests/policy.test.ts       11 tests — policy parsing
tests/sla-math.test.ts      5 tests — SLA elapsed time math
tests/rbac-intents.test.ts  7 tests — RBAC matrix + HMAC tokens
tests/engines.test.ts      19 tests — cancellation & credit engines
tests/retrieval.test.ts     4 tests — cosine similarity math

46 tests, 0 failures
```

---

## AI tooling

Development: OpenCode / Antigravity AI was used for scaffolding, module implementation, and test authoring, with human review at each step.

Runtime: Vercel AI SDK + Groq API (qwen3.6-27b) for inference.

---

See [ARCHITECTURE.md](ARCHITECTURE.md) and [PRODUCT.md](PRODUCT.md) for the full architecture and product notes required by the submission.
