import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Globe,
  Printer,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  checkMessageOrLinkApi,
  simulateAuditTamperCheckApi,
  verifyAuditChainApi,
} from '../api/client';
import { MessageLinkCheckResult, SystemStateSnapshot } from '../server/types';

interface EvidencePackViewProps {
  snapshot: SystemStateSnapshot;
}

export function EvidencePackView({ snapshot }: EvidencePackViewProps) {
  const pack = snapshot.evidence_pack;
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    checked_count: number;
    broken_at_seq?: number | null;
    reason?: string;
    isTamperTest?: boolean;
  } | null>(null);

  const [msgInput, setMsgInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [checkResult, setCheckResult] = useState<MessageLinkCheckResult | null>(
    null
  );
  const [checkingMsg, setCheckingMsg] = useState(false);

  const handleVerifyIntegrity = async () => {
    const res = await verifyAuditChainApi();
    setVerifyResult({ ...res, isTamperTest: false });
  };

  const handleSimulateTamper = async () => {
    const res = await simulateAuditTamperCheckApi();
    setVerifyResult({ ...res, isTamperTest: true });
  };

  const handleDownloadJson = () => {
    if (!pack) return;
    const blob = new Blob([JSON.stringify(pack, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pack.evidence_pack_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadReadableReport = () => {
    if (!pack) return;
    const lines = [
      'SURAKSHA — FAMILY SCAM-CALL EVIDENCE REPORT',
      '===========================================',
      `Status: ${pack.manual_submission_banner}`,
      `Evidence Pack ID: ${pack.evidence_pack_id}`,
      `Alert ID: ${pack.alert_id}`,
      `Risk Verdict: ${pack.risk_verdict}`,
      `Matched Playbook: ${pack.matched_playbook ?? 'N/A'}`,
      `Call Started: ${pack.call_timestamps.started_at}`,
      `Alert Flagged: ${pack.call_timestamps.flagged_at}`,
      `Generated At: ${pack.call_timestamps.generated_at}`,
      `SHA-256 Integrity Hash: ${pack.integrity_hash}`,
      `Auto-Submitted: ${String(pack.auto_submitted)}`,
      '',
      'DETECTED INDICATORS:',
      ...pack.scam_indicators.map((s) => `  - ${s}`),
      '',
      'EXPLANATION:',
      `  ${pack.explanation}`,
      '',
      'TRANSCRIPT WINDOW:',
      ...pack.transcript_window.map(
        (l) => `  [${l.elapsed}] ${l.speaker}: ${l.text}`
      ),
      '',
      'URL CHECK RESULTS (NEVER CLICKED OR FETCHED):',
      ...(pack.URL_check_results.length > 0
        ? pack.URL_check_results.map(
            (u) => `  - ${u.url} => ${u.verdict} (${u.reason})`
          )
        : ['  None detected']),
      '',
      'EVENT TIMELINE:',
      ...pack.event_timeline.map(
        (t) => `  #${t.seq} [${t.timestamp}] ${t.event_type} (${t.actor}) -> ${t.outcome}`
      ),
      '',
      'MANUAL REPORTING CHANNELS (HUMAN HANDOFF ONLY):',
      '  - Chakshu (Sanchar Saathi): https://sancharsaathi.gov.in/sfc/',
      '  - National Cyber Crime Helpline: 1930',
      '  - National Cyber Crime Portal: https://cybercrime.gov.in',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pack.evidence_pack_id}-report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleInspectMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgInput.trim() && !urlInput.trim()) return;
    setCheckingMsg(true);
    try {
      const res = await checkMessageOrLinkApi({
        message_text: msgInput,
        url_input: urlInput,
      });
      setCheckResult(res);
    } finally {
      setCheckingMsg(false);
    }
  };

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="evidence-pack-heading"
        className="bg-white border border-slate-200 rounded-lg flex flex-col min-w-0"
      >
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <h2
            id="evidence-pack-heading"
            className="text-sm font-semibold text-slate-900"
          >
            Evidence Center · Manual Family Handoff
          </h2>
          <span className="text-xs font-mono text-slate-600">
            {pack
              ? pack.manual_submission_banner
              : 'Awaiting Parent Approval'}
          </span>
        </div>

        <div className="p-4 space-y-4">
          {!pack ? (
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-800">
                <FileText className="w-4 h-4" aria-hidden="true" />
                No Evidence Pack Generated Yet
              </div>
              <p>
                Once a scam call is flagged in Live Guard, the parent taps{' '}
                <strong>Haan</strong>, and AgentCore Gateway authorizes Family
                MCP, Scam-Intel MCP prepares a structured, SHA-256 hashed
                Evidence Pack here.
              </p>
              <p className="font-semibold text-slate-800">
                EVIDENCE READY – MANUAL FAMILY SUBMISSION REQUIRED: Family
                submits manually via Chakshu, 1930, or cybercrime.gov.in.
                Suraksha never auto-submits police or cybercrime reports.
              </p>
            </div>
          ) : (
            <div className="space-y-4" data-testid="evidence-pack-details">
              {/* Summary Header */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-mono text-slate-500">
                      {pack.evidence_pack_id} · Alert {pack.alert_id}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                      {pack.matched_playbook ?? pack.risk_verdict}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-700 text-white rounded whitespace-nowrap">
                      {pack.manual_submission_banner}
                    </span>
                    <button
                      type="button"
                      onClick={handleDownloadJson}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 rounded text-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      Export JSON
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadReadableReport}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 rounded text-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                      Download Report
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 rounded text-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                      Print / PDF
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed">
                  {pack.explanation}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-[11px] font-mono text-slate-600">
                  <div>Started: {pack.call_timestamps.started_at}</div>
                  <div>Flagged: {pack.call_timestamps.flagged_at}</div>
                  <div>Generated: {pack.call_timestamps.generated_at}</div>
                </div>
              </div>

              {/* Indicators & URL Check Results */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 border border-slate-200 rounded-lg space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800">
                    Detected Scam Indicators
                  </h4>
                  <div className="text-xs text-slate-800 leading-relaxed">
                    {pack.scam_indicators.join(' · ')}
                  </div>
                </div>

                <div className="p-3.5 border border-slate-200 rounded-lg space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                    URL Threat Intelligence (Never Clicked)
                  </h4>
                  {pack.URL_check_results.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No URLs detected in call transcript.
                    </p>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      {pack.URL_check_results.map((u) => (
                        <div
                          key={u.url}
                          className="p-2 bg-red-50 border border-red-200 rounded"
                        >
                          <div className="font-mono font-semibold text-red-950 break-all">
                            {u.url} · {u.verdict}
                          </div>
                          <p className="text-red-900 mt-0.5">{u.reason}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Transcript & Timeline */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-3.5 border border-slate-200 rounded-lg space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800">
                    Relevant Transcript Window
                  </h4>
                  <div className="space-y-1.5 font-mono text-xs max-h-[220px] overflow-y-auto">
                    {pack.transcript_window.map((line) => (
                      <div
                        key={line.id}
                        className="p-2 bg-slate-50 border border-slate-200 rounded"
                      >
                        <span className="text-slate-500">[{line.elapsed}]</span>{' '}
                        <strong className="text-slate-900">{line.speaker}:</strong>{' '}
                        {line.text}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 border border-slate-200 rounded-lg space-y-2">
                  <h4 className="text-xs font-semibold text-slate-800">
                    Timestamped Incident Timeline
                  </h4>
                  <div className="space-y-1.5 font-mono text-[11px] max-h-[220px] overflow-y-auto">
                    {pack.event_timeline.map((evt) => (
                      <div
                        key={`${evt.seq}-${evt.event_type}`}
                        className="p-2 bg-slate-50 border border-slate-200 rounded flex items-center justify-between gap-2"
                      >
                        <span className="font-semibold text-slate-900">
                          #{evt.seq} {evt.event_type}
                        </span>
                        <span className="text-slate-600">{evt.outcome}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Integrity Verification & Tamper Simulation */}
              <div className="p-3.5 border border-slate-200 rounded-lg space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5">
                    <ShieldCheck
                      className="w-4 h-4 text-emerald-700"
                      aria-hidden="true"
                    />
                    Evidence Integrity &amp; SHA-256 Audit Chain Verification
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleVerifyIntegrity()}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded cursor-pointer whitespace-nowrap"
                    >
                      Verify SHA-256 Chain
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSimulateTamper()}
                      className="px-3 py-1.5 text-xs font-semibold bg-white border border-red-300 hover:bg-red-50 text-red-900 rounded cursor-pointer whitespace-nowrap"
                    >
                      Simulate Tamper Detection
                    </button>
                  </div>
                </div>
                <div className="font-mono text-[11px] text-slate-700 bg-slate-50 p-2 rounded border border-slate-200 break-all">
                  evidence_integrity_sha256: {pack.integrity_hash}
                </div>
                {verifyResult && (
                  <div
                    data-testid="integrity-verify-result"
                    className={`p-2.5 rounded border text-xs flex items-center gap-2 ${
                      verifyResult.valid
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : 'bg-red-50 border-red-300 text-red-900'
                    }`}
                  >
                    {verifyResult.valid ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    )}
                    <span>
                      {verifyResult.valid
                        ? `Verified ${verifyResult.checked_count} audit events — zero tampering detected.`
                        : `${verifyResult.isTamperTest ? 'Tamper test caught modification: ' : ''}${verifyResult.reason}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Manual Submission Instructions (CRITICAL HUMAN HANDOFF) */}
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-amber-950">
                    EVIDENCE READY – MANUAL FAMILY SUBMISSION REQUIRED
                  </h4>
                  <span className="font-mono text-[11px] font-semibold text-amber-900">
                    auto_submitted: false
                  </span>
                </div>
                <ul className="list-disc pl-4 text-xs text-amber-950 space-y-1">
                  {pack.handoff_instructions.map((instr) => (
                    <li key={instr}>{instr}</li>
                  ))}
                </ul>
                <div className="pt-1 flex flex-wrap gap-2 text-xs font-semibold text-amber-950">
                  <span className="px-2 py-1 bg-white border border-amber-300 rounded">
                    Chakshu (Sanchar Saathi)
                  </span>
                  <span className="px-2 py-1 bg-white border border-amber-300 rounded">
                    Helpline 1930
                  </span>
                  <span className="px-2 py-1 bg-white border border-amber-300 rounded">
                    cybercrime.gov.in
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Secondary Message & Link Check Tool */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="border-b border-slate-200 pb-2.5">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-700" aria-hidden="true" />
            Secondary Suspicious Message &amp; Link Check
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Paste a suspicious SMS, WhatsApp text, or URL for static wording and
            domain reputation analysis. Links are never clicked or fetched.
          </p>
        </div>

        <form onSubmit={(e) => void handleInspectMessage(e)} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="secondary-msg-input"
                className="block text-xs font-medium text-slate-700"
              >
                Suspicious SMS / WhatsApp Message
              </label>
              <textarea
                id="secondary-msg-input"
                rows={3}
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
                placeholder="e.g. Your SBI KYC expired today, share 6-digit OTP or click link..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded text-slate-900"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="secondary-url-input"
                className="block text-xs font-medium text-slate-700"
              >
                Suspicious URL (Never Opened)
              </label>
              <input
                id="secondary-url-input"
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="e.g. http://kyc-bill-verify.example/support"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded text-slate-900 font-mono"
              />
              <button
                type="submit"
                disabled={checkingMsg}
                className="mt-2 px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded cursor-pointer disabled:opacity-50"
              >
                {checkingMsg ? 'Inspecting...' : 'Analyze Message & URL'}
              </button>
            </div>
          </div>
        </form>

        {checkResult && (
          <div
            data-testid="secondary-check-result"
            className={`p-3 rounded border text-xs space-y-1.5 ${
              checkResult.verdict === 'High Risk'
                ? 'bg-red-50 border-red-300 text-red-950'
                : checkResult.verdict === 'Suspicious (Ask Family)'
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
              <span>Verdict: {checkResult.verdict}</span>
              <span className="font-mono tabular-nums">
                Score {checkResult.risk_score} · never_fetched: true
              </span>
            </div>
            <p>{checkResult.explanation}</p>
            <p className="font-semibold">{checkResult.recommended_action}</p>
          </div>
        )}
      </section>
    </div>
  );
}
