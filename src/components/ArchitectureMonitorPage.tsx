import { useState } from 'react';
import {
  ArrowRight,
  Cpu,
  Lock,
  ShieldBan,
  ShieldCheck,
} from 'lucide-react';
import {
  IntegrationStatus,
  PolicyTestScenario,
  SystemStateSnapshot,
} from '../server/types';

interface ArchitectureMonitorPageProps {
  snapshot: SystemStateSnapshot;
  onRunPolicyTest: (scenario: PolicyTestScenario) => Promise<void>;
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

type NodeCategory =
  | 'external'
  | 'detection'
  | 'orchestration'
  | 'policy'
  | 'mcp'
  | 'output'
  | 'handoff';

function categoryClasses(cat: NodeCategory): string {
  switch (cat) {
    case 'detection':
      return 'bg-amber-50 border-amber-300 text-amber-950';
    case 'orchestration':
      return 'bg-blue-50 border-blue-300 text-blue-950';
    case 'policy':
      return 'bg-red-50 border-red-300 text-red-950';
    case 'mcp':
      return 'bg-emerald-50 border-emerald-300 text-emerald-950';
    case 'output':
      return 'bg-slate-50 border-slate-300 text-slate-900';
    case 'handoff':
      return 'bg-orange-50/70 border-2 border-dashed border-orange-400 text-orange-950';
    case 'external':
    default:
      return 'bg-zinc-100 border-zinc-300 text-zinc-900';
  }
}

export function ArchitectureMonitorPage({
  snapshot,
  onRunPolicyTest,
}: ArchitectureMonitorPageProps) {
  const [runningTest, setRunningTest] = useState<string | null>(null);

  const handleTest = async (scenario: PolicyTestScenario) => {
    setRunningTest(scenario);
    try {
      await onRunPolicyTest(scenario);
    } finally {
      setRunningTest(null);
    }
  };

  const statusByKey = new Map<string, IntegrationStatus>(
    snapshot.integrations.map((i) => [i.key, i])
  );

  const flowNodes: Array<{
    name: string;
    role: string;
    category: NodeCategory;
    integrationKey?: IntegrationStatus['key'];
  }> = [
    {
      name: 'ElevenLabs Scribe v2',
      role: 'Real-time STT (WebSocket)',
      category: 'external',
      integrationKey: 'elevenlabs_scribe',
    },
    {
      name: 'ElevenLabs TTS',
      role: 'Pre-generated family voice',
      category: 'external',
      integrationKey: 'elevenlabs_tts',
    },
    {
      name: 'Rule Engine',
      role: 'Deterministic primary trigger',
      category: 'detection',
    },
    {
      name: 'Amazon Bedrock',
      role: 'Explanation + Hindi script only',
      category: 'detection',
      integrationKey: 'bedrock',
    },
    {
      name: 'Orchestrator Lambda',
      role: 'Event lifecycle coordinator',
      category: 'orchestration',
      integrationKey: 'orchestrator_lambda',
    },
    {
      name: 'Approval Service',
      role: 'HMAC single-use alert token',
      category: 'orchestration',
    },
    {
      name: 'AgentCore Gateway',
      role: 'Single MCP gateway',
      category: 'policy',
      integrationKey: 'agentcore_gateway',
    },
    {
      name: 'Cognito OAuth',
      role: 'Gateway caller auth',
      category: 'policy',
      integrationKey: 'cognito',
    },
    {
      name: 'Lambda Interceptor',
      role: 'Sig, TTL, alert_id, nonce, scope',
      category: 'policy',
      integrationKey: 'lambda_interceptor',
    },
    {
      name: 'Cedar Policy',
      role: 'Default-deny & forbid-wins',
      category: 'policy',
      integrationKey: 'cedar_policy',
    },
    {
      name: 'Listen MCP',
      role: 'Tier 1 · get_transcript_window',
      category: 'mcp',
    },
    {
      name: 'Scam-Intel MCP',
      role: 'Tier 1 · playbook/score/url/pack',
      category: 'mcp',
    },
    {
      name: 'Family MCP',
      role: 'Tier 2 · token-gated alerts',
      category: 'mcp',
    },
    {
      name: 'Audit MCP',
      role: 'Append-only event log',
      category: 'mcp',
    },
    {
      name: 'Amazon SNS',
      role: 'Guardian alert dispatch',
      category: 'output',
      integrationKey: 'sns',
    },
    {
      name: 'DynamoDB',
      role: 'Audit event metadata',
      category: 'output',
      integrationKey: 'dynamodb',
    },
    {
      name: 'S3 Object Lock',
      role: 'WORM audit snapshots',
      category: 'output',
      integrationKey: 's3_object_lock',
    },
    {
      name: 'Evidence Pack',
      role: 'Manual Chakshu / 1930 handoff',
      category: 'handoff',
    },
    {
      name: 'Guardian Dashboard',
      role: 'Family verification view',
      category: 'handoff',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Architecture Diagram */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-slate-700" aria-hidden="true" />
              SURAKSHA Architecture &amp; Policy Monitor (19 Components)
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Color legend: Amber = Detection · Blue = Orchestration &amp;
              Approval · Red = Policy Enforcement · Green = MCP Servers · Grey =
              External Services · Neutral = AWS Outputs · Dashed Orange = Human
              Handoff
            </p>
          </div>
          <span className="font-mono text-xs text-slate-700">
            Active State: {snapshot.lifecycle_state}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
          {flowNodes.map((node, index) => {
            const integration = node.integrationKey
              ? statusByKey.get(node.integrationKey)
              : undefined;
            return (
              <div
                key={node.name}
                className={`p-3 rounded-lg border text-xs flex flex-col justify-between gap-1.5 ${categoryClasses(
                  node.category
                )}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold leading-snug">
                    {index + 1}. {node.name}
                  </span>
                  {index < flowNodes.length - 1 && (
                    <ArrowRight
                      className="w-3.5 h-3.5 opacity-50 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="text-[11px] opacity-90">{node.role}</div>
                <div className="text-[10px] font-mono pt-1 border-t border-black/10">
                  {integration ? integration.health : 'ACTIVE LOCAL ENGINE'}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Policy Enforcement Test Harness + Tier 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-red-50/70 border border-red-200 rounded-lg p-4 space-y-2.5">
          <h2 className="text-sm font-semibold text-red-950 flex items-center gap-1.5">
            <Lock className="w-4 h-4" aria-hidden="true" />
            Policy Enforcement Test Harness (Must DENY)
          </h2>
          <p className="text-xs text-red-900">
            Execute invalid, expired, replayed, tampered, or out-of-scope Family
            MCP requests through AgentCore Gateway + Lambda Interceptor + Cedar
            Policy. Blocked actions never invoke Family MCP and write DENY to
            the audit chain.
          </p>
          <div className="flex flex-wrap gap-2">
            {POLICY_TESTS.map((pt) => (
              <button
                key={pt.id}
                type="button"
                disabled={runningTest === pt.id}
                onClick={() => void handleTest(pt.id)}
                className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-red-100 text-red-900 border border-red-300 rounded cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {pt.label}
              </button>
            ))}
          </div>
          {snapshot.blocked_banner && (
            <div className="p-2.5 bg-white border border-red-300 rounded text-xs text-red-950 font-medium">
              {snapshot.blocked_banner}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <ShieldBan className="w-4 h-4 text-red-700" aria-hidden="true" />
            Global Tier 3 Prohibitions (Hard Cedar Forbid)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {snapshot.tier3_prohibitions.map((item) => (
              <div
                key={item}
                className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800"
              >
                {item}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 4 MCP Server Tool Schemas */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700" aria-hidden="true" />
            Four Isolated MCP Server Groups &amp; Formal Tool Schemas
          </h2>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {snapshot.mcp_catalog.length} MCP tools behind AgentCore Gateway
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {snapshot.mcp_catalog.map((tool) => (
            <div
              key={`${tool.server}-${tool.tool}`}
              className="p-3 bg-emerald-50/40 border border-emerald-200 rounded text-xs space-y-1"
            >
              <div className="flex items-center justify-between gap-2 font-mono">
                <span className="font-bold text-emerald-950">
                  {tool.server} · {tool.tool}
                </span>
                <span className="text-[11px] text-emerald-800">
                  {tool.tier}
                </span>
              </div>
              <p className="text-slate-700">{tool.description}</p>
              <div className="text-[11px] font-mono text-slate-600">
                Token required: {String(tool.requires_approval_token)} ·
                Required fields:{' '}
                {Array.isArray(tool.input_schema.required)
                  ? (tool.input_schema.required as string[]).join(', ')
                  : 'none'}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Gateway / Cedar Execution Trace */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <h2 className="text-sm font-semibold text-slate-900">
            AgentCore Gateway &amp; Cedar Decision Trace
          </h2>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {snapshot.gateway_traces.length} executions
          </span>
        </div>

        {snapshot.gateway_traces.length === 0 ? (
          <p className="p-4 bg-slate-50 border border-slate-200 rounded text-xs text-slate-500 text-center">
            No Gateway executions yet. Start a call in Live Guard or click any
            Policy Test button above.
          </p>
        ) : (
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {snapshot.gateway_traces.map((tr) => {
              const isDeny = tr.cedar_decision === 'DENY';
              return (
                <div
                  key={tr.trace_id}
                  className={`p-3 rounded border text-xs ${
                    isDeny
                      ? 'bg-red-50 border-red-300'
                      : 'bg-emerald-50/40 border-emerald-200'
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
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
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
                  <div className="mt-1 font-mono text-[11px] text-slate-600">
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

        <details className="pt-2 border-t border-slate-200">
          <summary className="text-xs font-semibold text-slate-700 cursor-pointer">
            Inspect /policies/suraksha.cedar (Default-Deny, Forbid-Wins)
          </summary>
          <pre className="mt-2 p-3 bg-slate-900 text-slate-100 rounded text-[11px] font-mono overflow-x-auto leading-relaxed">
            {snapshot.cedar_policy_text}
          </pre>
        </details>
      </section>
    </div>
  );
}
