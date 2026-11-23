import { useState } from 'react';
import { RefreshCw, Server, ShieldAlert } from 'lucide-react';
import { IntegrationHealthState, SystemStateSnapshot } from '../server/types';

interface IntegrationStatusPageProps {
  snapshot: SystemStateSnapshot;
  onRunHealthChecks: () => Promise<{ checked_at: string }>;
  onBedrockModeChange: (
    mode: 'normal' | 'timeout' | 'unavailable'
  ) => Promise<void>;
}

function healthTone(health: IntegrationHealthState): string {
  if (health === 'LIVE') {
    return 'bg-emerald-50 text-emerald-900 border-emerald-300';
  }
  if (health === 'CONNECTION FAILED') {
    return 'bg-red-50 text-red-900 border-red-300';
  }
  if (health === 'PENDING CONFIGURATION') {
    return 'bg-amber-50 text-amber-950 border-amber-300';
  }
  return 'bg-slate-100 text-slate-800 border-slate-300';
}

export function IntegrationStatusPage({
  snapshot,
  onRunHealthChecks,
  onBedrockModeChange,
}: IntegrationStatusPageProps) {
  const [checking, setChecking] = useState(false);
  const [lastCheckMsg, setLastCheckMsg] = useState<string | null>(null);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const res = await onRunHealthChecks();
      setLastCheckMsg(`Health checks evaluated at ${res.checked_at}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-slate-700" aria-hidden="true" />
              Integration Status &amp; Env-Driven Adapter Configuration
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Each integration reports its real server-calculated status: MOCK,
              LIVE, PENDING CONFIGURATION, or CONNECTION FAILED. Missing API keys
              never block the Rule Engine or Approval Service.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCheck()}
            disabled={checking}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Run Health Checks
          </button>
        </div>

        {lastCheckMsg && (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-700">
            {lastCheckMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-3 font-semibold">Service / Adapter</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold">Required Env Vars</th>
                <th className="py-2.5 pl-3 font-semibold">Operational Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snapshot.integrations.map((item) => (
                <tr key={item.key} className="hover:bg-slate-50/70">
                  <td className="py-3 pr-3 font-semibold text-slate-900 whitespace-nowrap">
                    {item.name}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span
                      className={`inline-block px-2 py-0.5 text-[11px] font-mono font-semibold border rounded ${healthTone(
                        item.health
                      )}`}
                    >
                      {item.health}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                    {item.required_env.length === 0
                      ? 'None (Local static rules)'
                      : item.required_env.map((v) => (
                          <span
                            key={v}
                            className={`inline-block mr-1.5 ${
                              item.missing_env.includes(v)
                                ? 'text-slate-500'
                                : 'text-emerald-800 font-semibold'
                            }`}
                          >
                            {v}
                          </span>
                        ))}
                  </td>
                  <td className="py-3 pl-3 text-slate-700">{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bedrock Resilience Simulator */}
      <section className="bg-amber-50/60 border border-amber-200 rounded-lg p-4 space-y-2.5">
        <h2 className="text-sm font-semibold text-amber-950 flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-amber-800" aria-hidden="true" />
          Bedrock Fault-Injection &amp; Graceful Degradation Test
        </h2>
        <p className="text-xs text-amber-900">
          Simulate Amazon Bedrock timing out or failing. Observe Bedrock switch to{' '}
          <span className="font-mono font-semibold">CONNECTION FAILED</span> while
          the deterministic Rule Engine and family voice interruption continue
          firing immediately.
        </p>
        <div className="flex flex-wrap gap-2">
          {(['normal', 'timeout', 'unavailable'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => void onBedrockModeChange(m)}
              aria-pressed={snapshot.bedrock_simulation_mode === m}
              className={`px-3 py-1.5 text-xs font-mono font-semibold rounded border cursor-pointer whitespace-nowrap ${
                snapshot.bedrock_simulation_mode === m
                  ? 'bg-amber-700 text-white border-amber-800'
                  : 'bg-white text-amber-950 border-amber-300 hover:bg-amber-100'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
