import { ArrowRight, Lock, ShieldBan } from 'lucide-react';
import {
  MCP_SERVER_CATALOG,
  McpToolCallRecord,
  PipelineNodeId,
  TIER_3_PROHIBITIONS,
} from '../adapters/types';

interface ArchitectureTracePanelProps {
  activeNode: PipelineNodeId;
  toolCalls: McpToolCallRecord[];
  tryWithoutApproval: boolean;
  lastGatewayDenial: string | null;
  canRunUnapprovedTest: boolean;
  onRunUnapprovedTest: () => void;
}

interface FlowNode {
  id: PipelineNodeId;
  title: string;
  prodMapping: string;
}

const PIPELINE_NODES: FlowNode[] = [
  {
    id: 'call_audio',
    title: 'Call Audio',
    prodMapping: 'Speaker / merged call',
  },
  {
    id: 'streaming_stt',
    title: 'Streaming STT',
    prodMapping: 'ElevenLabs Scribe v2 Realtime',
  },
  {
    id: 'detection',
    title: 'Detection',
    prodMapping: 'Rules first + Amazon Bedrock',
  },
  {
    id: 'orchestrator',
    title: 'Orchestrator',
    prodMapping: 'State & tool planner',
  },
  {
    id: 'policy_gateway',
    title: 'Policy Gateway',
    prodMapping: 'AgentCore + Cedar + Lambda',
  },
  {
    id: 'family_alert',
    title: 'Family Alert',
    prodMapping: 'Amazon SNS',
  },
  {
    id: 'audit_log',
    title: 'Audit Log',
    prodMapping: 'Append-only SHA-256',
  },
];

export function ArchitectureTracePanel({
  activeNode,
  toolCalls,
  tryWithoutApproval,
  lastGatewayDenial,
  canRunUnapprovedTest,
  onRunUnapprovedTest,
}: ArchitectureTracePanelProps) {
  const showFutureTryBanner = tryWithoutApproval && canRunUnapprovedTest;

  return (
    <section
      aria-labelledby="panel-b-heading"
      className="bg-white border border-slate-200 rounded-lg flex flex-col h-full min-w-0"
    >
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="panel-b-heading"
          className="text-sm font-semibold text-slate-900"
        >
          Panel B · Architecture Live Trace
        </h2>
        <span className="text-xs text-slate-500">
          Default-deny MCP Policy Gateway
        </span>
      </div>

      <div className="p-4 space-y-5 flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Flow Diagram */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <h3 className="text-xs font-semibold text-slate-700">
              Pipeline Flow (Active Node Highlighted)
            </h3>
            {canRunUnapprovedTest && (
              <button
                type="button"
                onClick={onRunUnapprovedTest}
                className="px-2.5 py-1 text-xs font-semibold text-red-900 bg-red-50 hover:bg-red-100 border border-red-300 rounded transition-colors whitespace-nowrap cursor-pointer"
              >
                Test unapproved call
              </button>
            )}
          </div>

          <div
            data-testid="pipeline-diagram"
            className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2"
          >
            {PIPELINE_NODES.map((node, index) => {
              const isActive = activeNode === node.id;
              const isDeniedGateway =
                node.id === 'policy_gateway' &&
                Boolean(lastGatewayDenial) &&
                isActive;
              return (
                <div
                  key={node.id}
                  data-node-id={node.id}
                  data-active={isActive ? 'true' : 'false'}
                  className={`relative p-2.5 rounded border text-left transition-colors min-w-0 ${
                    isDeniedGateway
                      ? 'bg-red-50 border-red-400 text-red-950'
                      : isActive
                        ? 'bg-blue-50 border-blue-600 text-blue-950'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                      0{index + 1}
                    </span>
                    {index < PIPELINE_NODES.length - 1 && (
                      <ArrowRight
                        className="w-3 h-3 text-slate-400 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="mt-1 text-xs font-semibold leading-snug">
                    {node.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-600 leading-snug">
                    {node.prodMapping}
                  </div>
                </div>
              );
            })}
          </div>

          {(showFutureTryBanner || lastGatewayDenial) && (
            <div
              data-testid="gateway-policy-banner"
              className={`mt-2.5 p-2.5 rounded border text-xs flex flex-wrap items-center justify-between gap-2 ${
                lastGatewayDenial
                  ? 'bg-red-50 border-red-300 text-red-900'
                  : 'bg-amber-50 border-amber-300 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="font-medium break-words">
                  {lastGatewayDenial
                    ? `Gateway Enforcement: ${lastGatewayDenial}`
                    : 'Try without approval is ON: at consent step, orchestrator will attempt Family.alert_guardians without an approval_token.'}
                </span>
              </div>
              <span className="text-[11px] font-mono shrink-0">
                Permission != Prompt
              </span>
            </div>
          )}
        </div>

        {/* MCP Servers & Tier 3 Prohibitions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-200">
          <div>
            <h3 className="text-xs font-semibold text-slate-800 mb-2">
              Four MCP Servers &amp; Tiers
            </h3>
            <div className="space-y-1.5">
              {MCP_SERVER_CATALOG.map((srv) => (
                <div
                  key={srv.name}
                  className="p-2 bg-slate-50 border border-slate-200 rounded text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {srv.name}
                    </span>
                    <span className="font-mono text-[11px] text-slate-600">
                      {srv.tier}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-slate-600 leading-relaxed">
                    {srv.tools.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
              <ShieldBan
                className="w-3.5 h-3.5 text-red-700"
                aria-hidden="true"
              />
              Tier 3 Prohibitions (Hard Blocked)
            </h3>
            <ul className="space-y-1.5">
              {TIER_3_PROHIBITIONS.map((item) => (
                <li
                  key={item}
                  className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 font-medium"
                >
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-600 leading-relaxed">
              Permission model: default-deny. Tier 1 runs automatically; Family
              tools require a short-lived signed{' '}
              <code className="font-mono">approval_token</code> bound to one{' '}
              <code className="font-mono">alert_id</code>.
            </p>
          </div>
        </div>

        {/* Scrolling MCP Tool Call Log */}
        <div className="flex-1 flex flex-col min-h-[220px] pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-xs font-semibold text-slate-800">
              MCP Tool Call Trace
            </h3>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {toolCalls.length} calls logged
            </span>
          </div>

          <div
            data-testid="mcp-tool-log"
            className="flex-1 overflow-y-auto max-h-[320px] space-y-2 pr-1"
          >
            {toolCalls.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded text-xs text-slate-500">
                No MCP tool calls yet. Start or step through the demo to observe
                policy decisions.
              </div>
            ) : (
              toolCalls.map((call) => {
                const isDeny = call.decision === 'DENY';
                return (
                  <div
                    key={call.id}
                    className={`p-2.5 rounded border text-xs ${
                      isDeny
                        ? 'bg-red-50 border-red-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-semibold text-slate-900">
                          {call.server}.{call.tool}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-[11px] text-slate-600">
                          {call.tier}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 font-mono">
                          simulated
                        </span>
                        <span
                          className={`px-1.5 py-0.5 text-[11px] font-mono font-semibold rounded border ${
                            isDeny
                              ? 'bg-red-700 text-white border-red-800'
                              : 'bg-emerald-700 text-white border-emerald-800'
                          }`}
                        >
                          {call.decision}
                        </span>
                      </div>
                    </div>

                    <p
                      className={`mt-1 text-xs ${
                        isDeny ? 'text-red-900 font-medium' : 'text-slate-700'
                      }`}
                    >
                      Reason: {call.reason}
                    </p>

                    <div className="mt-1.5 p-1.5 bg-white border border-slate-200 rounded font-mono text-[11px] text-slate-700 overflow-x-auto">
                      inputs: {JSON.stringify(call.redactedInputs)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
