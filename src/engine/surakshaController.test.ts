import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserAuditLog, GENESIS_HASH } from '../adapters/AuditLog';
import { MockDetectionEngine } from '../adapters/DetectionEngine';
import { MockToolGateway, redactInputs } from '../adapters/ToolGateway';
import { MockTranscriptSource } from '../adapters/TranscriptSource';
import { SurakshaController } from './surakshaController';

test('DetectionEngine fires only when 2+ signal categories co-occur in rolling window', () => {
  const source = new MockTranscriptSource();
  const engine = new MockDetectionEngine();

  const window1 = source.getWindow(0);
  const res1 = engine.evaluateWindow(window1);
  assert.equal(res1.signals.length, 1);
  assert.equal(res1.signals[0], 'Authority impersonation');
  assert.equal(res1.shouldInterrupt, false);
  assert.equal(res1.verdict, 'Suspicious (Ask Family)');

  const window2 = source.getWindow(1);
  const res2 = engine.evaluateWindow(window2);
  assert.equal(res2.signals.length, 3);
  assert.ok(res2.signals.includes('Authority impersonation'));
  assert.ok(res2.signals.includes('Isolation/secrecy'));
  assert.ok(res2.signals.includes('Arrest/legal threat'));
  assert.equal(res2.shouldInterrupt, true);
  assert.equal(res2.verdict, 'High Risk');
});

test('ToolGateway enforces default-deny on Family tools and redacts PII inputs', () => {
  const gateway = new MockToolGateway();

  // Tier 1 runs automatically
  const tier1 = gateway.invokeTool({
    server: 'Listen',
    tool: 'get_transcript_window',
    alert_id: 'ALT-1',
    inputs: { caller_number: '+91-99999-00000', window_size: 1 },
  });
  assert.equal(tier1.record.decision, 'ALLOW');
  assert.equal(tier1.record.redactedInputs.caller_number, '[REDACTED]');

  // Family without token -> DENY
  const deniedMissing = gateway.invokeTool({
    server: 'Family',
    tool: 'alert_guardians',
    alert_id: 'ALT-1',
    approval_token: null,
    inputs: { guardian: 'Ansh' },
  });
  assert.equal(deniedMissing.record.decision, 'DENY');
  assert.match(deniedMissing.record.reason, /missing approval_token/);

  // Family with token bound to wrong alert_id -> DENY
  const tokenForOther = gateway.issueApprovalToken('ALT-OTHER');
  const deniedMismatch = gateway.invokeTool({
    server: 'Family',
    tool: 'alert_guardians',
    alert_id: 'ALT-1',
    approval_token: tokenForOther,
    inputs: { guardian: 'Ansh' },
  });
  assert.equal(deniedMismatch.record.decision, 'DENY');
  assert.match(deniedMismatch.record.reason, /alert_id mismatch/);

  // Family with valid bound token -> ALLOW
  const validToken = gateway.issueApprovalToken('ALT-1');
  const allowed = gateway.invokeTool({
    server: 'Family',
    tool: 'alert_guardians',
    alert_id: 'ALT-1',
    approval_token: validToken,
    inputs: { guardian: 'Ansh' },
  });
  assert.equal(allowed.record.decision, 'ALLOW');

  const redacted = redactInputs({ transcript_raw: 'secret', ok: 1 });
  assert.equal(redacted.transcript_raw, '[REDACTED]');
  assert.equal(redacted.ok, 1);
});

test('AuditLog maintains a valid local SHA-256 hash chain', async () => {
  const audit = new BrowserAuditLog();
  const e1 = await audit.append({
    eventType: 'E1',
    actor: 'System',
    summary: 'First event',
    timestamp: '10:00:00',
  });
  const e2 = await audit.append({
    eventType: 'E2',
    actor: 'System',
    summary: 'Second event',
    timestamp: '10:00:05',
  });

  assert.equal(e1.prevHash, GENESIS_HASH);
  assert.equal(e1.hash.length, 64);
  assert.equal(e1.computedLocally, true);
  assert.equal(e2.prevHash, e1.hash);
  assert.equal(e2.hash.length, 64);
  assert.notEqual(e2.hash, e1.hash);
});

test('SurakshaController executes full happy-path state machine and reset', async () => {
  const controller = new SurakshaController();
  assert.equal(controller.getSnapshot().state, 'IDLE');

  let snap = await controller.stepForward();
  assert.equal(snap.state, 'LISTENING');
  assert.equal(snap.segments.length, 1);

  snap = await controller.stepForward();
  assert.equal(snap.state, 'SIGNAL_DETECTED');
  assert.equal(snap.detection.verdict, 'High Risk');

  snap = await controller.stepForward();
  assert.equal(snap.state, 'INTERRUPTING');
  assert.equal(snap.segments.length, 3);

  snap = await controller.stepForward();
  assert.equal(snap.state, 'AWAITING_APPROVAL');
  assert.equal(snap.segments.length, 4);

  snap = await controller.approveByParent();
  assert.equal(snap.state, 'APPROVED');
  assert.ok(snap.activeToken);

  snap = await controller.stepForward();
  assert.equal(snap.state, 'FAMILY_ALERTED');
  assert.equal(snap.familyNotified, true);

  snap = await controller.stepForward();
  assert.equal(snap.state, 'EVIDENCE_READY');
  assert.ok(snap.evidencePack);
  assert.equal(
    snap.evidencePack.submissionNote,
    'Family submits via Chakshu / cybercrime.gov.in / 1930. Suraksha does not submit.'
  );

  snap = controller.reset();
  assert.equal(snap.state, 'IDLE');
  assert.equal(snap.segments.length, 0);
  assert.equal(snap.auditEntries.length, 0);
});

test('SurakshaController supports Try without approval denial and parent Nahi refusal', async () => {
  const controller = new SurakshaController();
  controller.setTryWithoutApproval(true);

  await controller.stepForward(); // LISTENING
  await controller.stepForward(); // SIGNAL_DETECTED
  await controller.stepForward(); // INTERRUPTING
  const snap = await controller.stepForward(); // AWAITING_APPROVAL + unapproved attempt

  assert.equal(snap.state, 'AWAITING_APPROVAL');
  assert.equal(snap.familyNotified, false);
  assert.ok(snap.lastGatewayDenial?.includes('DENY'));
  assert.ok(snap.toolCalls.some((t) => t.server === 'Family' && t.decision === 'DENY'));
  assert.ok(snap.auditEntries.some((a) => a.eventType === 'POLICY_GATEWAY_DENIED'));

  const deniedSnap = await controller.denyByParent();
  assert.equal(deniedSnap.state, 'DENIED');
  assert.equal(deniedSnap.familyNotified, false);
  assert.ok(deniedSnap.auditEntries.some((a) => a.eventType === 'PARENT_CONSENT_DECLINED'));
});
