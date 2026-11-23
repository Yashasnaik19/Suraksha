export interface DrillScenario {
  id: string;
  title: string;
  tactic_focus: string;
  caller_persona: string;
  steps: Array<{
    prompt: string;
    tactic_tag: string;
    choices: Array<{
      id: string;
      text: string;
      safe: boolean;
      feedback: string;
    }>;
  }>;
}

export const SCAM_DRILL_SCENARIOS: DrillScenario[] = [
  {
    id: 'drill-digital-arrest',
    title: 'Fake CBI Digital Arrest Role-Play',
    tactic_focus: 'Fake Authority + Isolation + Arrest Threat',
    caller_persona: 'Impersonator claiming to be a CBI Officer',
    steps: [
      {
        prompt:
          '"Main CBI se bol raha hoon. Aapke Aadhaar par illegal parcel pakda gaya hai. Video call par rahiye aur kisi ko mat batana!"',
        tactic_tag: 'FAKE_AUTHORITY + ISOLATION',
        choices: [
          {
            id: 'stay-silent',
            text: 'Stay on video call quietly because they said CBI',
            safe: false,
            feedback:
              'Scammers use fear of authority and forced secrecy to isolate you from family.',
          },
          {
            id: 'spot-isolation',
            text: 'Recognize fake authority + isolation and inform Ansh immediately',
            safe: true,
            feedback:
              'Correct! Real agencies never put citizens under "digital arrest" on video calls or forbid talking to family.',
          },
        ],
      },
      {
        prompt:
          '"Arrest rokne ke liye abhi verification deposit UPI se transfer karo, warna police 10 minute mein aayegi!"',
        tactic_tag: 'THREATS + URGENCY + MONEY_AND_CREDENTIALS',
        choices: [
          {
            id: 'hang-up',
            text: 'Hang up immediately, block caller, and verify with family / 1930',
            safe: true,
            feedback:
              'Excellent response! Hanging up breaks the artificial deadline and protects your savings.',
          },
          {
            id: 'pay-deposit',
            text: 'Send a small deposit so they do not arrest you',
            safe: false,
            feedback:
              'Never pay under threat. Legitimate police or courts never demand UPI transfers on a call.',
          },
        ],
      },
    ],
  },
  {
    id: 'drill-bank-kyc',
    title: 'Bank KYC Block & Remote-Access Drill',
    tactic_focus: 'Urgency + OTP/PIN + Remote-Access App',
    caller_persona: 'Caller pretending to be Bank KYC Support',
    steps: [
      {
        prompt:
          '"Aapka bank account aaj block ho jayega! Turant AnyDesk app install kijiye aur screen share code dijiye."',
        tactic_tag: 'URGENCY + REMOTE_ACCESS',
        choices: [
          {
            id: 'refuse-anydesk',
            text: 'Refuse AnyDesk / screen sharing and end the call',
            safe: true,
            feedback:
              'Great catch! No bank asks you to install AnyDesk, TeamViewer, or QuickSupport.',
          },
          {
            id: 'install-app',
            text: 'Install AnyDesk so the agent can fix KYC faster',
            safe: false,
            feedback:
              'Remote-access apps let scammers control your phone and read OTPs silently.',
          },
        ],
      },
      {
        prompt:
          '"KYC complete karne ke liye abhi jo 6-digit OTP SMS aaya hai woh padh kar bataiye."',
        tactic_tag: 'MONEY_AND_CREDENTIALS',
        choices: [
          {
            id: 'never-otp',
            text: 'Refuse OTP completely and call official bank branch or family',
            safe: true,
            feedback:
              'Spot on! OTPs and UPI PINs authorize money leaving your account—never share them.',
          },
          {
            id: 'read-otp',
            text: 'Read the OTP because they already knew my name',
            safe: false,
            feedback:
              'Scammers often buy leaked names/numbers. Knowing your name does not prove they are your bank.',
          },
        ],
      },
    ],
  },
];

export interface DrillEvaluationSummary {
  scenario_id: string;
  scenario_title: string;
  score: number;
  total_steps: number;
  safe_decisions: number;
  tactics_mastered: string[];
  improvements: string[];
  conversational_agent_isolated_from_live_guard: true;
  conversational_agent_mode: 'MOCK' | 'LIVE';
}

export function evaluateScamDrillSubmission(params: {
  scenario_id: string;
  selected_choices: Array<{ step_index: number; choice_id: string }>;
}): DrillEvaluationSummary {
  const scenario =
    SCAM_DRILL_SCENARIOS.find((s) => s.id === params.scenario_id) ??
    SCAM_DRILL_SCENARIOS[0];

  let safeCount = 0;
  const tacticsMastered: string[] = [];
  const improvements: string[] = [];

  scenario.steps.forEach((step, idx) => {
    const picked = params.selected_choices.find((c) => c.step_index === idx);
    const choice = step.choices.find((c) => c.id === picked?.choice_id);
    if (choice?.safe) {
      safeCount += 1;
      tacticsMastered.push(step.tactic_tag);
    } else {
      improvements.push(
        choice?.feedback ??
          `Review how to handle ${step.tactic_tag}: never comply under urgency or secrecy.`
      );
    }
  });

  const totalSteps = scenario.steps.length;
  const score = totalSteps > 0 ? Math.round((safeCount / totalSteps) * 100) : 0;

  return {
    scenario_id: scenario.id,
    scenario_title: scenario.title,
    score,
    total_steps: totalSteps,
    safe_decisions: safeCount,
    tactics_mastered: tacticsMastered,
    improvements:
      improvements.length > 0
        ? improvements
        : ['Strong performance! Continue pausing, hanging up, and verifying with family.'],
    conversational_agent_isolated_from_live_guard: true,
    conversational_agent_mode: process.env.ELEVENLABS_DRILL_AGENT_ID
      ? 'LIVE'
      : 'MOCK',
  };
}
