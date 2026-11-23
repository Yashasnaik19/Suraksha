import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  KeyRound,
  Mic,
  MicOff,
  PhoneCall,
  Send,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import { ScenarioDefinition, SystemStateSnapshot } from '../server/types';

interface ParentDeviceViewProps {
  snapshot: SystemStateSnapshot;
  scenarios: ScenarioDefinition[];
  language: 'en' | 'hi';
  onApprove: () => void;
  onDeny: () => void;
  onVoiceUtteranceApproval?: (utterance: string) => Promise<{
    accepted: boolean;
    message: string;
  }>;
  onSendCustomUtterance: (text: string) => void;
}

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResult>;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function ParentDeviceView({
  snapshot,
  scenarios,
  language,
  onApprove,
  onDeny,
  onVoiceUtteranceApproval,
  onSendCustomUtterance,
}: ParentDeviceViewProps) {
  const scenario =
    scenarios.find((s) => s.id === snapshot.active_scenario_id) ?? scenarios[0];
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [approvalSpeechInput, setApprovalSpeechInput] = useState('');
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null);
  const [browserVoiceStatus, setBrowserVoiceStatus] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [snapshot.transcript.length, snapshot.voice_clip?.clip_id]);

  const playBrowserSpeechFallback = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setBrowserVoiceStatus('Browser speech synthesis unavailable; captions shown.');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'hi-IN';
      utterance.rate = 0.95;
      utterance.onstart = () =>
        setBrowserVoiceStatus('Playing pre-approved script (echo suppression active)');
      utterance.onend = () =>
        setBrowserVoiceStatus('Playback complete · Mic resumed');
      window.speechSynthesis.speak(utterance);
    } catch {
      setBrowserVoiceStatus('Captions mode active.');
    }
  };

  const toggleMicrophone = () => {
    if (micActive) {
      recognitionRef.current?.stop();
      setMicActive(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) {
      setMicNote(
        'Browser speech recognition unavailable here; type a spoken phrase below to stream into Scribe.'
      );
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        if (last && last.isFinal) {
          const spoken = last[0]?.transcript?.trim();
          if (spoken) {
            if (
              snapshot.lifecycle_state === 'AWAITING_APPROVAL' &&
              onVoiceUtteranceApproval
            ) {
              void onVoiceUtteranceApproval(spoken).then((res) =>
                setApprovalFeedback(res.message)
              );
            } else {
              onSendCustomUtterance(spoken);
            }
          }
        }
      };
      rec.onerror = () => {
        setMicActive(false);
        setMicNote(
          'Microphone permission blocked or unavailable; use phrase input below.'
        );
      };
      rec.onend = () => {
        setMicActive(false);
      };
      recognitionRef.current = rec;
      rec.start();
      setMicActive(true);
      setMicNote('Listening via browser microphone...');
    } catch {
      setMicNote('Could not start microphone; use phrase input below.');
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = customInput.trim();
    if (!text) return;
    onSendCustomUtterance(text);
    setCustomInput('');
  };

  const handleVoiceApprovalTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onVoiceUtteranceApproval || !approvalSpeechInput.trim()) return;
    const res = await onVoiceUtteranceApproval(approvalSpeechInput.trim());
    setApprovalFeedback(res.message);
    if (res.accepted) {
      setApprovalSpeechInput('');
    }
  };

  const alert = snapshot.active_alert;
  const isListening =
    snapshot.lifecycle_state !== 'IDLE' &&
    snapshot.lifecycle_state !== 'DENIED' &&
    snapshot.lifecycle_state !== 'EVIDENCE_READY';

  return (
    <section
      aria-labelledby="parent-device-heading"
      className="bg-white border border-slate-200 rounded-lg flex flex-col h-full min-w-0"
    >
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="parent-device-heading"
          className="text-sm font-semibold text-slate-900"
        >
          Parent Device · Speaker / Merged Call
        </h2>
        <span className="text-xs text-slate-500">
          Echo Prevention Ready
        </span>
      </div>

      <div className="p-4 flex-1 flex flex-col items-center gap-4">
        <div className="w-full max-w-[400px] bg-slate-900 rounded-2xl p-3 border border-slate-800 flex-1 flex flex-col">
          <div className="bg-slate-50 rounded-xl flex-1 flex flex-col overflow-hidden border border-slate-700/40">
            {/* Call Header */}
            <div className="bg-white px-4 py-3 border-b border-slate-200 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <PhoneCall
                    className="w-4 h-4 text-slate-700 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-xs font-semibold text-slate-900 truncate">
                    {scenario?.caller_label ?? 'Incoming Call on Speaker'}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                  {snapshot.lifecycle_state}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border ${
                    isListening
                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {isListening
                    ? 'Scribe v2 Streaming Active'
                    : 'Call on speaker / merged call'}
                </span>

                <button
                  type="button"
                  onClick={toggleMicrophone}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    micActive
                      ? 'bg-red-50 text-red-900 border-red-300'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {micActive ? (
                    <MicOff className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {micActive ? 'Stop Mic' : 'Live Mic'}
                </button>
              </div>
              {micNote && (
                <p className="text-[11px] text-slate-600">{micNote}</p>
              )}
            </div>

            {/* Live Transcript */}
            <div
              ref={scrollRef}
              className="p-3.5 flex-1 space-y-2.5 overflow-y-auto max-h-[340px]"
            >
              {snapshot.transcript.length === 0 ? (
                <div className="py-8 text-center px-3 space-y-2">
                  <p className="text-sm font-medium text-slate-700">
                    Ready to monitor incoming speaker call.
                  </p>
                  <p className="text-xs text-slate-500">
                    Click Start Call or Step above, or type a spoken caller line
                    below.
                  </p>
                </div>
              ) : (
                snapshot.transcript.map((line) => {
                  const isGuardian = line.speaker === 'Suraksha';
                  const sub =
                    language === 'hi'
                      ? line.hindi_subtitle
                      : line.english_subtitle;
                  return (
                    <div
                      key={line.id}
                      className={`p-3 rounded-lg border ${
                        isGuardian
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                        <span className="font-semibold text-slate-800">
                          {isGuardian ? 'Suraksha (Family Voice)' : line.speaker}
                          {line.echo_suppressed ? ' · Echo Muted' : ''}
                        </span>
                        <span className="font-mono tabular-nums">
                          {line.elapsed}
                        </span>
                      </div>
                      <p className="text-sm sm:text-base font-semibold text-slate-900 leading-snug">
                        {line.text}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        {sub}
                      </p>
                    </div>
                  );
                })
              )}

              {/* Real-time Rule Engine Alert Banner (Amber) */}
              {alert && (
                <div
                  data-testid="parent-risk-alert"
                  className="p-3 bg-amber-50 border border-amber-300 rounded-lg space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-950">
                      <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                      Rule Engine: {alert.risk_level}
                    </span>
                    <span className="text-[11px] font-mono text-amber-900 tabular-nums">
                      Score {alert.risk_score}
                    </span>
                  </div>
                  <div className="text-[11px] text-amber-950 leading-relaxed">
                    {alert.detected_signals.join(' · ')}
                  </div>
                </div>
              )}

              {/* Pre-generated Family Voice Clip Status (ElevenLabs TTS) */}
              {snapshot.voice_clip && (
                <div
                  data-testid="voice-clip-status"
                  className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-blue-950">
                    <span className="inline-flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      {snapshot.voice_clip.label}
                    </span>
                    <span className="font-mono text-[10px]">
                      {snapshot.voice_clip.mode}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-blue-950">
                    &ldquo;Kya main Ansh ko abhi bula loon?&rdquo;
                  </p>
                  <p className="text-[11px] text-blue-900">
                    {snapshot.voice_clip.consented_by} · Echo suppressed during playback ·{' '}
                    {snapshot.voice_clip.audio_url
                      ? 'Audio clip ready'
                      : 'Browser TTS fallback / Captions'}
                  </p>
                  {snapshot.voice_clip.audio_url ? (
                    <audio
                      controls
                      autoPlay
                      src={snapshot.voice_clip.audio_url}
                      className="w-full h-8 mt-1"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        playBrowserSpeechFallback(snapshot.voice_clip!.transcript)
                      }
                      className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-blue-300 text-blue-900 rounded hover:bg-blue-100 cursor-pointer whitespace-nowrap"
                    >
                      Play Voice Prompt (Browser Fallback)
                    </button>
                  )}
                  {browserVoiceStatus && (
                    <p className="text-[11px] text-blue-900">{browserVoiceStatus}</p>
                  )}
                </div>
              )}
            </div>

            {/* Optional Custom / Mic Utterance Bar */}
            <form
              onSubmit={handleCustomSubmit}
              className="px-3 py-2 bg-slate-100 border-t border-slate-200 flex items-center gap-2"
            >
              <label htmlFor="custom-utterance" className="sr-only">
                Simulate spoken caller phrase
              </label>
              <input
                id="custom-utterance"
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Type caller speech (e.g. Share OTP now)..."
                className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded text-slate-900"
              />
              <button
                type="submit"
                aria-label="Send spoken line to Scribe"
                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded inline-flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                Send
              </button>
            </form>

            {/* Approval Interaction ("Haan" / "Nahi") & Masked Token Status */}
            <div className="p-3.5 bg-white border-t border-slate-200 space-y-2.5">
              {snapshot.blocked_banner && (
                <div
                  data-testid="parent-blocked-banner"
                  className="p-2.5 bg-red-50 border border-red-300 rounded text-xs text-red-900 font-medium"
                >
                  Policy Blocked: {snapshot.blocked_banner}
                </div>
              )}

              {snapshot.lifecycle_state === 'AWAITING_APPROVAL' ? (
                <div className="space-y-2.5">
                  <p className="text-sm font-semibold text-slate-900 text-center">
                    {language === 'hi'
                      ? 'Kya main Ansh ko abhi bula loon? (हाँ बोलें या दबाएँ)'
                      : 'Kya main Ansh ko abhi bula loon? Tap Haan to alert family.'}
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={onApprove}
                      className="min-h-[52px] px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer"
                    >
                      <span className="text-base font-bold">Haan</span>
                      <span className="text-[11px] text-blue-100">
                        Approve Alert
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={onDeny}
                      className="min-h-[52px] px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-900 rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer"
                    >
                      <span className="text-base font-bold">Nahi</span>
                      <span className="text-[11px] text-slate-700">
                        Do Not Alert
                      </span>
                    </button>
                  </div>

                  {onVoiceUtteranceApproval && (
                    <form
                      onSubmit={handleVoiceApprovalTest}
                      className="flex items-center gap-1.5 pt-1"
                    >
                      <input
                        type="text"
                        value={approvalSpeechInput}
                        onChange={(e) => setApprovalSpeechInput(e.target.value)}
                        placeholder='Spoken response ("haan" or test ambiguous)...'
                        className="flex-1 min-w-0 px-2 py-1 text-[11px] bg-slate-50 border border-slate-300 rounded text-slate-900"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 text-white rounded hover:bg-slate-900 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Verify Voice
                      </button>
                    </form>
                  )}
                  {approvalFeedback && (
                    <p className="text-[11px] text-slate-700 font-medium">
                      {approvalFeedback}
                    </p>
                  )}
                </div>
              ) : snapshot.active_approval ? (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-emerald-950">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                      Parent Approved (&ldquo;Haan&rdquo;)
                    </span>
                    <span className="font-mono text-[11px]">
                      Token {snapshot.active_approval.status}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-emerald-900 flex items-center gap-1.5 break-all">
                    <KeyRound className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>
                      {snapshot.active_approval.token_id} · nonce{' '}
                      {snapshot.active_approval.nonce_preview} · bound to{' '}
                      {snapshot.active_approval.alert_id}
                    </span>
                  </div>
                </div>
              ) : snapshot.lifecycle_state === 'DENIED' ? (
                <div className="p-2.5 bg-slate-100 border border-slate-300 rounded-lg text-xs text-slate-800">
                  Parent declined (&ldquo;Nahi&rdquo;). Family was not notified;
                  staying on the line calmly.
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center">
                  Family MCP actions remain locked until parent approves with Haan.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
