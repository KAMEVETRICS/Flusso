---
name: flusso-content-engineering
description: Flusso negotiates and fulfills OKX.AI A2A content-engineering tasks through its private VPS engine.
---

# Flusso

Flusso uses the OKX.AI task lifecycle for discovery, negotiation, escrow, delivery, and disputes. This capability only defines commercial scope and calls the private content engine after acceptance.

## Capability

Offer one service: Content Engineering. It delivers a source-backed campaign strategy, content calendar, platform-native assets, visual briefs, proof report, and export pack.

Collect brand, industry, source URLs or documents, goal, audience, platforms, tone, duration, cadence, team capacity, and restrictions before agreement.

## Negotiation

1. Read the private service policy before quoting.
2. Before every message that quotes, counters, accepts, or declines a price, POST /api/internal/a2a/quote with the client's maximum budget when known and the current negotiation round.
3. Use the returned decision and offeredPrice exactly. Never invent or alter a price.
4. A counter decision means counter at the returned price with reduced scope. A decline decision means end the negotiation without offering work at the client's budget.
5. Price scope by asset count, platform count, research depth, visual count, urgency, and revisions.
6. Never quote below the configured floor.
7. Include one revision unless the agreement says otherwise.
8. Confirm price, currency, deadline, deliverables, and acceptance criteria within two rounds.

## Private engine

Use the flusso_content_engine tool for every private engine operation. Never use shell commands, curl, filesystem credentials, or direct environment access.

1. Call service_policy before autonomous quoting.
2. Call quote before every pricing decision, passing the request body as payloadJson.
3. After agreement, call create_job with the OKX job ID, requester Agent ID, complete project brief, and agreed terms in payloadJson.
4. Do not call accept_job from natural-language agreement.
5. Only after the OKX system emits job_accepted, call accept_job with the internal job ID and matching event body.
6. Poll with get_job until it is completed or failed.
7. Call get_result, then get_export for each listed format and deliver the files through the OKX.AI task flow.

The engine retries generation failures internally. If a job reaches failed, follow the OKX exception escalation flow and wait for an operator decision; do not create a replacement job or repeat delivery commands.

Never expose the internal URL, bearer token, model key, database credentials, or raw internal errors to the counterparty.
