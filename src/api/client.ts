import {
  IntegrationStatus,
  MessageLinkCheckResult,
  PolicyTestScenario,
  ScenarioDefinition,
  SystemStateSnapshot,
} from '../server/types';
import type {
  DrillEvaluationSummary,
  DrillScenario,
} from '../server/scamDrill';

export async function fetchInitialState(): Promise<SystemStateSnapshot> {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error('Failed to load system state');
  return res.json();
}

export async function fetchScenarios(): Promise<ScenarioDefinition[]> {
  const res = await fetch('/api/scenarios');
  if (!res.ok) throw new Error('Failed to load scenarios');
  const data = (await res.json()) as { scenarios: ScenarioDefinition[] };
  return data.scenarios;
}

export async function startCallApi(params: {
  scenario_id?: string;
  input_mode?: 'scripted' | 'microphone';
}): Promise<SystemStateSnapshot> {
  const res = await fetch('/api/call/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to start call');
  return res.json();
}

export async function stepCallApi(params?: {
  custom_text?: string;
  speaker?: 'Caller' | 'Parent';
}): Promise<SystemStateSnapshot> {
  const res = await fetch('/api/call/step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params ?? {}),
  });
  if (!res.ok) throw new Error('Failed to advance call step');
  return res.json();
}

export async function submitApprovalApi(
  decision: 'haan' | 'nahi'
): Promise<SystemStateSnapshot> {
  const res = await fetch('/api/approval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
  if (!res.ok) throw new Error('Failed to submit approval');
  return res.json();
}

export async function submitVoiceApprovalApi(utterance: string): Promise<{
  accepted: boolean;
  parsed: 'haan' | 'nahi' | 'ambiguous';
  message: string;
  snapshot: SystemStateSnapshot;
}> {
  const res = await fetch('/api/approval/voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ utterance }),
  });
  return res.json();
}

export async function setBedrockModeApi(
  mode: 'normal' | 'timeout' | 'unavailable'
): Promise<SystemStateSnapshot> {
  const res = await fetch('/api/bedrock/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error('Failed to update Bedrock simulation mode');
  return res.json();
}

export async function runPolicyTestApi(
  scenario: PolicyTestScenario
): Promise<{ blocked: boolean; reason: string; snapshot: SystemStateSnapshot }> {
  const res = await fetch('/api/policy-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario }),
  });
  if (!res.ok) throw new Error('Failed to run policy test');
  return res.json();
}

export async function verifyAuditChainApi(): Promise<{
  valid: boolean;
  checked_count: number;
  broken_at_seq: number | null;
  reason?: string;
}> {
  const res = await fetch('/api/audit/verify');
  if (!res.ok) throw new Error('Failed to verify audit chain');
  return res.json();
}

export async function simulateAuditTamperCheckApi(): Promise<{
  valid: boolean;
  checked_count: number;
  broken_at_seq: number | null;
  reason?: string;
}> {
  const res = await fetch('/api/audit/tamper-check', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to simulate audit tamper check');
  return res.json();
}

export async function runIntegrationHealthChecksApi(): Promise<{
  checked_at: string;
  integrations: IntegrationStatus[];
}> {
  const res = await fetch('/api/integrations/health', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to run health checks');
  return res.json();
}

export async function checkMessageOrLinkApi(params: {
  message_text?: string;
  url_input?: string;
}): Promise<MessageLinkCheckResult> {
  const res = await fetch('/api/tools/check-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to inspect message or URL');
  return res.json();
}

export async function fetchDrillScenariosApi(): Promise<{
  isolated_from_live_guard: boolean;
  scenarios: DrillScenario[];
}> {
  const res = await fetch('/api/drill/scenarios');
  if (!res.ok) throw new Error('Failed to load drill scenarios');
  return res.json();
}

export async function evaluateDrillApi(params: {
  scenario_id: string;
  selected_choices: Array<{ step_index: number; choice_id: string }>;
}): Promise<DrillEvaluationSummary> {
  const res = await fetch('/api/drill/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to evaluate scam drill');
  return res.json();
}

export async function resetDemoApi(): Promise<SystemStateSnapshot> {
  const res = await fetch('/api/demo/reset', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reset demo');
  return res.json();
}
