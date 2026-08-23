# Product Note

## Scope decision: internal-first

I built the **internal support/operations console** and went deep on both client problems
(proactive issue detection + trust/reliability) rather than splitting effort across a
customer-facing bot. Rationale: the operations team is where unreliable answers cost the most
(they compound into customer-facing mistakes — see the misguidance findings below), and every
trust mechanism an internal agent needs (precedence handling, conflict cards, uncertainty
refusals, guarded actions) is exactly the substrate a safe customer-facing agent would later
inherit. The persona/capability layer was designed so a customer context can be added as a
fourth, account-scoped role without re-architecture.

## How Problem 1 (proactive issue detection) is addressed

`/insights` computes at snapshot time, deterministically:

- **SLA breaches** with contract-aware targets — e.g. a Northstar P1 evaluated against its
  contracted 15-minute target, not the generic Enterprise matrix.
- **Known-issue correlation** — open tickets embedded and cosine-matched against the parsed
  known-issue registry; multi-ticket matches surface as candidate systemic issues with the
  published workaround attached.
- **Blast-radius signals** — P1 inference *combined with* explicit account-wide language.
- **Duplicate-effort clustering** — semantically similar open tickets across accounts.
- **Historical-guidance audit** — closed-ticket resolutions are checked against current ground
  truth: fee claims contradicted by signed waivers, row-limit claims contradicted by parsed
  capability limits. These become correction work items.

Every card links "Investigate in chat" with a prefilled prompt, closing the loop between
detection and action.

## What else I would build next (priority order)

1. **Feedback capture on every answer** (was this right? → routing to knowledge owners). The
   misguidance audit proves stale answers persist silently; feedback telemetry turns that into
   a measurable pipeline. Highest trust ROI.
2. **Customer-facing bot on the same substrate** — account-scoped tools already exist; add a
   customer session type with narrower capabilities and the same confirmation/escalation rails.
3. **Live data connectors** — replace the snapshot with CDC from the order/ticket systems;
   engines stay identical because they take entities as inputs.
4. **Eval harness in CI** — golden-question regression set run against the live model weekly to
   catch prompt/model drift.
5. **SLA clock visualisation per ticket** — the engine already computes breach math; surfacing
   it inline in ticket views would make it operational for agents, not just reviewers.

## Intentionally left out

- Real authentication/SSO (mocked personas, clearly labelled).
- Persistent storage of executed actions (mock store behind a swappable interface).
- Customer-facing chat surface.
- Multi-tenant document isolation UI (all internal roles are authorised for full corpus).

## The one metric that matters

**Time-to-first-action on P1-relevant insights** — minutes from a qualifying signal existing in
the data (breach, correlated cluster, contradiction) to a recorded staff action (escalation,
ticket update, task). The product's thesis is that proactive, trustworthy detection collapses
this time; if it doesn't move down week over week, nothing else here matters.
