import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  PhoneCall,
  ShieldCheck,
} from 'lucide-react';
import { SystemStateSnapshot } from '../server/types';

interface HomeDashboardPageProps {
  snapshot: SystemStateSnapshot;
  onStartLiveGuard: () => void;
  onNavigate: (
    page: 'live' | 'guardian' | 'architecture' | 'evidence' | 'drill' | 'integrations'
  ) => void;
}

export function HomeDashboardPage({
  snapshot,
  onStartLiveGuard,
  onNavigate,
}: HomeDashboardPageProps) {
  const allAlerts = [
    ...(snapshot.active_alert ? [snapshot.active_alert] : []),
    ...snapshot.alert_history,
  ];
  const highRiskCount = allAlerts.filter(
    (a) => a.risk_level === 'High Risk'
  ).length;
  const mockCount = snapshot.integrations.filter(
    (i) => i.health === 'MOCK'
  ).length;
  const liveCount = snapshot.integrations.filter(
    (i) => i.health === 'LIVE'
  ).length;

  return (
    <div className="space-y-6">
      {/* Hero Summary Card */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="text-xs font-medium text-slate-500">
              SURAKSHA · Live-Call Guardian &amp; Policy-Enforced Family Protection
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Protect parents during scam calls before money or OTPs are lost
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Deterministic rules monitor speaker/merged call audio in real time,
              interrupt isolation with a consented family voice (&ldquo;Kya main
              Ansh ko abhi bula loon?&rdquo;), and notify guardians only after
              explicit parent approval via Cedar-enforced MCP tools.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onStartLiveGuard}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <PhoneCall className="w-4 h-4" aria-hidden="true" />
              Start Live Guard
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('drill')}
              className="px-4 py-3 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Open Scam Drill
            </button>
          </div>
        </div>
      </section>

      {/* 4-Column Status KPI Strip */}
      <section
        aria-label="Protection status summary"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Protection Status</span>
            <ShieldCheck className="w-4 h-4 text-emerald-700" aria-hidden="true" />
          </div>
          <div className="text-lg font-bold text-slate-900">
            {snapshot.lifecycle_state === 'IDLE'
              ? 'Armed & Ready'
              : snapshot.lifecycle_state}
          </div>
          <div className="text-xs text-slate-600">
            Parent device: Speaker / Merged Call ready
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Active Monitoring</span>
            <Activity className="w-4 h-4 text-blue-700" aria-hidden="true" />
          </div>
          <div className="text-lg font-bold text-slate-900 tabular-nums">
            {snapshot.transcript.length} Transcript Lines
          </div>
          <div className="text-xs text-slate-600">
            {liveCount} LIVE · {mockCount} MOCK adapters
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Alerts &amp; High-Risk</span>
            <AlertTriangle className="w-4 h-4 text-amber-700" aria-hidden="true" />
          </div>
          <div className="text-lg font-bold text-slate-900 tabular-nums">
            {allAlerts.length} Total / {highRiskCount} High Risk
          </div>
          <div className="text-xs text-slate-600">
            Deterministic Rule Engine active
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Guardian Connection</span>
            <Bell className="w-4 h-4 text-slate-700" aria-hidden="true" />
          </div>
          <div className="text-lg font-bold text-slate-900 tabular-nums">
            {snapshot.sns_notifications.length} Dispatched
          </div>
          <div className="text-xs text-slate-600">
            Ansh (Primary Guardian) · SNS Channel
          </div>
        </div>
      </section>

      {/* Recent Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <h2 className="text-sm font-semibold text-slate-900">
              Recent Security &amp; Audit Activity
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('guardian')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer whitespace-nowrap"
            >
              Open Guardian Dashboard
            </button>
          </div>

          {snapshot.audit_events.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm text-slate-600">
                No call events recorded yet in this session.
              </p>
              <button
                type="button"
                onClick={onStartLiveGuard}
                className="px-4 py-2 text-xs font-semibold bg-blue-700 text-white rounded hover:bg-blue-800 cursor-pointer"
              >
                Launch Digital Arrest Demo
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {[...snapshot.audit_events]
                .reverse()
                .slice(0, 6)
                .map((evt) => (
                  <div
                    key={evt.event_id}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        #{evt.seq} {evt.event_type}
                      </span>
                      <span className="text-slate-500 ml-2">
                        {evt.actor} · {evt.action}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                      {evt.outcome} · {evt.storage_mode}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2.5">
            Non-Negotiable Safety Boundaries
          </h2>
          <ul className="space-y-2 text-xs text-slate-700">
            {snapshot.tier3_prohibitions.slice(0, 6).map((rule) => (
              <li
                key={rule}
                className="pb-2 border-b border-slate-100 last:border-0 last:pb-0"
              >
                {rule}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onNavigate('architecture')}
            className="w-full py-2 px-3 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 hover:bg-slate-100 rounded cursor-pointer"
          >
            Inspect Architecture &amp; Policy Harness
          </button>
        </section>
      </div>
    </div>
  );
}
