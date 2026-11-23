# SURAKSHA — Family Scam-Call Protection System

Built for **wHACKiest 2026 (Make MCP Matter)**, **SURAKSHA** is a live-call guardian that detects scam tactics in real time, interrupts isolation using a pre-consented family voice (*"Kya main Ansh ko abhi bula loon?"*), requires explicit parental approval (*"Haan"*), enforces authorization through **AgentCore Gateway + Lambda Interceptor + Cedar Policy**, executes isolated **MCP** servers (`Listen`, `Scam-Intel`, `Family`, `Audit`), dispatches **Amazon SNS** guardian notifications, records a tamper-evident **SHA-256 hash-chained audit trail**, and generates an **Evidence Pack** for manual family reporting (**Chakshu**, **1930**, **cybercrime.gov.in**).

## Operating Modes (DEMO MODE vs LIVE MODE)

- **DEMO MODE (Default — Zero API Keys Required)**:
  - Runs the **real** server-side deterministic Rule Engine (`rules-2026.11.v3`), HMAC-SHA256 Approval Service (with cryptographic nonces, expiry, and single-use registry), Lambda Interceptor, Cedar Policy evaluator (`/policies/suraksha.cedar`), 4 MCP tool servers, persistent local SHA-256 hash-chained audit store (`data/suraksha-audit.json`), Evidence Pack generator, and isolated Scam Drill trainer.
  - External ElevenLabs and AWS endpoints run via clearly labeled `MOCK` adapters.
- **LIVE MODE (Env-Driven Adapters)**:
  - Individual integrations switch independently from `MOCK` to `LIVE` when credentials are configured in `.env` (see `.env.example`), without rewriting business logic.
  - Missing credentials for one service (e.g., Bedrock or SNS) never disable the Rule Engine or other configured integrations. Each adapter calculates and displays its actual state: `MOCK`, `LIVE`, `PENDING CONFIGURATION`, or `CONNECTION FAILED`.

## Local Setup & Commands

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Automated Tests & Production Build

```bash
npm test          # Runs detection, Bedrock degradation, approval/Cedar, MCP, audit tamper, drill & link tests
npm run lint      # TypeScript type-check (tsc --noEmit)
npm run build     # Production Vite bundle
NODE_ENV=production npm start
```

See [`docs/ARCHITECTURE_AND_AWS_DEPLOY.md`](docs/ARCHITECTURE_AND_AWS_DEPLOY.md) for the complete architecture specification, AWS deployment prerequisites, LIVE MODE configuration, and step-by-step hackathon demonstration script.
