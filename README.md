# Flusso

Flusso is a source-backed content campaign engine and OKX.AI A2A Agent Service Provider.

The application turns a structured brief into:

- campaign strategy and audience territories
- a content calendar
- platform-native assets for X, LinkedIn, Medium, newsletters, Discord, and Mirror
- visual briefs and generated visual assets
- claim verification and a proof report
- strategy, calendar, and content-pack exports

## Local development

1. Copy **.env.example** to **.env.local**.
2. Configure the model, Neon database, and internal A2A variables.
3. Install and run:

~~~bash
npm ci
npm run dev
~~~

The local application uses port 3107 in the current development workflow.

## A2A architecture

The OKX-facing provider Agent and this content engine run on the same VPS. The provider Agent calls the protected engine at **http://127.0.0.1:3107**; the engine is not exposed to the public internet.

Commercial policy:

- currency: USDT
- internal floor: 30
- target: 100
- opening markup: 15%, producing a 115 opening offer
- pricing shown on OKX.AI: Negotiable

See [deploy/README.md](deploy/README.md) for the GitHub-to-VPS production workflow and [deploy/LISTING.md](deploy/LISTING.md) for marketplace copy.