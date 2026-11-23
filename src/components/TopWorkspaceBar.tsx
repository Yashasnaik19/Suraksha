import { Pause, Play, RotateCcw, ShieldAlert, SkipForward } from 'lucide-react';
import { SubtitleLanguage, SurakshaState } from '../adapters/types';

interface TopWorkspaceBarProps {
  state: SurakshaState;
  isPlaying: boolean;
  speed: 1 | 2;
  language: SubtitleLanguage;
  tryWithoutApproval: boolean;
  onStartOrResume: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSpeedChange: (speed: 1 | 2) => void;
  onLanguageChange: (lang: SubtitleLanguage) => void;
  onToggleTryWithoutApproval: () => void;
}

const STATE_LABELS: Record<SurakshaState, { en: string; hi: string; tone: string }> = {
  IDLE: {
    en: 'IDLE',
    hi: 'निष्क्रिय (IDLE)',
    tone: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  LISTENING: {
    en: 'LISTENING',
    hi: 'सुन रहा है (LISTENING)',
    tone: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  SIGNAL_DETECTED: {
    en: 'SIGNAL_DETECTED',
    hi: 'संकेत मिले (SIGNAL_DETECTED)',
    tone: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  INTERRUPTING: {
    en: 'INTERRUPTING',
    hi: 'हस्तक्षेप (INTERRUPTING)',
    tone: 'bg-amber-50 text-amber-900 border-amber-300',
  },
  AWAITING_APPROVAL: {
    en: 'AWAITING_APPROVAL',
    hi: 'अनुमति प्रतीक्षा (AWAITING_APPROVAL)',
    tone: 'bg-indigo-50 text-indigo-900 border-indigo-300',
  },
  APPROVED: {
    en: 'APPROVED',
    hi: 'स्वीकृत (APPROVED)',
    tone: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  },
  DENIED: {
    en: 'DENIED',
    hi: 'अस्वीकृत (DENIED)',
    tone: 'bg-slate-100 text-slate-800 border-slate-300',
  },
  FAMILY_ALERTED: {
    en: 'FAMILY_ALERTED',
    hi: 'परिवार को सूचना (FAMILY_ALERTED)',
    tone: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  },
  EVIDENCE_READY: {
    en: 'EVIDENCE_READY',
    hi: 'साक्ष्य तैयार (EVIDENCE_READY)',
    tone: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  },
};

export function TopWorkspaceBar({
  state,
  isPlaying,
  speed,
  language,
  tryWithoutApproval,
  onStartOrResume,
  onPause,
  onStep,
  onReset,
  onSpeedChange,
  onLanguageChange,
  onToggleTryWithoutApproval,
}: TopWorkspaceBarProps) {
  const stateInfo = STATE_LABELS[state];
  const isTerminal = state === 'EVIDENCE_READY' || state === 'DENIED';
  const waitingForParent = state === 'AWAITING_APPROVAL';

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <ShieldAlert className="w-5 h-5 text-blue-800" aria-hidden="true" />
            <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              Suraksha
            </span>
          </div>

          <span
            data-testid="simulation-badge"
            className="inline-flex items-center px-2.5 py-1 text-[11px] sm:text-xs font-semibold tracking-wide text-amber-950 bg-amber-100 border border-amber-300 rounded whitespace-nowrap shrink-0"
          >
            UI MOCKUP - ALL SERVICES SIMULATED
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
            State:
          </span>
          <span
            data-testid="machine-state"
            className={`px-2.5 py-1 text-xs font-mono font-semibold border rounded whitespace-nowrap ${stateInfo.tone}`}
          >
            {language === 'hi' ? stateInfo.hi : stateInfo.en}
          </span>
        </div>
      </div>

      <div className="bg-slate-50 border-t border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {!isPlaying ? (
              <button
                type="button"
                onClick={onStartOrResume}
                disabled={isTerminal || waitingForParent}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:bg-slate-300 disabled:text-slate-500 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                {state === 'IDLE' ? 'Start demo' : 'Resume'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onPause}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                Pause
              </button>
            )}

            <button
              type="button"
              onClick={onStep}
              disabled={isTerminal || waitingForParent}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <SkipForward className="w-3.5 h-3.5" aria-hidden="true" />
              Step
            </button>

            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Reset
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                Speed
              </span>
              <div
                className="inline-flex p-0.5 bg-slate-200/80 rounded border border-slate-200"
                role="group"
                aria-label="Playback speed"
              >
                <button
                  type="button"
                  onClick={() => onSpeedChange(1)}
                  aria-pressed={speed === 1}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    speed === 1
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  1x
                </button>
                <button
                  type="button"
                  onClick={() => onSpeedChange(2)}
                  aria-pressed={speed === 2}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    speed === 2
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  2x
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
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
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    language === 'en'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => onLanguageChange('hi')}
                  aria-pressed={language === 'hi'}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    language === 'hi'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Hindi
                </button>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={tryWithoutApproval}
              onClick={onToggleTryWithoutApproval}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold border rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tryWithoutApproval
                  ? 'bg-red-50 text-red-900 border-red-300'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <span
                aria-hidden="true"
                className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center text-[10px] font-bold ${
                  tryWithoutApproval
                    ? 'bg-red-700 border-red-700 text-white'
                    : 'bg-white border-slate-400'
                }`}
              >
                {tryWithoutApproval ? '✓' : ''}
              </span>
              Try without approval
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
