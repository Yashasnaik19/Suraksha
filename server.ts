import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { BedrockSimulationMode } from './src/server/adapters/bedrock';
import { MCP_TOOL_CATALOG } from './src/server/gatewayAndMcp';
import { inspectSuspiciousMessageOrLink } from './src/server/messageLinkChecker';
import { SurakshaOrchestrator } from './src/server/orchestrator';
import {
  evaluateScamDrillSubmission,
  SCAM_DRILL_SCENARIOS,
} from './src/server/scamDrill';
import { SCENARIOS } from './src/server/scenarios';
import { PolicyTestScenario } from './src/server/types';

export function createApp(orchestrator = new SurakshaOrchestrator()) {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // Serve pre-generated /public/audio files if added on hack day
  const publicAudioDir = path.resolve(process.cwd(), 'public', 'audio');
  if (fs.existsSync(publicAudioDir)) {
    app.use('/audio', express.static(publicAudioDir));
  }

  // Health & adapter status
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'suraksha-backend',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/state', (_req, res) => {
    res.json(orchestrator.getSnapshot());
  });

  app.get('/api/scenarios', (_req, res) => {
    res.json({ scenarios: SCENARIOS });
  });

  app.get('/api/mcp/tools', (_req, res) => {
    res.json({ tools: MCP_TOOL_CATALOG });
  });

  // Server-Sent Events for real-time Guardian Dashboard & System Monitor updates
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    send(orchestrator.getSnapshot());
    const unsubscribe = orchestrator.subscribe((snapshot) => send(snapshot));

    req.on('close', () => {
      unsubscribe();
    });
  });

  app.post('/api/call/start', async (req, res) => {
    const scenario_id =
      typeof req.body?.scenario_id === 'string'
        ? req.body.scenario_id
        : undefined;
    const input_mode =
      req.body?.input_mode === 'microphone' ? 'microphone' : 'scripted';
    const snapshot = await orchestrator.startCall({ scenario_id, input_mode });
    res.json(snapshot);
  });

  app.post('/api/call/step', async (req, res) => {
    const custom_text =
      typeof req.body?.custom_text === 'string'
        ? req.body.custom_text.slice(0, 600)
        : undefined;
    const speaker = req.body?.speaker === 'Parent' ? 'Parent' : 'Caller';
    const snapshot = await orchestrator.stepScriptedOrIngestTranscript({
      custom_text,
      speaker,
    });
    res.json(snapshot);
  });

  app.post('/api/approval', async (req, res) => {
    const decision = req.body?.decision;
    if (decision !== 'haan' && decision !== 'nahi') {
      res.status(400).json({ error: 'decision must be "haan" or "nahi"' });
      return;
    }
    const snapshot = await orchestrator.submitParentApproval(decision);
    res.json(snapshot);
  });

  app.post('/api/approval/voice', async (req, res) => {
    const utterance =
      typeof req.body?.utterance === 'string'
        ? req.body.utterance.slice(0, 200)
        : '';
    const result = await orchestrator.submitParentVoiceUtterance(utterance);
    res.status(result.accepted ? 200 : 422).json(result);
  });

  app.post('/api/bedrock/mode', (req, res) => {
    const allowedModes = new Set<BedrockSimulationMode>([
      'normal',
      'timeout',
      'unavailable',
    ]);
    const mode = req.body?.mode as BedrockSimulationMode;
    if (!allowedModes.has(mode)) {
      res
        .status(400)
        .json({ error: 'mode must be normal, timeout, or unavailable' });
      return;
    }
    res.json(orchestrator.setBedrockSimulationMode(mode));
  });

  app.post('/api/integrations/health', (_req, res) => {
    res.json(orchestrator.runIntegrationHealthChecks());
  });

  app.post('/api/policy-test', async (req, res) => {
    const allowedScenarios = new Set<PolicyTestScenario>([
      'missing_token',
      'expired_token',
      'invalid_signature',
      'wrong_alert_id',
      'reused_token',
      'tampered_token',
      'unauthorized_family_action',
    ]);
    const scenario = req.body?.scenario as PolicyTestScenario;
    if (!allowedScenarios.has(scenario)) {
      res.status(400).json({ error: 'Invalid policy test scenario' });
      return;
    }
    const result = await orchestrator.runPolicyTest(scenario);
    res.json(result);
  });

  app.get('/api/audit/verify', (_req, res) => {
    res.json(orchestrator.verifyAuditChain());
  });

  app.post('/api/audit/tamper-check', (_req, res) => {
    res.json(orchestrator.simulateAuditTamperCheck());
  });

  // Explicitly forbid mutation/deletion of historical audit events
  app.put('/api/audit/*', (_req, res) => {
    res.status(405).json({ error: 'Audit log is strictly append-only' });
  });
  app.delete('/api/audit/*', (_req, res) => {
    res.status(405).json({ error: 'Audit log is strictly append-only' });
  });

  // Secondary Message & Link Check (never clicks or fetches links)
  app.post('/api/tools/check-message', (req, res) => {
    const message_text =
      typeof req.body?.message_text === 'string'
        ? req.body.message_text.slice(0, 1500)
        : '';
    const url_input =
      typeof req.body?.url_input === 'string'
        ? req.body.url_input.slice(0, 500)
        : '';
    if (!message_text && !url_input) {
      res
        .status(400)
        .json({ error: 'Provide message_text or url_input to inspect' });
      return;
    }
    res.json(inspectSuspiciousMessageOrLink({ message_text, url_input }));
  });

  // Isolated Scam Drill routes (strictly separated from Live Guard call path)
  app.get('/api/drill/scenarios', (_req, res) => {
    res.json({
      isolated_from_live_guard: true,
      scenarios: SCAM_DRILL_SCENARIOS,
    });
  });

  app.post('/api/drill/evaluate', (req, res) => {
    const scenario_id =
      typeof req.body?.scenario_id === 'string'
        ? req.body.scenario_id
        : 'drill-digital-arrest';
    const selected_choices = Array.isArray(req.body?.selected_choices)
      ? req.body.selected_choices
      : [];
    res.json(evaluateScamDrillSubmission({ scenario_id, selected_choices }));
  });

  // ElevenLabs pre-generated clip audio stream when LIVE key is configured
  app.get('/api/voice/clip/:clipId', async (req, res) => {
    const clipId = req.params.clipId;
    if (!/^[a-z0-9_]+$/i.test(clipId)) {
      res.status(400).json({ error: 'Invalid clip ID' });
      return;
    }
    const audio = await orchestrator.tts.fetchLivePreGeneratedClipAudio(clipId);
    if (!audio) {
      res.status(404).json({ error: 'Audio clip unavailable in mock mode' });
      return;
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audio));
  });

  app.post('/api/demo/reset', (_req, res) => {
    res.json(orchestrator.resetDemo());
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT || '3000');
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Suraksha server listening on http://0.0.0.0:${port}`);
  });
}

// Start HTTP server only when executed directly (not when imported by unit tests)
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath.endsWith('server.ts') || invokedPath.endsWith('server.js')) {
  void startServer();
}
