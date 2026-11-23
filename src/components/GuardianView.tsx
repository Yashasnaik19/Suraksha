import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Hash,
  Shield,
  ShieldX,
} from 'lucide-react';
import { SystemStateSnapshot } from '../server/types';

interface GuardianViewProps {
  snapshot: SystemStateSnapshot;
  onOpenEvidenceTab: () => void;
}

export function GuardianView({
  snapshot,
  onOpenEvidenceTab,
}: GuardianViewProps) {
  const alert = snapshot.active_alert;

  return (
    <section
      aria-labelledby="guardian-dashboard-heading"
      className="bg-white border border-slate-200 rounded-lg flex flex-col h-full min-w-0"
    >
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="guardian-dashboard-heading"
          className="text-sm font-semibold text-slate-900"
        >
          Guardian Dashboard
        </h2>
        <span className="text-xs font-mono text-slate-500">
          {alert ? alert.alert_id : 'Protection Active'}
        </span>
      </div>

      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* Live Protection & Notification Banner */}
        {snapshot.blocked_banner && (
          <div className="p-3 bg-red-50 border border-red-300 rounded-lg flex items-start gap-2.5 text-xs text-red-950">
            <ShieldX className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <div className="font-semibold">
                Gateway / Cedar Blocked Unauthorized Operation
              </div>
              <p className="mt-0.5">{snapshot.blocked_banner}</p>
            </div>
          </div>
        )}

        {!alert ? (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Shield className="w-4 h-4 text-slate-600" aria-hidden="true" />
              Live Protection Monitoring
            </div>
            <p>
              No high-risk alert active yet. When deterministic rules detect
              scam indicators, the alert card, Bedrock explanation, Hindi script,
              SNS status, and evidence pack status update here in real time.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Active Alert Card */}
            <div
              data-testid="guardian-active-alert"
              className={`p-3.5 rounded-lg border space-y-3 ${
                alert.risk_level === 'High Risk'
                  ? 'bg-amber-50/70 border-amber-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <AlertTriangle
                    className="w-4 h-4 text-amber-700"
                    aria-hidden="true"
                  />
                  {alert.matched_playbook ?? 'Scam Alert'}
                </span>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs font-mono font-semibold bg-white border border-amber-300 rounded text-amber-950 tabular-nums">
                    Score {alert.risk_score}
                  </span>
                  <span className="px-2 py-0.5 text-xs font-semibold bg-red-700 text-white rounded">
                    {alert.risk_level}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {alert.detected_signals.map((sig) => (
                  <span
                    key={sig}
                    className="px-2 py-0.5 text-[11px] font-medium bg-white border border-amber-300 rounded text-amber-950"
                  >
                    {sig}
                  </span>
                ))}
              </div>

              {/* Bedrock Explanation + Hindi Script */}
              <div className="p-3 bg-white border border-slate-200 rounded space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    Bedrock Risk Explanation
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {alert.explanation_source}
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  {alert.explanation}
                </p>
                <div className="pt-2 border-t border-slate-100">
                  <div className="font-semibold text-slate-900 mb-1">
                    Hindi Response Script (Parent Guidance)
                  </div>
                  <p className="text-slate-800 leading-relaxed">
                    {alert.hindi_script}
                  </p>
                </div>
              </div>

              {/* Transcript Excerpt */}
              <div className="p-2.5 bg-white border border-slate-200 rounded space-y-1">
                <div className="text-[11px] font-semibold text-slate-700">
                  Transcript Excerpt
                </div>
                {alert.transcript_excerpt.map((line) => (
                  <div
                    key={line.id}
                    className="font-mono text-[11px] text-slate-700"
                  >
                    [{line.elapsed}] <strong>{line.speaker}:</strong> {line.text}
                  </div>
                ))}
              </div>

              {/* Guardian SNS Notification & Evidence Status */}
              <div className="grid grid-cols-1 gap-2 text-xs">
                <div
                  className={`p-2.5 rounded border flex flex-wrap items-center justify-between gap-2 ${
                    alert.guardian_notification_status.startsWith('DISPATCHED')
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : alert.guardian_notification_status === 'BLOCKED'
                        ? 'bg-red-50 border-red-300 text-red-900'
                        : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <BellRing className="w-3.5 h-3.5" aria-hidden="true" />
                    SNS Alert
                  </span>
                  <span className="font-mono text-[11px] break-all">
                    {alert.guardian_notification_status}
                  </span>
                </div>

                <div
                  className={`p-2.5 rounded border flex flex-wrap items-center justify-between gap-2 ${
                    alert.evidence_pack_id
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Evidence Pack
                  </span>
                  {alert.evidence_pack_id ? (
                    <button
                      type="button"
                      onClick={onOpenEvidenceTab}
                      className="font-mono text-[11px] underline font-semibold cursor-pointer break-all text-right"
                    >
                      {alert.evidence_pack_id}
                    </button>
                  ) : (
                    <span className="font-mono text-[11px]">PENDING</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Historical Alerts */}
        {snapshot.alert_history.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-800 mb-2">
              Historical Alerts ({snapshot.alert_history.length})
            </h3>
            <div className="space-y-1.5">
              {snapshot.alert_history.map((hist) => (
                <div
                  key={hist.alert_id}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-mono font-semibold text-slate-900">
                      {hist.alert_id}
                    </span>{' '}
                    <span className="text-slate-600">
                      · {hist.matched_playbook ?? hist.risk_level}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-600">
                    {hist.approval_status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Append-Only Hash-Chained Audit Trail */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
              Append-Only Audit Trail
            </h3>
            <span
              className={`text-[11px] font-mono font-semibold ${
                snapshot.audit_chain_valid
                  ? 'text-emerald-800'
                  : 'text-red-800'
              }`}
            >
              {snapshot.audit_chain_valid
                ? 'SHA-256 Chain Verified'
                : 'Chain Integrity Broken'}
            </span>
          </div>

          {snapshot.audit_events.length === 0 ? (
            <p className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-500">
              Audit trail is empty. Every call, detection, consent, denial, and
              MCP action appends a SHA-256 hash-linked entry here.
            </p>
          ) : (
            <div
              data-testid="guardian-audit-list"
              className="space-y-2 max-h-[260px] overflow-y-auto pr-1"
            >
              {[...snapshot.audit_events].reverse().map((evt) => (
                <div
                  key={evt.event_id}
                  className={`p-2.5 rounded border text-xs ${
                    evt.outcome === 'DENY'
                      ? 'bg-red-50 border-red-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-mono">
                    <span className="font-semibold text-slate-900 tabular-nums">
                      #{evt.seq} {evt.event_type}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                        evt.outcome === 'DENY'
                          ? 'bg-red-700 text-white'
                          : evt.outcome === 'ALLOW'
                            ? 'bg-emerald-700 text-white'
                            : evt.outcome === 'FALLBACK'
                              ? 'bg-amber-700 text-white'
                              : 'bg-slate-700 text-white'
                      }`}
                    >
                      {evt.outcome}
                    </span>
                  </div>
                  <div className="mt-1 text-slate-700">
                    {evt.actor} · {evt.action}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-slate-500 break-all">
                    prev: {evt.previous_hash.slice(0, 20)}... · hash:{' '}
                    {evt.event_hash.slice(0, 20)}... ({evt.storage_mode})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
