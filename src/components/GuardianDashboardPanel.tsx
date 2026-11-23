import { AlertTriangle, CheckCircle2, FileText, Hash, Shield } from 'lucide-react';
import {
  AllowedVerdict,
  ApprovalHistoryItem,
  AuditEntry,
  DetectionResult,
  DetectionSignalCategory,
  EvidencePack,
  TranscriptSegment,
} from '../adapters/types';

interface GuardianDashboardPanelProps {
  alertId: string;
  detection: DetectionResult;
  segments: TranscriptSegment[];
  approvalHistory: ApprovalHistoryItem[];
  auditEntries: AuditEntry[];
  evidencePack: EvidencePack | null;
  familyNotified: boolean;
}

const ALL_CATEGORIES: DetectionSignalCategory[] = [
  'Authority impersonation',
  'Arrest/legal threat',
  'Isolation/secrecy',
  'Urgency',
  'Money/credential ask',
];

function getVerdictStyle(verdict: AllowedVerdict) {
  if (verdict === 'High Risk') {
    return {
      container: 'bg-red-50 border-red-300 text-red-950',
      badge: 'bg-red-700 text-white border-red-800',
    };
  }
  if (verdict === 'Suspicious (Ask Family)') {
    return {
      container: 'bg-amber-50 border-amber-300 text-amber-950',
      badge: 'bg-amber-700 text-white border-amber-800',
    };
  }
  return {
    container: 'bg-slate-50 border-slate-200 text-slate-900',
    badge: 'bg-slate-700 text-white border-slate-800',
  };
}

export function GuardianDashboardPanel({
  alertId,
  detection,
  segments,
  approvalHistory,
  auditEntries,
  evidencePack,
  familyNotified,
}: GuardianDashboardPanelProps) {
  const verdictStyle = getVerdictStyle(detection.verdict);

  return (
    <section
      aria-labelledby="panel-c-heading"
      className="bg-white border border-slate-200 rounded-lg flex flex-col h-full"
    >
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
        <h2
          id="panel-c-heading"
          className="text-sm font-semibold text-slate-900"
        >
          Panel C · Guardian Dashboard
        </h2>
        <span className="text-xs font-mono text-slate-500">
          {familyNotified ? 'Ansh Notified (Simulated SNS)' : `Alert ${alertId}`}
        </span>
      </div>

      <div className="p-4 space-y-5 flex-1 overflow-y-auto">
        {/* Alert Card */}
        <div
          data-testid="guardian-alert-card"
          className={`p-3.5 rounded-lg border ${verdictStyle.container}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold inline-flex items-center gap-1.5">
              {detection.verdict === 'High Risk' ? (
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Shield className="w-4 h-4" aria-hidden="true" />
              )}
              Guardian Alert Verdict
            </span>
            <span
              data-testid="alert-verdict"
              className={`px-2 py-0.5 text-xs font-semibold rounded border ${verdictStyle.badge}`}
            >
              {detection.verdict}
            </span>
          </div>

          <p className="mt-2 text-xs leading-relaxed">
            {detection.llmExplanation}
          </p>

          <div className="mt-3 pt-2.5 border-t border-slate-200/70">
            <div className="text-[11px] font-semibold mb-1.5">
              Signal Categories (Fires when 2+ co-occur):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CATEGORIES.map((category) => {
                const active = detection.signals.includes(category);
                return (
                  <span
                    key={category}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded border ${
                      active
                        ? 'bg-red-700 text-white border-red-800'
                        : 'bg-white text-slate-500 border-slate-200'
                    }`}
                  >
                    {category}
                  </span>
                );
              })}
            </div>
          </div>

          {segments.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-slate-200/70">
              <div className="text-[11px] font-semibold mb-1">
                Transcript Excerpt:
              </div>
              <div className="space-y-1 text-xs">
                {segments.slice(0, 2).map((seg) => (
                  <div key={seg.id} className="font-mono text-[11px]">
                    <span className="text-slate-500">[{seg.timestamp}]</span>{' '}
                    <span className="font-semibold">{seg.speaker}:</span>{' '}
                    {seg.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Approval History */}
        <div>
          <h3 className="text-xs font-semibold text-slate-800 mb-2">
            Approval History
          </h3>
          {approvalHistory.length === 0 ? (
            <p className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-500">
              No consent decisions recorded yet. Family alerts remain blocked
              until parent taps Haan.
            </p>
          ) : (
            <div className="space-y-2" data-testid="approval-history">
              {approvalHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {item.outcome === 'APPROVED' && (
                        <span className="inline-flex items-center gap-1 text-emerald-800">
                          <CheckCircle2
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
                          APPROVED ({item.parentResponse})
                        </span>
                      )}
                      {item.outcome === 'DENIED' && (
                        <span className="text-slate-800">
                          DENIED ({item.parentResponse})
                        </span>
                      )}
                      {item.outcome === 'GATEWAY_DENIED' && (
                        <span className="text-red-800">
                          GATEWAY_DENIED ({item.parentResponse})
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {item.timestamp}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-700">{item.note}</p>
                  {item.tokenId && (
                    <p className="mt-1 font-mono text-[11px] text-slate-600">
                      approval_token: {item.tokenId} · alert_id: {item.alertId}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Append-Only Audit List */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
              Append-Only Audit Log
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              SHA-256 · computed locally
            </span>
          </div>

          {auditEntries.length === 0 ? (
            <p className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-500">
              Audit chain empty. Each event computes a local SHA-256 hash linked
              to the previous entry.
            </p>
          ) : (
            <div
              data-testid="audit-log-list"
              className="space-y-2 max-h-[220px] overflow-y-auto pr-1"
            >
              {auditEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      #{entry.seq} {entry.eventType}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {entry.timestamp} · computed locally
                    </span>
                  </div>
                  <p className="mt-1 text-slate-700">{entry.summary}</p>
                  <div className="mt-1.5 font-mono text-[10px] text-slate-600 space-y-0.5 break-all">
                    <div>prev_hash: {entry.prevHash}</div>
                    <div>entry_hash: {entry.hash}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Evidence-Pack Preview */}
        <div>
          <h3 className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
            <FileText
              className="w-3.5 h-3.5 text-slate-600"
              aria-hidden="true"
            />
            Evidence-Pack Preview
          </h3>
          {!evidencePack ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 space-y-1">
              <p>
                Evidence pack is drafted after parent consent ("Haan") and
                family alert dispatch.
              </p>
              <p className="font-semibold text-slate-800">
                Family submits via Chakshu / cybercrime.gov.in / 1930. Suraksha
                does not submit.
              </p>
            </div>
          ) : (
            <div
              data-testid="evidence-pack-preview"
              className="p-3.5 bg-slate-50 border border-slate-300 rounded-lg text-xs space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  {evidencePack.category}
                </span>
                <span className="font-mono text-[11px] text-slate-600">
                  {evidencePack.alertId} · {evidencePack.generatedAt}
                </span>
              </div>
              <div className="text-slate-700 space-y-1">
                <div>
                  <span className="font-medium">Caller Placeholder:</span>{' '}
                  <code className="font-mono">
                    {evidencePack.callerNumberPlaceholder}
                  </code>
                </div>
                <div>
                  <span className="font-medium">Verdict:</span>{' '}
                  {evidencePack.verdict}
                </div>
              </div>
              <div className="p-2 bg-white border border-slate-200 rounded space-y-1 font-mono text-[11px]">
                {evidencePack.transcriptExcerpt.map((line, i) => (
                  <div key={i}>
                    [{line.timestamp}] {line.speaker}: {line.text}
                  </div>
                ))}
              </div>
              <p className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-950 font-semibold">
                {evidencePack.submissionNote}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
