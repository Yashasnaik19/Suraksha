import { useEffect, useState } from 'react';
import { Award, CheckCircle2, GraduationCap, ShieldAlert } from 'lucide-react';
import { evaluateDrillApi, fetchDrillScenariosApi } from '../api/client';
import type {
  DrillEvaluationSummary,
  DrillScenario,
} from '../server/scamDrill';

export function ScamDrillPage() {
  const [scenarios, setScenarios] = useState<DrillScenario[]>([]);
  const [selectedId, setSelectedId] = useState<string>('drill-digital-arrest');
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState<DrillEvaluationSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchDrillScenariosApi()
      .then((res) => {
        setScenarios(res.scenarios);
        if (res.scenarios[0]) setSelectedId(res.scenarios[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const activeScenario =
    scenarios.find((s) => s.id === selectedId) ?? scenarios[0];

  const handleSelectChoice = (stepIndex: number, choiceId: string) => {
    setChoices((prev) => ({ ...prev, [stepIndex]: choiceId }));
    setSummary(null);
  };

  const handleCompleteDrill = async () => {
    if (!activeScenario) return;
    const selected_choices = Object.entries(choices).map(([idx, choiceId]) => ({
      step_index: Number(idx),
      choice_id: choiceId,
    }));
    const res = await evaluateDrillApi({
      scenario_id: activeScenario.id,
      selected_choices,
    });
    setSummary(res);
  };

  const handleSwitchScenario = (id: string) => {
    setSelectedId(id);
    setChoices({});
    setSummary(null);
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6 text-xs text-slate-600">
        Loading Scam Drill scenarios...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-blue-700" aria-hidden="true" />
              Scam Drill — Family Role-Play Training
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Architectural boundary: Practice role-play and any ElevenLabs
              Conversational Agent are strictly isolated from Live Guard and
              cannot touch live calls or Family MCP.
            </p>
          </div>
          <span className="px-2.5 py-1 text-xs font-mono font-semibold bg-slate-100 border border-slate-300 text-slate-800 rounded whitespace-nowrap">
            ISOLATED PRACTICE MODULE
          </span>
        </div>

        {/* Scenario Selector */}
        <div className="flex flex-wrap gap-2">
          {scenarios.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => handleSwitchScenario(sc.id)}
              className={`px-3 py-2 text-xs font-semibold rounded border cursor-pointer ${
                sc.id === activeScenario?.id
                  ? 'bg-blue-700 text-white border-blue-800'
                  : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {sc.title}
            </button>
          ))}
        </div>

        {activeScenario && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
              <strong className="text-slate-900">
                {activeScenario.caller_persona}
              </strong>{' '}
              · Tactic Focus: {activeScenario.tactic_focus}
            </div>

            {activeScenario.steps.map((step, idx) => {
              const selectedChoiceId = choices[idx];
              const selectedChoice = step.choices.find(
                (c) => c.id === selectedChoiceId
              );
              return (
                <div
                  key={`${activeScenario.id}-${idx}`}
                  className="p-4 border border-slate-200 rounded-lg space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-900">
                      Turn {idx + 1} · Simulated Scammer Statement
                    </span>
                    <span className="font-mono text-[11px] text-amber-900">
                      {step.tactic_tag}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {step.prompt}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {step.choices.map((ch) => {
                      const active = selectedChoiceId === ch.id;
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => handleSelectChoice(idx, ch.id)}
                          className={`p-3 text-left text-xs rounded border transition-colors cursor-pointer ${
                            active
                              ? 'bg-blue-50 border-blue-400 text-blue-950 font-semibold'
                              : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          {ch.text}
                        </button>
                      );
                    })}
                  </div>
                  {selectedChoice && (
                    <div
                      className={`p-2.5 rounded border text-xs flex items-start gap-2 ${
                        selectedChoice.safe
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                          : 'bg-red-50 border-red-300 text-red-950'
                      }`}
                    >
                      {selectedChoice.safe ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                      )}
                      <span>{selectedChoice.feedback}</span>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={
                  Object.keys(choices).length < activeScenario.steps.length
                }
                onClick={() => void handleCompleteDrill()}
                className="px-4 py-2 text-xs font-semibold bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 text-white rounded cursor-pointer disabled:cursor-not-allowed"
              >
                Finish Drill &amp; View Summary
              </button>
            </div>
          </div>
        )}

        {summary && (
          <div
            data-testid="drill-summary"
            className="p-4 bg-emerald-50 border border-emerald-300 rounded-lg space-y-2 text-xs text-emerald-950"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
              <span className="inline-flex items-center gap-1.5">
                <Award className="w-4 h-4" aria-hidden="true" />
                Drill Performance Summary · {summary.scenario_title}
              </span>
              <span className="font-mono tabular-nums">
                Score {summary.score}% ({summary.safe_decisions}/
                {summary.total_steps} safe responses)
              </span>
            </div>
            <div>
              <strong>Suggestions:</strong> {summary.improvements.join(' ')}
            </div>
            <div className="font-mono text-[11px] text-emerald-900">
              Conversational Agent Mode: {summary.conversational_agent_mode} ·
              Isolated from Live Guard: true
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
