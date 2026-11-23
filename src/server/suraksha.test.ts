import assert from 'node:assert/strict';
import test from 'node:test';
import { AuditStorageAdapter } from './adapters/awsOutput';
import { BedrockExplanationAdapter } from './adapters/bedrock';
import { ApprovalService, parseParentVoiceApproval } from './approvalService';
import { evaluateCedarPolicy } from './cedarPolicy';
import { inspectSuspiciousMessageOrLink } from './messageLinkChecker';
import { SurakshaOrchestrator } from './orchestrator';
import { evaluateTranscriptDeterministic } from './ruleEngine';
import {
  evaluateScamDrillSubmission,
  SCAM_DRILL_SCENARIOS,
} from './scamDrill';
import { TranscriptLine } from './types';

function makeLine(
  text: string,
  idx = 1,
  overrides?: Partial<TranscriptLine>
): TranscriptLine {
  return {
    id: `l-${idx}`,
    session_id: 's-test',
    speaker: 'Caller',
    text,
    english_subtitle: text,
    hindi_subtitle: text,
    timestamp: '2026-11-23T05:00:00.000Z',
    elapsed: '00:05',
    source: 'scribe_scripted',
    ...overrides,
  };
}

test('Detection: covers normal call, single benign keyword non-trigger, OTP, urgent payment, govt impersonation, isolation, remote-access app, and Hinglish multi-signal', () => {
  const normal = evaluateTranscriptDeterministic([
    makeLine('Namaste Mummy, main ghar aa rahi hoon, sabzi lete aau?'),
  ]);
  assert.equal(normal.should_interrupt, false);
  assert.equal(normal.detected_signals.length, 0);
  assert.equal(normal.risk_level, 'No Known Red Flags (never share OTP/PIN)');

  // Single benign mention must NOT trigger scam alert
  const singleMention = evaluateTranscriptDeterministic([
    makeLine('Police station ke paas wali dukan se mithai le aana'),
  ]);
  assert.equal(singleMention.should_interrupt, false);
  assert.equal(
    singleMention.risk_level,
    'No Known Red Flags (never share OTP/PIN)'
  );

  // Echo-suppressed system voice playback must NEVER be treated as caller speech
  const echoIgnored = evaluateTranscriptDeterministic([
    makeLine('Mummy ruko, koi agency arrest nahi karti', 1, {
      speaker: 'Suraksha',
      echo_suppressed: true,
    }),
  ]);
  assert.equal(echoIgnored.should_interrupt, false);

  const otp = evaluateTranscriptDeterministic([
    makeLine('Abhi jo 6 digit OTP aaya hai woh bataiye'),
  ]);
  assert.equal(otp.should_interrupt, true);
  assert.equal(otp.risk_level, 'High Risk');
  assert.ok(otp.detected_signals.includes('Requests for OTP or PIN'));
  assert.ok(otp.detected_categories.includes('MONEY_AND_CREDENTIALS'));

  const remoteApp = evaluateTranscriptDeterministic([
    makeLine('Aap AnyDesk app install kijiye screen share ke liye'),
  ]);
  assert.equal(remoteApp.should_interrupt, true);
  assert.ok(remoteApp.detected_categories.includes('REMOTE_ACCESS'));

  const urgentPayment = evaluateTranscriptDeterministic([
    makeLine('Emergency hai, turant UPI PIN daalkar paise transfer kijiye'),
  ]);
  assert.equal(urgentPayment.should_interrupt, true);
  assert.ok(urgentPayment.detected_categories.includes('URGENCY'));
  assert.ok(urgentPayment.detected_categories.includes('MONEY_AND_CREDENTIALS'));

  const govtMulti = evaluateTranscriptDeterministic([
    makeLine('Main CBI se bol raha hoon, parcel pakda gaya hai'),
    makeLine('Kisi ko mat batana warna arrest ho jayega', 2),
  ]);
  assert.equal(govtMulti.should_interrupt, true);
  assert.equal(govtMulti.risk_level, 'High Risk');
  assert.ok(govtMulti.detected_categories.includes('FAKE_AUTHORITY'));
  assert.ok(govtMulti.detected_categories.includes('THREATS'));
  assert.ok(govtMulti.detected_categories.includes('ISOLATION'));
});

test('Rule Engine & Bedrock: alert interruption still functions when Bedrock times out or is unavailable', async () => {
  const bedrock = new BedrockExplanationAdapter();

  const ok = await bedrock.generateExplanation({
    signals: ['Requests for OTP or PIN'],
    playbook: 'Bank KYC / OTP Extraction Playbook',
    transcript: [makeLine('Share OTP now')],
    simulationMode: 'normal',
  });
  assert.ok(ok.explanation.length > 10);
  assert.ok(ok.hindi_script.length > 10);

  const timedOut = await bedrock.generateExplanation({
    signals: ['Requests for OTP or PIN'],
    playbook: 'Bank KYC / OTP Extraction Playbook',
    transcript: [makeLine('Share OTP now')],
    simulationMode: 'timeout',
    timeoutMs: 30,
  });
  assert.equal(timedOut.source, 'BEDROCK_FALLBACK');
  assert.equal(bedrock.getHealthState('timeout'), 'CONNECTION FAILED');

  const unavailable = await bedrock.generateExplanation({
    signals: ['Impersonation of government officials'],
    playbook: 'Digital Arrest / Authority Coercion Playbook',
    transcript: [makeLine('CBI arrest')],
    simulationMode: 'unavailable',
  });
  assert.equal(unavailable.source, 'BEDROCK_FALLBACK');

  const orch = new SurakshaOrchestrator({ persistAuditPath: null });
  orch.setBedrockSimulationMode('unavailable');
  await orch.startCall({ scenario_id: 'digital-arrest' });
  await orch.stepScriptedOrIngestTranscript();
  const snap = await orch.stepScriptedOrIngestTranscript();
  assert.equal(snap.lifecycle_state, 'AWAITING_APPROVAL');
  assert.ok(snap.voice_clip);
  assert.ok(snap.voice_clip.transcript.includes('Kya main Ansh ko abhi bula loon?'));
  assert.equal(snap.active_alert?.explanation_source, 'BEDROCK_FALLBACK');
  const bedrockIntegration = snap.integrations.find((i) => i.key === 'bedrock');
  assert.equal(bedrockIntegration?.health, 'CONNECTION FAILED');
  // Other adapters continue functioning independently
  const snsIntegration = snap.integrations.find((i) => i.key === 'sns');
  assert.equal(snsIntegration?.health, 'MOCK');
});

test('Approval & Gateway: enforces explicit "haan", rejects ambiguous utterances, and blocks invalid/reused/tampered/out-of-scope tokens', async () => {
  assert.equal(parseParentVoiceApproval('haan'), 'haan');
  assert.equal(parseParentVoiceApproval('Haan bula lo'), 'haan');
  assert.equal(parseParentVoiceApproval('nahi'), 'nahi');
  assert.equal(parseParentVoiceApproval('hello wait a second'), 'ambiguous');

  const approval = new ApprovalService('test-secret-key');
  const now = new Date();
  const { internalToken } = approval.issueApprovalToken({
    alert_id: 'ALT-100',
    ttlSeconds: 60,
    now,
  });
  assert.ok(internalToken.nonce.length >= 16);

  // Valid
  const valid = approval.validateToken({
    token: internalToken,
    expectedAlertId: 'ALT-100',
    requestedAction: 'alert_guardians',
    now,
  });
  assert.equal(valid.signature_valid, true);
  assert.equal(valid.not_expired, true);
  assert.equal(valid.alert_id_match, true);
  assert.equal(valid.one_time_unused, true);
  assert.equal(valid.scope_authorized, true);

  // Missing
  const missing = approval.validateToken({
    token: null,
    expectedAlertId: 'ALT-100',
    requestedAction: 'alert_guardians',
  });
  assert.equal(missing.signature_valid, false);

  // Expired
  const expired = approval.validateToken({
    token: internalToken,
    expectedAlertId: 'ALT-100',
    requestedAction: 'alert_guardians',
    now: new Date(now.getTime() + 120_000),
  });
  assert.equal(expired.not_expired, false);

  // Invalid signature
  const invalidSig = approval.validateToken({
    token: { ...internalToken, signature: '00'.repeat(32) },
    expectedAlertId: 'ALT-100',
    requestedAction: 'alert_guardians',
    now,
  });
  assert.equal(invalidSig.signature_valid, false);

  // Wrong alert ID
  const wrongAlert = approval.validateToken({
    token: internalToken,
    expectedAlertId: 'ALT-OTHER',
    requestedAction: 'alert_guardians',
    now,
  });
  assert.equal(wrongAlert.alert_id_match, false);

  // Tampered payload
  const tampered = approval.validateToken({
    token: { ...internalToken, approver_id: 'attacker' },
    expectedAlertId: 'ALT-100',
    requestedAction: 'alert_guardians',
    now,
  });
  assert.equal(tampered.signature_valid, false);

  // Reused token
  approval.markTokenUsed(internalToken.token_id, now);
  const reused = approval.validateToken({
    token: internalToken,
    expectedAlertId: 'ALT-100',
    requestedAction: 'alert_guardians',
    now,
  });
  assert.equal(reused.one_time_unused, false);

  // Unauthorized action / Cedar default-deny & forbid-wins
  const cedarTier3 = evaluateCedarPolicy({
    principal: 'Orchestrator::suraksha-lambda',
    server: 'Family',
    action: 'reply_to_scammer',
    cognito_authorized: true,
    interceptor: {
      signature_valid: true,
      not_expired: true,
      alert_id_match: true,
      one_time_unused: true,
      scope_authorized: true,
    },
  });
  assert.equal(cedarTier3.decision, 'DENY');
  assert.equal(cedarTier3.matched_rule, 'forbid-tier3-prohibited-action');

  const cedarDefaultDeny = evaluateCedarPolicy({
    principal: 'Unknown::caller',
    server: 'Listen',
    action: 'get_transcript_window',
    cognito_authorized: true,
    interceptor: {
      signature_valid: true,
      not_expired: true,
      alert_id_match: true,
      one_time_unused: true,
      scope_authorized: true,
    },
  });
  assert.equal(cedarDefaultDeny.decision, 'DENY');
});

test('MCP, Human Handoff, Ambiguous Voice Rejection, and Audit Integrity: end-to-end orchestrator + negative policy tests + tamper detection', async () => {
  const orch = new SurakshaOrchestrator({ persistAuditPath: null });
  await orch.startCall({ scenario_id: 'remote-access' });
  await orch.stepScriptedOrIngestTranscript();
  const flagged = await orch.stepScriptedOrIngestTranscript();

  assert.equal(flagged.lifecycle_state, 'AWAITING_APPROVAL');
  assert.ok(
    flagged.gateway_traces.some(
      (t) => t.server === 'Listen' && t.cedar_decision === 'ALLOW'
    )
  );
  assert.ok(
    flagged.gateway_traces.some(
      (t) =>
        t.server === 'Scam-Intel' &&
        t.tool === 'check_url' &&
        t.cedar_decision === 'ALLOW'
    )
  );

  // Ambiguous spoken phrase must NOT trigger family approval
  const ambiguous = await orch.submitParentVoiceUtterance('maybe later');
  assert.equal(ambiguous.accepted, false);
  assert.equal(ambiguous.parsed, 'ambiguous');
  assert.equal(ambiguous.snapshot.lifecycle_state, 'AWAITING_APPROVAL');
  assert.equal(ambiguous.snapshot.sns_notifications.length, 0);

  // Test all 7 blocked Gateway scenarios
  for (const scenario of [
    'missing_token',
    'expired_token',
    'invalid_signature',
    'wrong_alert_id',
    'reused_token',
    'tampered_token',
    'unauthorized_family_action',
  ] as const) {
    const res = await orch.runPolicyTest(scenario);
    assert.equal(res.blocked, true, `Expected ${scenario} to be blocked`);
  }

  // Approve with spoken "haan"
  const voiceApproved = await orch.submitParentVoiceUtterance('haan');
  assert.equal(voiceApproved.accepted, true);
  const completed = voiceApproved.snapshot;
  assert.equal(completed.lifecycle_state, 'EVIDENCE_READY');
  assert.equal(completed.active_approval?.status, 'USED');
  assert.ok(completed.sns_notifications.length >= 1);
  assert.ok(completed.evidence_pack);
  assert.equal(
    completed.evidence_pack.manual_submission_status,
    'READY_FOR_MANUAL_SUBMISSION'
  );
  assert.equal(
    completed.evidence_pack.manual_submission_banner,
    'EVIDENCE READY – MANUAL FAMILY SUBMISSION REQUIRED'
  );
  assert.equal(completed.evidence_pack.auto_submitted, false);
  assert.deepEqual(completed.evidence_pack.manual_channels, [
    'Chakshu',
    '1930',
    'cybercrime.gov.in',
  ]);

  // Verify audit chain integrity and tamper detection
  const integrity = orch.verifyAuditChain();
  assert.equal(integrity.valid, true);
  assert.ok(integrity.checked_count >= 10);

  const tamperCheck = orch.simulateAuditTamperCheck();
  assert.equal(tamperCheck.valid, false);
  assert.equal(tamperCheck.broken_at_seq, 2);

  // Secondary check on isolated storage clone
  const storage = new AuditStorageAdapter({ persistPath: null });
  const eventsCopy = completed.audit_events.map((e) => ({ ...e }));
  eventsCopy[1].action = 'TAMPERED_ACTION';
  const tamperedCheck = storage.verifyChainIntegrity(eventsCopy);
  assert.equal(tamperedCheck.valid, false);
  assert.equal(tamperedCheck.broken_at_seq, 2);
});

test('Scam Drill & Secondary Message/Link Checker: isolated drill evaluation and non-fetching static URL inspection', () => {
  const drill = SCAM_DRILL_SCENARIOS[0];
  const summary = evaluateScamDrillSubmission({
    scenario_id: drill.id,
    selected_choices: [
      { step_index: 0, choice_id: drill.steps[0].choices[1].id },
      { step_index: 1, choice_id: drill.steps[1].choices[0].id },
    ],
  });
  assert.equal(summary.score, 100);
  assert.equal(summary.conversational_agent_isolated_from_live_guard, true);

  const linkRes = inspectSuspiciousMessageOrLink({
    message_text: 'Your KYC expired, share 6-digit OTP immediately',
    url_input: 'http://kyc-bill-verify.example/login',
  });
  assert.equal(linkRes.verdict, 'High Risk');
  assert.equal(linkRes.never_fetched_or_clicked, true);
  assert.equal(linkRes.urls_analyzed[0].verdict, 'SUSPICIOUS_DOMAIN');
});
