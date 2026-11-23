# SURAKSHA — Architecture, AWS Deployment & Hackathon Demo Script

## 1. Architecture Overview (7-Page Dashboard + Backend Security Core)

1. **External Audio & Voice Layer (`src/server/adapters/elevenlabs.ts`)**
   - `SpeechToTextProvider` (`MockSpeechToTextProvider` / `ElevenLabsScribeProvider`): Streams progressive transcript segments or browser microphone input over WebSocket (`scribe_v2_realtime`).
   - `TextToSpeechProvider` (`MockTTSProvider` / `ElevenLabsTTSProvider`): Plays strictly **pre-generated, pre-consented family voice clips** (`"Kya main Ansh ko abhi bula loon?"`) with browser speech synthesis fallback in DEMO MODE.
   - **Echo Prevention**: Marks system playback lines as `echo_suppressed: true` so SURAKSHA's own voice is never evaluated as scammer speech.

2. **Detection Layer (`src/server/ruleEngine.ts`, `src/server/adapters/bedrock.ts`)**
   - **Deterministic Rule Engine (`rules-2026.11.v3`)**: Evaluates rolling transcript windows across 6 scam categories (`ISOLATION`, `FAKE_AUTHORITY`, `THREATS`, `URGENCY`, `MONEY_AND_CREDENTIALS`, `REMOTE_ACCESS`) in milliseconds, independent of LLM availability. Single benign mentions do not falsely escalate.
   - **Amazon Bedrock (`LLMProvider`)**: Used **only** for risk explanation and Hindi reassurance scripts. Never authorizes actions, overrides Cedar, or talks to scammers.

3. **Orchestration & Approval Security (`src/server/orchestrator.ts`, `src/server/approvalService.ts`)**
   - Lifecycle: `DETECTED -> INTERRUPTION PLAYED -> APPROVAL PENDING -> APPROVED / REJECTED -> AUTHORIZATION CHECK -> TOOL EXECUTION -> FAMILY ALERTED -> EVIDENCE READY`.
   - Parent explicit `"haan"` (tap or verified voice utterance; ambiguous phrases rejected) mints an HMAC-SHA256 signed, single-use, short-lived, nonce-protected, alert-bound `approval_token`. Raw secrets/signatures never leave the server.

4. **Policy Enforcement & Four MCP Server Groups (`/policies/suraksha.cedar`, `src/server/cedarPolicy.ts`, `src/server/gatewayAndMcp.ts`)**
   - **AgentCore Gateway + Cognito OAuth + Lambda Interceptor + Cedar Policy (`default-deny`, `forbid-wins`)** gate all 4 MCP server groups:
     - **Listen MCP (Tier 1)**: `get_transcript_window`
     - **Scam-Intel MCP (Tier 1)**: `match_scam_playbook`, `score_signals`, `check_url`, `prepare_evidence_pack`
     - **Family MCP (Tier 2)**: `alert_guardians`, `send_family_voice_message` (signed single-use bound token mandatory)
     - **Audit MCP**: `append_event` (append-only; `PUT/DELETE /api/audit/*` return `405`)

5. **Outputs, Manual Handoff & Isolated Training (`src/server/adapters/awsOutput.ts`, `src/server/scamDrill.ts`, `src/server/messageLinkChecker.ts`)**
   - **Amazon SNS**: Dispatches guardian alerts (`MOCK` or `LIVE`).
   - **DynamoDB + S3 Object Lock**: SHA-256 hash-chained audit events (`previous_hash -> event_hash`) persisted locally in DEMO MODE (`data/suraksha-audit.json`) and replicated to DynamoDB + S3 Object Lock (`GOVERNANCE`) in LIVE MODE.
   - **Manual Reporting Only**: Evidence Packs display `"EVIDENCE READY – MANUAL FAMILY SUBMISSION REQUIRED"` with Chakshu / `1930` / `cybercrime.gov.in` guidance (`auto_submitted: false`).
   - **Scam Drill & Secondary Message/Link Check**: Completely separated from the Live Guard call path.

---

## 2. LIVE MODE Configuration & AWS Deployment Prerequisites

1. **AWS Services Required (`ap-south-1` recommended)**
   - **Amazon Cognito**: User Pool + App Client (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`).
   - **Amazon Bedrock**: Model access enabled for `BEDROCK_MODEL_ID` (e.g., `anthropic.claude-3-5-sonnet-20240620-v1:0`).
   - **Amazon SNS**: Guardian notification topic (`SNS_TOPIC_ARN`) with verified SMS/email subscriptions.
   - **Amazon DynamoDB**: Audit table (`DYNAMODB_TABLE_NAME`) with keys `alert_id` (S) and `seq` (N).
   - **Amazon S3**: Bucket with **Object Lock enabled** (`S3_AUDIT_BUCKET`).
   - **AgentCore Gateway & Lambdas**: Deploy Orchestrator (`ORCHESTRATOR_LAMBDA_ARN`) and Lambda Interceptor (`LAMBDA_INTERCEPTOR_ARN`) behind `AGENTCORE_GATEWAY_URL`, using `/policies/suraksha.cedar`.
2. **ElevenLabs Credentials**
   - `ELEVENLABS_API_KEY` for Scribe v2 (`scribe_v2_realtime`) and pre-consented family `ELEVENLABS_VOICE_ID`.
   - Optional `ELEVENLABS_DRILL_AGENT_ID` strictly for the isolated Scam Drill module.
3. **Environment Setup**
   - Copy `.env.example` to `.env` (or configure IAM roles / Secrets Manager in AWS).
   - Open **Integration Status** and click **Run Health Checks** to verify `LIVE` vs `PENDING CONFIGURATION` vs `CONNECTION FAILED` per service.

---

## 3. Step-by-Step Hackathon Demonstration Script

1. **Protection Home (`Protection Home`)**:
   - Point out SURAKSHA protection status, guardian connection, and zero-key DEMO MODE transparency. Click **Start Live Guard**.
2. **Live Call Detection & Voice Interruption (`Live Guard`)**:
   - Keep **Digital Arrest (CBI Parcel Threat)** selected and let progressive transcript lines arrive (or click **Step**).
   - Line 1 triggers `Listen.get_transcript_window` + `Scam-Intel.score_signals`.
   - Line 2 (`FAKE_AUTHORITY` + `ISOLATION` + `THREATS`) triggers an immediate `High Risk` alert, echo-suppressed pre-generated voice prompt ***"Kya main Ansh ko abhi bula loon?"***, and contextual Bedrock explanation + Hindi script.
   - Optional: type `"maybe later"` in the voice verification box to prove ambiguous speech is rejected without notifying family.
3. **Policy Enforcement Proof (`Architecture Monitor`)**:
   - Open **Architecture Monitor**, show the 19 color-coded nodes, then click **Missing Token**, **Expired Token**, and **Reused Token (Replay)**.
   - Point out the immediate **DENY** traces from Cedar `forbid-wins` and zero execution on Family MCP.
4. **Explicit Parental Approval & Evidence Pack (`Live Guard` -> `Guardian Dashboard` -> `Evidence Center`)**:
   - Return to **Live Guard** and click **Haan**.
   - Show the signed, nonce-bound token transitioning `ACTIVE -> USED`, `Family.alert_guardians` permitted by Cedar, SNS notification dispatched, and Guardian Dashboard updated.
   - Open **Evidence Center**, download JSON/Readable Report, click **Verify SHA-256 Chain**, then click **Simulate Tamper Detection** to prove historical modification is caught immediately. Highlight **EVIDENCE READY – MANUAL FAMILY SUBMISSION REQUIRED** (`Chakshu / 1930 / cybercrime.gov.in`).
5. **Isolated Training & Link Check (`Scam Drill` & `Integration Status`)**:
   - Open **Scam Drill** to complete a role-play exercise (showing strict architectural separation from Live Guard).
   - Open **Integration Status** and toggle Bedrock to `unavailable` to demonstrate Rule Engine resilience (`CONNECTION FAILED` on Bedrock while call protection still triggers instantly).
