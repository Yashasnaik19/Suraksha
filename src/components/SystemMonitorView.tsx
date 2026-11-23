import { useState } from 'react';
import { Cpu, Lock, ShieldBan, ShieldCheck } from 'lucide-react';
import { PolicyTestScenario, SystemStateSnapshot } from '../server/types';

interface SystemMonitorViewProps {
  snapshot: SystemStateSnapshot;
  onRunPolicyTest: (scenario: PolicyTestScenario) => Promise<void>;
  onBedrockModeChange: (mode: 'normal' | 'timeout' | 'unavailable') => Promise<void>;
}

const POLICY_TESTS: Array<{ id: PolicyTestScenario; label: string }> = [
  { id: 'missing_token', label: 'Missing Token' },
  { id: 'expired_token', label: 'Expired Token' },
  { id: 'invalid_signature', label: 'Invalid Signature' },
  { id: 'wrong_alert_id', label: 'Wrong Alert ID' },
  { id: 'reused_token', label: 'Reused Token (Replay)' },
  { id: 'tampered_token', label: 'Tampered Payload' },
  { id: 'unauthorized_family_action', label: 'Unauthorized Scope' },
];

const MCP_GROUPS = [
  {
    name: 'Listen MCP',
    tier: 'Tier 1',
    tools: ['get_transcript_window'],
    auth: 'Cognito Gateway (No approval token required)',
  },
  {
    name: 'Scam-Intel MCP',
    tier: 'Tier 1',
    tools: [
      'match_scam_playbook',
      'score_signals',
      'check_url',
      'prepare_evidence_pack',
    ],
    auth: 'Cognito Gateway (No approval token required)',
  },
  {
    name: 'Family MCP',
    tier: 'Tier 2',
    tools: ['alert_guardians', 'send_family_voice_message'],
    auth: 'Mandatory signed, single-use, alert-bound approval_token + Cedar ALLOW',
  },
  {
    name: 'Audit MCP',
    tier: 'Audit',
    tools: ['append_event'],
    auth: 'Append-only (no update/delete methods)',
  },
];

export function SystemMonitorView({
  snapshot,
  onRunPolicyTest,
  onBedrockModeChange,
}: SystemMonitorViewProps) {
  const [runningTest, setRunningTest] = useState<string | null>(null);

  const handleTest = async (scenario: PolicyTestScenario) => {
    setRunningTest(scenario);
    try {
      await onRunPolicyTest(scenario);
    } finally {
      setRunningTest(null);
    }
  };

  return (
    <section
      aria-labelledby="system-monitor-heading"
      className="bg-white border border-slate-200 rounded-lg flex flex-col h-full min-w-0"
    >
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="system-monitor-heading"
          className="text-sm font-semibold text-slate-900"
        >
          System &amp; Architecture Monitor
        </h2>
        <span className="text-xs text-slate-500">
          AgentCore Gateway · Lambda Interceptor · Cedar Policy
        </span>
      </div>

      <div className="p-4 space-y-5 flex-1 overflow-y-auto">
        {/* Component Status Grid (Color language: Amber=Detection, Blue=Orchestration/Approval, Red=Policy, Green=MCP, Neutral=External) */}
        <div>
          <h3 className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
            Live Architecture Components (11 Adapters)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {snapshot.integrations.map((item) => {
              const tone =
                item.key === 'bedrock' && item.status === 'DEGRADED'
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : item.key === 'orchestrator_lambda'
                    ? 'bg-blue-50 border-blue-200 text-blue-950'
                    : item.key === 'cedar_policy' ||
                        item.key === 'lambda_interceptor' ||
                        item.key === 'agentcore_gateway'
                      ? 'bg-red-50/60 border-red-200 text-red-950'
                      : 'bg-slate-50 border-slate-200 text-slate-800';
              return (
                <div
                  key={item.key}
                  className={`p-2.5 rounded border text-xs ${tone}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{item.name}</span>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border ${
                        item.mode === 'LIVE'
                          ? 'bg-emerald-700 text-white border-emerald-800'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      {item.mode}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] opacity-85">{item.detail}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bedrock Resilience Simulator & Policy Enforcement Test Harness */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
          <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-lg space-y-2">
            <h3 className="text-xs font-semibold text-amber-950">
              Bedrock Independence Check (Rule Engine Priority)
            </h3>
            <p className="text-[11px] text-amber-900">
              Switch Bedrock to timeout or unavailable, then run a call: the
              deterministic Rule Engine and ElevenLabs interruption still trigger
              with zero delay.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(['normal', 'timeout', 'unavailable'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => void onBedrockModeChange(m)}
                  aria-pressed={snapshot.bedrock_simulation_mode === m}
                  className={`px-2.5 py-1 text-xs font-mono font-semibold rounded border cursor-pointer ${
                    snapshot.bedrock_simulation_mode === m
                      ? 'bg-amber-700 text-white border-amber-800'
                      : 'bg-white text-amber-950 border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-lg space-y-2">
            <h3 className="text-xs font-semibold text-red-950 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              Policy Enforcement Test Harness (Must DENY)
            </h3>
            <p className="text-[11px] text-red-900">
              Trigger invalid/replayed/mismatched Family MCP calls through
              AgentCore Gateway + Lambda Interceptor + Cedar Policy.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {POLICY_TESTS.map((pt) => (
                <button
                  key={pt.id}
                  type="button"
                  disabled={runningTest === pt.id}
                  onClick={() => void handleTest(pt.id)}
                  className="px-2 py-1 text-[11px] font-semibold bg-white hover:bg-red-100 text-red-900 border border-red-300 rounded cursor-pointer disabled:opacity-50"
                >
                  {pt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Four Isolated MCP Server Groups + Tier 3 Prohibitions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck
                className="w-3.5 h-3.5 text-emerald-700"
                aria-hidden="true"
              />
              Four MCP Server Groups (Behind AgentCore Gateway)
            </h3>
            <div className="space-y-2">
              {MCP_GROUPS.map((g) => (
                <div
                  key={g.name}
                  className="p-2.5 bg-emerald-50/50 border border-emerald-200 rounded text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-emerald-950">
                      {g.name}
                    </span>
                    <span className="font-mono text-[11px] text-emerald-800">
                      {g.tier}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-800">
                    {g.tools.join(', ')}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-600">
                    {g.auth}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <ShieldBan
                className="w-3.5 h-3.5 text-red-700"
                aria-hidden="true"
              />
              Global Tier 3 Prohibitions
            </h3>
            <ul className="space-y-1.5">
              {snapshot.tier3_prohibitions.map((item) => (
                <li
                  key={item}
                  className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 font-medium"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Gateway / Interceptor / Cedar Decision Trace */}
        <div className="pt-3 border-t border-slate-200 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-800">
              AgentCore Gateway &amp; Cedar Policy Trace
            </h3>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {snapshot.gateway_traces.length} executions
            </span>
          </div>

          {snapshot.gateway_traces.length === 0 ? (
            <p className="p-4 bg-slate-50 border border-slate-200 rounded text-xs text-slate-500 text-center">
              No Gateway executions yet. Start a call or run a Policy Test above.
            </p>
          ) : (
            <div
              data-testid="gateway-trace-log"
              className="space-y-2 max-h-[300px] overflow-y-auto pr-1"
            >
              {snapshot.gateway_traces.map((tr) => {
                const isDeny = tr.cedar_decision === 'DENY';
                return (
                  <div
                    key={tr.trace_id}
                    className={`p-3 rounded border text-xs ${
                      isDeny
                        ? 'bg-red-50 border-red-300'
                        : 'bg-emerald-50/50 border-emerald-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                      <span className="font-semibold text-slate-900">
                        {tr.server}.{tr.tool} ({tr.tier})
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500">
                          {tr.mode}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 text-[11px] font-semibold rounded ${
                            isDeny
                              ? 'bg-red-700 text-white'
                              : 'bg-emerald-700 text-white'
                          }`}
                        >
                          {tr.cedar_decision}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-slate-800">{tr.reason}</p>
                    <div className="mt-1.5 font-mono text-[11px] text-slate-600">
                      Rule: {tr.cedar_policy_rule} · Sig:{' '}
                      {String(tr.interceptor_checks.signature_valid)} · TTL:{' '}
                      {String(tr.interceptor_checks.not_expired)} · AlertMatch:{' '}
                      {String(tr.interceptor_checks.alert_id_match)} · Unused:{' '}
                      {String(tr.interceptor_checks.one_time_unused)} · Scope:{' '}
                      {String(tr.interceptor_checks.scope_authorized)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cedar Policy Source */}
        <details className="pt-2 border-t border-slate-200">
          <summary className="text-xs font-semibold text-slate-700 cursor-pointer">
            Inspect Cedar Policy Source (Default-Deny, Forbid-Wins)
          </summary>
          <pre className="mt-2 p-3 bg-slate-900 text-slate-100 rounded text-[11px] font-mono overflow-x-auto leading-relaxed">
            {snapshot.cedar_policy_text}
          </pre>
        </details>
      </div>
    </section>
  );
}
