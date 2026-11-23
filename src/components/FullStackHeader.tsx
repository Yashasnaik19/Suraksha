import { Pause, Play, RotateCcw, ShieldAlert, SkipForward } from 'lucide-react';
import {
  IntegrationStatus,
  ScenarioDefinition,
  SessionLifecycleState,
} from '../server/types';

export type WorkspaceTab =
  | 'overview'
  | 'parent'
  | 'guardian'
  | 'evidence'
  | 'monitor';

interface FullStackHeaderProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  lifecycleState: SessionLifecycleState;
  scenarios: ScenarioDefinition[];
  selectedScenarioId: string;
  onSelectScenario: (id: string) => void;
  isPlaying: boolean;
  speed: 1 | 2;
  language: 'en' | 'hi';
  integrations: IntegrationStatus[];
  onStartOrPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSpeedChange: (s: 1 | 2) => void;
  onLanguageChange: (lang: 'en' | 'hi') => void;
}

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'overview', label: 'Live Overview' },
  { id: 'parent', label: 'Parent Device' },
  { id: 'guardian', label: 'Guardian Dashboard' },
  { id: 'evidence', label: 'Evidence Pack' },
  { id: 'monitor', label: 'System Monitor' },
];

function stateTone(state: SessionLifecycleState): string {
  if (state === 'BLOCKED') return 'bg-red-50 text-red-900 border-red-300';
  if (state === 'SIGNAL_DETECTED' || state === 'INTERRUPTING') {
    return 'bg-amber-50 text-amber-900 border-amber-300';
  }
  if (state === 'AWAITING_APPROVAL' || state === 'APPROVED') {
    return 'bg-blue-50 text-blue-900 border-blue-300';
  }
  if (state === 'FAMILY_ALERTED' || state === 'EVIDENCE_READY') {
    return 'bg-emerald-50 text-emerald-900 border-emerald-300';
  }
  return 'bg-slate-100 text-slate-700 border-slate-300';
}

export function FullStackHeader({
  activeTab,
  onTabChange,
  lifecycleState,
  scenarios,
  selectedScenarioId,
  onSelectScenario,
  isPlaying,
  speed,
  language,
  integrations,
  onStartOrPlay,
  onPause,
  onStep,
  onReset,
  onSpeedChange,
  onLanguageChange,
}: FullStackHeaderProps) {
  const anyLive = integrations.some((i) => i.mode === 'LIVE');
  const allLive =
    integrations.length > 0 && integrations.every((i) => i.mode === 'LIVE');

  const modeBadgeText = allLive
    ? 'LIVE AWS + ELEVENLABS MODE'
    : anyLive
      ? 'HYBRID MODE (ENV-CONFIGURED + LOCAL MOCKS)'
      : 'LOCAL MOCK MODE · ENV-DRIVEN ADAPTERS';

  const waitingForParent = lifecycleState === 'AWAITING_APPROVAL';
  const isFinished =
    lifecycleState === 'EVIDENCE_READY' || lifecycleState === 'DENIED';

  return (
    <header className="bg-white border-b border-slate-200">
      {/* Row 1: Brand + Mode Disclosure + View Tabs */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <ShieldAlert className="w-5 h-5 text-blue-700" aria-hidden="true" />
            <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
              Suraksha
            </span>
          </div>
          <span
            data-testid="environment-mode-badge"
            className={`px-2.5 py-1 text-[11px] font-semibold tracking-wide rounded border whitespace-nowrap ${
              allLive
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-amber-50 text-amber-950 border-amber-300'
            }`}
          >
            {modeBadgeText}
          </span>
        </div>

        <nav
          aria-label="Workspace views"
          className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Row 2: Scenario & Demo Controls */}
      <div className="bg-slate-50 border-t border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="scenario-select" className="sr-only">
              Call Scenario
            </label>
            <select
              id="scenario-select"
              value={selectedScenarioId}
              onChange={(e) => onSelectScenario(e.target.value)}
              disabled={lifecycleState !== 'IDLE'}
              className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded text-slate-800 disabled:bg-slate-100 disabled:text-slate-500 max-w-[260px]"
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
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 disabled:text-slate-500 rounded transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                {lifecycleState === 'IDLE' ? 'Start Call' : 'Resume'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onPause}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                Pause
              </button>
            )}

            <button
              type="button"
              onClick={onStep}
              disabled={waitingForParent || isFinished}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400 rounded transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
            >
              <SkipForward className="w-3.5 h-3.5" aria-hidden="true" />
              Step
            </button>

            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Reset
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-600">Speed</span>
              <div
                className="inline-flex p-0.5 bg-slate-200/80 rounded border border-slate-200"
                role="group"
                aria-label="Playback speed"
              >
                <button
                  type="button"
                  onClick={() => onSpeedChange(1)}
                  aria-pressed={speed === 1}
                  className={`px-2 py-1 text-xs font-mono font-medium rounded cursor-pointer ${
                    speed === 1
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  1x
                </button>
                <button
                  type="button"
                  onClick={() => onSpeedChange(2)}
                  aria-pressed={speed === 2}
                  className={`px-2 py-1 text-xs font-mono font-medium rounded cursor-pointer ${
                    speed === 2
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  2x
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-600">
                Subtitles
              </span>
              <div
                className="inline-flex p-0.5 bg-slate-200/80 rounded border border-slate-200"
                role="group"
                aria-label="Subtitle language"
              >
                <button
                  type="button"
                  onClick={() => onLanguageChange('en')}
                  aria-pressed={language === 'en'}
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
                  aria-pressed={language === 'hi'}
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

            <span
              data-testid="lifecycle-state"
              className={`px-2.5 py-1 text-xs font-mono font-semibold border rounded whitespace-nowrap ${stateTone(
                lifecycleState
              )}`}
            >
              {lifecycleState}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
