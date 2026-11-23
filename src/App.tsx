import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  FileCheck2,
  GraduationCap,
  Home,
  PhoneCall,
  Server,
  Shield,
  Users,
} from 'lucide-react';
import {
  fetchInitialState,
  fetchScenarios,
  resetDemoApi,
  runIntegrationHealthChecksApi,
  runPolicyTestApi,
  setBedrockModeApi,
  startCallApi,
  stepCallApi,
  submitApprovalApi,
  submitVoiceApprovalApi,
} from './api/client';
import { ArchitectureMonitorPage } from './components/ArchitectureMonitorPage';
import { EvidencePackView } from './components/EvidencePackView';
import { GuardianView } from './components/GuardianView';
import { HomeDashboardPage } from './components/HomeDashboardPage';
import { IntegrationStatusPage } from './components/IntegrationStatusPage';
import { LiveGuardPage } from './components/LiveGuardPage';
import { ScamDrillPage } from './components/ScamDrillPage';
import {
  PolicyTestScenario,
  ScenarioDefinition,
  SystemStateSnapshot,
} from './server/types';

export type AppPage =
  | 'home'
  | 'live'
  | 'guardian'
  | 'architecture'
  | 'evidence'
  | 'drill'
  | 'integrations';

const NAV_ITEMS: Array<{
  id: AppPage;
  label: string;
  icon: typeof Home;
}> = [
  { id: 'home', label: 'Protection Home', icon: Home },
  { id: 'live', label: 'Live Guard', icon: PhoneCall },
  { id: 'guardian', label: 'Guardian Dashboard', icon: Users },
  { id: 'architecture', label: 'Architecture Monitor', icon: Cpu },
  { id: 'evidence', label: 'Evidence Center', icon: FileCheck2 },
  { id: 'drill', label: 'Scam Drill', icon: GraduationCap },
  { id: 'integrations', label: 'Integration Status', icon: Server },
];

export default function App() {
  const [activePage, setActivePage] = useState<AppPage>('home');
  const navigateTo = useCallback((page: AppPage) => {
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);
  const [scenarios, setScenarios] = useState<ScenarioDefinition[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('digital-arrest');
  const [snapshot, setSnapshot] = useState<SystemStateSnapshot | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [initState, loadedScenarios] = await Promise.all([
          fetchInitialState(),
          fetchScenarios(),
        ]);
        if (!active) return;
        setSnapshot(initState);
        setSelectedScenarioId(initState.active_scenario_id);
        setScenarios(loadedScenarios);
      } catch (err) {
        if (active) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Unable to connect to backend'
          );
        }
      }
    })();

    const es = new EventSource('/api/events');
    es.onmessage = (event) => {
      try {
        const next = JSON.parse(event.data) as SystemStateSnapshot;
        if (active) setSnapshot(next);
      } catch {
        // Ignore malformed SSE keepalive frames
      }
    };

    return () => {
      active = false;
      es.close();
    };
  }, []);

  const handleStep = useCallback(async () => {
    try {
      setErrorMsg(null);
      const next = await stepCallApi();
      setSnapshot(next);
      if (
        next.lifecycle_state === 'AWAITING_APPROVAL' ||
        next.lifecycle_state === 'EVIDENCE_READY' ||
        next.lifecycle_state === 'DENIED'
      ) {
        setIsPlaying(false);
      }
    } catch (err) {
      setIsPlaying(false);
      setErrorMsg(err instanceof Error ? err.message : 'Step failed');
    }
  }, []);

  const handleStartOrPlay = useCallback(async () => {
    try {
      setErrorMsg(null);
      if (!snapshot || snapshot.lifecycle_state === 'IDLE') {
        const started = await startCallApi({
          scenario_id: selectedScenarioId,
          input_mode: 'scripted',
        });
        setSnapshot(started);
      }
      setIsPlaying(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Start failed');
    }
  }, [selectedScenarioId, snapshot]);

  const handleStartLiveGuardCta = useCallback(async () => {
    navigateTo('live');
    if (snapshot?.lifecycle_state === 'IDLE') {
      const started = await startCallApi({
        scenario_id: selectedScenarioId,
        input_mode: 'scripted',
      });
      setSnapshot(started);
      setIsPlaying(true);
    }
  }, [navigateTo, selectedScenarioId, snapshot?.lifecycle_state]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleReset = useCallback(async () => {
    setIsPlaying(false);
    const next = await resetDemoApi();
    setSnapshot(next);
  }, []);

  const handleApprove = useCallback(async () => {
    setIsPlaying(false);
    const next = await submitApprovalApi('haan');
    setSnapshot(next);
  }, []);

  const handleDeny = useCallback(async () => {
    setIsPlaying(false);
    const next = await submitApprovalApi('nahi');
    setSnapshot(next);
  }, []);

  const handleVoiceUtteranceApproval = useCallback(async (utterance: string) => {
    const res = await submitVoiceApprovalApi(utterance);
    setSnapshot(res.snapshot);
    if (res.accepted) {
      setIsPlaying(false);
    }
    return { accepted: res.accepted, message: res.message };
  }, []);

  const handleSendCustomUtterance = useCallback(async (text: string) => {
    setIsPlaying(false);
    const next = await stepCallApi({ custom_text: text, speaker: 'Caller' });
    setSnapshot(next);
  }, []);

  const handleRunPolicyTest = useCallback(async (scenario: PolicyTestScenario) => {
    const res = await runPolicyTestApi(scenario);
    setSnapshot(res.snapshot);
  }, []);

  const handleBedrockModeChange = useCallback(
    async (mode: 'normal' | 'timeout' | 'unavailable') => {
      const next = await setBedrockModeApi(mode);
      setSnapshot(next);
    },
    []
  );

  const handleRunHealthChecks = useCallback(async () => {
    const res = await runIntegrationHealthChecksApi();
    setSnapshot((prev) =>
      prev ? { ...prev, integrations: res.integrations } : prev
    );
    return { checked_at: res.checked_at };
  }, []);

  // Progressive streaming transcript timer
  useEffect(() => {
    if (!isPlaying || !snapshot) return;
    if (
      snapshot.lifecycle_state === 'AWAITING_APPROVAL' ||
      snapshot.lifecycle_state === 'EVIDENCE_READY' ||
      snapshot.lifecycle_state === 'DENIED'
    ) {
      setIsPlaying(false);
      return;
    }

    const activeScenario = scenarios.find(
      (s) => s.id === snapshot.active_scenario_id
    );
    const maxLines = activeScenario?.lines.length ?? 2;
    const callerLinesCount = snapshot.transcript.filter(
      (l) => l.speaker === 'Caller'
    ).length;

    if (
      snapshot.lifecycle_state === 'LISTENING' &&
      callerLinesCount >= maxLines
    ) {
      setIsPlaying(false);
      return;
    }

    const delay = speed === 2 ? 750 : 1500;
    const timer = window.setTimeout(() => {
      void handleStep();
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isPlaying, snapshot, scenarios, speed, handleStep]);

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-slate-700">
          {errorMsg ? `Error: ${errorMsg}` : 'Connecting to Suraksha backend...'}
        </div>
      </div>
    );
  }

  const anyLive = snapshot.integrations.some((i) => i.health === 'LIVE');
  const allLive =
    snapshot.integrations.length > 0 &&
    snapshot.integrations.every((i) => i.health === 'LIVE');
  const modeSummary = allLive
    ? 'LIVE AWS + ELEVENLABS'
    : anyLive
      ? 'HYBRID MODE'
      : 'DEMO MODE · MOCK ADAPTERS';
  const currentNavLabel =
    NAV_ITEMS.find((n) => n.id === activePage)?.label ?? 'Protection Home';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Clean 3-Zone Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('home');
            }}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 inline-flex items-center gap-2"
          >
            <Shield className="w-5 h-5 text-blue-700" aria-hidden="true" />
            SURAKSHA
          </a>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 truncate">
            <span>{currentNavLabel}</span>
            <span aria-hidden="true">/</span>
            <span className="font-mono text-slate-800">{modeSummary}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-semibold text-slate-900">
              {snapshot.lifecycle_state}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void handleStartLiveGuardCta()}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Start Live Guard
          </button>
        </div>

        {/* Mobile Horizontal Navigation Strip */}
        <nav
          aria-label="Mobile workspace navigation"
          className="lg:hidden border-t border-slate-200 px-4 py-2 flex items-center gap-1.5 overflow-x-auto bg-slate-50"
        >
          {NAV_ITEMS.map((item) => {
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 border border-slate-300'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="flex-1 max-w-[1440px] w-full mx-auto flex">
        {/* Desktop Sidebar Navigation (240px) */}
        <aside className="hidden lg:flex lg:sticky lg:top-[57px] lg:self-start lg:min-h-[calc(100vh-100px)] flex-col w-[240px] shrink-0 bg-white border-r border-slate-200 p-4 justify-between">
          <nav aria-label="Primary workspace navigation" className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-4 border-t border-slate-200 space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <Activity className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
              Safety Posture
            </div>
            <p className="text-[11px] leading-relaxed">
              Zero scammer replies · Pre-consented voice clips only ·
              Cedar-enforced approval tokens · Manual reporting handoff.
            </p>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-300 rounded text-xs text-red-900">
              {errorMsg}
            </div>
          )}

          {activePage === 'home' && (
            <HomeDashboardPage
              snapshot={snapshot}
              onStartLiveGuard={() => void handleStartLiveGuardCta()}
              onNavigate={navigateTo}
            />
          )}

          {activePage === 'live' && (
            <LiveGuardPage
              snapshot={snapshot}
              scenarios={scenarios}
              selectedScenarioId={selectedScenarioId}
              onSelectScenario={setSelectedScenarioId}
              isPlaying={isPlaying}
              speed={speed}
              language={language}
              onStartOrPlay={handleStartOrPlay}
              onPause={handlePause}
              onStep={handleStep}
              onReset={handleReset}
              onSpeedChange={setSpeed}
              onLanguageChange={setLanguage}
              onApprove={handleApprove}
              onDeny={handleDeny}
              onVoiceUtteranceApproval={handleVoiceUtteranceApproval}
              onSendCustomUtterance={handleSendCustomUtterance}
              onOpenEvidence={() => navigateTo('evidence')}
              onOpenArchitecture={() => navigateTo('architecture')}
            />
          )}

          {activePage === 'guardian' && (
            <GuardianView
              snapshot={snapshot}
              onOpenEvidenceTab={() => navigateTo('evidence')}
            />
          )}

          {activePage === 'architecture' && (
            <ArchitectureMonitorPage
              snapshot={snapshot}
              onRunPolicyTest={handleRunPolicyTest}
            />
          )}

          {activePage === 'evidence' && <EvidencePackView snapshot={snapshot} />}

          {activePage === 'drill' && <ScamDrillPage />}

          {activePage === 'integrations' && (
            <IntegrationStatusPage
              snapshot={snapshot}
              onRunHealthChecks={handleRunHealthChecks}
              onBedrockModeChange={handleBedrockModeChange}
            />
          )}
        </main>
      </div>

      <footer className="bg-white border-t border-slate-200 px-4 sm:px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            SURAKSHA · wHACKiest 2026 (Make MCP Matter) · {modeSummary}
          </span>
          <span>
            Manual reporting only (Chakshu / 1930 / cybercrime.gov.in)
          </span>
        </div>
      </footer>
    </div>
  );
}
