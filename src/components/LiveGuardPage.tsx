import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import {
  ScenarioDefinition,
  SessionLifecycleState,
  SystemStateSnapshot,
} from '../server/types';
import { ParentDeviceView } from './ParentDeviceView';

interface LiveGuardPageProps {
  snapshot: SystemStateSnapshot;
  scenarios: ScenarioDefinition[];
  selectedScenarioId: string;
  onSelectScenario: (id: string) => void;
  isPlaying: boolean;
  speed: 1 | 2;
  language: 'en' | 'hi';
  onStartOrPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSpeedChange: (s: 1 | 2) => void;
  onLanguageChange: (lang: 'en' | 'hi') => void;
  onApprove: () => void;
  onDeny: () => void;
  onVoiceUtteranceApproval: (utterance: string) => Promise<{
    accepted: boolean;
    message: string;
  }>;
  onSendCustomUtterance: (text: string) => void;
  onOpenEvidence: () => void;
  onOpenArchitecture: () => void;
}

const LIFECYCLE_STAGES: Array<{
  id: string;
  label: string;
  activeStates: SessionLifecycleState[];
}> = [
  {
    id: 'detected',
    label: 'DETECTED',
    activeStates: [
      'SIGNAL_DETECTED',
      'INTERRUPTING',
      'AWAITING_APPROVAL',
      'APPROVED',
      'DENIED',
      'BLOCKED',
      'FAMILY_ALERTED',
      'EVIDENCE_READY',
    ],
  },
  {
    id: 'interrupted',
    label: 'INTERRUPTION PLAYED',
    activeStates: [
      'INTERRUPTING',
      'AWAITING_APPROVAL',
      'APPROVED',
      'DENIED',
      'BLOCKED',
      'FAMILY_ALERTED',
      'EVIDENCE_READY',
    ],
  },
  {
    id: 'pending',
    label: 'APPROVAL PENDING',
    activeStates: ['AWAITING_APPROVAL'],
  },
  {
    id: 'decision',
    label: 'APPROVED / REJECTED',
    activeStates: ['APPROVED', 'DENIED', 'BLOCKED', 'FAMILY_ALERTED', 'EVIDENCE_READY'],
  },
  {
    id: 'auth',
    label: 'AUTHORIZATION CHECK',
    activeStates: ['APPROVED', 'BLOCKED', 'FAMILY_ALERTED', 'EVIDENCE_READY'],
  },
  {
    id: 'mcp',
    label: 'TOOL EXECUTION',
    activeStates: ['FAMILY_ALERTED', 'EVIDENCE_READY'],
  },
  {
    id: 'alerted',
    label: 'FAMILY ALERTED',
    activeStates: ['FAMILY_ALERTED', 'EVIDENCE_READY'],
  },
  {
    id: 'evidence',
    label: 'EVIDENCE READY',
    activeStates: ['EVIDENCE_READY'],
  },
];

export function LiveGuardPage({
  snapshot,
  scenarios,
  selectedScenarioId,
  onSelectScenario,
  isPlaying,
  speed,
  language,
  onStartOrPlay,
  onPause,
  onStep,
  onReset,
  onSpeedChange,
  onLanguageChange,
  onApprove,
  onDeny,
  onVoiceUtteranceApproval,
  onSendCustomUtterance,
  onOpenEvidence,
  onOpenArchitecture,
}: LiveGuardPageProps) {
  const waitingForParent = snapshot.lifecycle_state === 'AWAITING_APPROVAL';
  const isFinished =
    snapshot.lifecycle_state === 'EVIDENCE_READY' ||
    snapshot.lifecycle_state === 'DENIED';
  const alert = snapshot.active_alert;

  return (
    <div className="space-y-4">
      {/* Control Toolbar */}
      <section className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="live-scenario-select" className="sr-only">
            Call Scenario
          </label>
          <select
            id="live-scenario-select"
            value={selectedScenarioId}
            onChange={(e) => onSelectScenario(e.target.value)}
            disabled={snapshot.lifecycle_state !== 'IDLE'}
            className="px-2.5 py-2 text-xs font-medium bg-white border border-slate-300 rounded text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 max-w-[280px]"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>

          {!isPlaying ? (
            <button
              type="button"
              onClick={onStartOrPlay}
              disabled={waitingForParent || isFinished}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 disabled:text-slate-500 rounded cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              {snapshot.lifecycle_state === 'IDLE' ? 'Start Call' : 'Resume'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded cursor-pointer whitespace-nowrap"
            >
              <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              Pause
            </button>
          )}

          <button
            type="button"
            onClick={onStep}
            disabled={waitingForParent || isFinished}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400 rounded cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
          >
            <SkipForward className="w-3.5 h-3.5" aria-hidden="true" />
            Step
          </button>

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-600">Speed</span>
            <div className="inline-flex p-0.5 bg-slate-100 rounded border border-slate-200">
              <button
                type="button"
                onClick={() => onSpeedChange(1)}
                className={`px-2 py-1 text-xs font-mono rounded cursor-pointer ${
                  speed === 1 ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                1x
              </button>
              <button
                type="button"
                onClick={() => onSpeedChange(2)}
                className={`px-2 py-1 text-xs font-mono rounded cursor-pointer ${
                  speed === 2 ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                2x
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-600">Subtitles</span>
            <div className="inline-flex p-0.5 bg-slate-100 rounded border border-slate-200">
              <button
                type="button"
                onClick={() => onLanguageChange('en')}
                className={`px-2 py-1 text-xs font-medium rounded cursor-pointer ${
                  language === 'en'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => onLanguageChange('hi')}
                className={`px-2 py-1 text-xs font-medium rounded cursor-pointer ${
                  language === 'hi'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                Hindi
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 8-Stage Event Lifecycle Bar */}
      <section
        aria-label="Live call lifecycle"
        className="bg-white border border-slate-200 rounded-lg p-3"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2 text-[11px] font-mono">
          {LIFECYCLE_STAGES.map((stage, idx) => {
            const reached = stage.activeStates.includes(snapshot.lifecycle_state);
            const isBlockedStage =
              (snapshot.lifecycle_state === 'BLOCKED' ||
                snapshot.lifecycle_state === 'DENIED') &&
              (stage.id === 'decision' || stage.id === 'auth');
            return (
              <div
                key={stage.id}
                className={`px-2.5 py-2 rounded border text-center ${
                  isBlockedStage
                    ? 'bg-red-50 border-red-300 text-red-900 font-semibold'
                    : reached
                      ? 'bg-blue-50 border-blue-300 text-blue-950 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                {idx + 1}. {stage.label}
              </div>
            );
          })}
        </div>
      </section>

      {/* Main 2-Column Live Guard Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-5 min-w-0">
          <ParentDeviceView
            snapshot={snapshot}
            scenarios={scenarios}
            language={language}
            onApprove={onApprove}
            onDeny={onDeny}
            onVoiceUtteranceApproval={onVoiceUtteranceApproval}
            onSendCustomUtterance={onSendCustomUtterance}
          />
        </div>

        <div className="lg:col-span-7 flex flex-col gap-4 min-w-0">
          {/* Rolling Window + Detection Engine Telemetry */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
              <h2 className="text-sm font-semibold text-slate-900">
                Real-Time Rule Engine &amp; Rolling Window (10–20s)
              </h2>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                Window: {snapshot.rolling_window.length} segments
              </span>
            </div>

            {!alert ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 space-y-1.5">
                <p className="font-semibold text-slate-800">
                  Deterministic Scoring Ready (Independent of Bedrock)
                </p>
                <p>
                  Evaluates ISOLATION, FAKE_AUTHORITY, THREATS, URGENCY,
                  MONEY_AND_CREDENTIALS, and REMOTE_ACCESS categories as
                  transcript segments arrive progressively.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-amber-50 border border-amber-300 rounded">
                  <div>
                    <div className="text-xs font-mono text-amber-900">
                      {alert.alert_id} · {alert.rule_version}
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {alert.matched_playbook ?? alert.risk_level}
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-xs font-bold text-red-800">
                      {alert.risk_level}
                    </div>
                    <div className="text-xs text-amber-900 tabular-nums">
                      Risk Score {alert.risk_score}/100
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                    <div className="font-semibold text-slate-800">
                      Detected Risk Categories
                    </div>
                    <div className="font-mono text-[11px] text-slate-700">
                      {alert.detected_categories.join(' · ')}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                    <div className="font-semibold text-slate-800">
                      Matched Scam Signals
                    </div>
                    <div className="text-[11px] text-slate-700">
                      {alert.detected_signals.join(' · ')}
                    </div>
                  </div>
                </div>

                {/* Bedrock Explanation & Hindi Script */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      Contextual Risk Explanation
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {alert.explanation_source}
                    </span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    {alert.explanation}
                  </p>
                  <p className="text-slate-800 pt-1.5 border-t border-slate-200 leading-relaxed">
                    <strong>Hindi Script:</strong> {alert.hindi_script}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Token, Gateway Authorization & Notification Status */}
          <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
              <h2 className="text-sm font-semibold text-slate-900">
                Token, AgentCore Gateway &amp; Family Notification Status
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenArchitecture}
                  className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline cursor-pointer whitespace-nowrap"
                >
                  Open Policy Harness
                </button>
                {snapshot.evidence_pack && (
                  <button
                    type="button"
                    onClick={onOpenEvidence}
                    className="text-xs font-semibold text-blue-700 hover:text-blue-800 underline cursor-pointer whitespace-nowrap"
                  >
                    Open Evidence Pack
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                <div className="font-semibold text-slate-700">
                  Approval Token
                </div>
                <div className="font-mono text-slate-900">
                  {snapshot.active_approval
                    ? `${snapshot.active_approval.status} (${snapshot.active_approval.token_id.slice(0, 14)}...)`
                    : 'Not Issued'}
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                <div className="font-semibold text-slate-700">
                  Gateway / Cedar
                </div>
                <div className="font-mono text-slate-900 tabular-nums">
                  {snapshot.gateway_traces.length} checks ·{' '}
                  {
                    snapshot.gateway_traces.filter(
                      (t) => t.cedar_decision === 'DENY'
                    ).length
                  }{' '}
                  DENY
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                <div className="font-semibold text-slate-700">
                  Family SNS Alert
                </div>
                <div className="font-mono text-slate-900">
                  {alert?.guardian_notification_status ?? 'NOT_SENT'}
                </div>
              </div>
            </div>

            {/* Alert Timeline */}
            <div className="space-y-1.5 max-h-[210px] overflow-y-auto pr-1">
              {snapshot.audit_events.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Timeline events appear here in real time as the call streams.
                </p>
              ) : (
                [...snapshot.audit_events]
                  .reverse()
                  .slice(0, 8)
                  .map((evt) => (
                    <div
                      key={evt.event_id}
                      className={`px-3 py-2 rounded border text-xs flex flex-wrap items-center justify-between gap-2 ${
                        evt.outcome === 'DENY'
                          ? 'bg-red-50 border-red-200 text-red-950'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <span className="font-mono font-semibold tabular-nums">
                        #{evt.seq} {evt.event_type}
                      </span>
                      <span className="font-mono text-[11px]">
                        {evt.actor} · {evt.outcome}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
