import { useEffect, useRef } from 'react';
import { Mic, PhoneCall, ShieldCheck, Volume2 } from 'lucide-react';
import {
  DetectionResult,
  SubtitleLanguage,
  SurakshaState,
  TranscriptSegment,
} from '../adapters/types';
import { VoicePlaybackResult } from '../adapters/VoicePlayer';

interface ParentPhonePanelProps {
  state: SurakshaState;
  language: SubtitleLanguage;
  segments: TranscriptSegment[];
  detection: DetectionResult;
  currentInterruption: VoicePlaybackResult | null;
  familyNotified: boolean;
  onApprove: () => void;
  onDeny: () => void;
}

const UI_COPY = {
  en: {
    panelTitle: 'Panel A · Parent Phone View',
    inputChannel: 'Call on speaker / merged call',
    idlePrompt: 'Tap Start demo or Step to simulate an incoming speaker call.',
    listeningLabel: 'Listening calmly on speaker',
    detectedBanner: 'Possible Digital Arrest scam detected',
    awaitingPrompt: 'Should Suraksha alert Ansh right now?',
    yesLabel: 'Haan',
    yesSub: 'Alert Ansh',
    noLabel: 'Nahi',
    noSub: 'Do not alert',
    approvedNote: 'Ansh has been alerted. Stay calm and do not share OTP, PIN, or money.',
    deniedNote: 'Family was not alerted. Suraksha stays quietly on the line.',
    voiceAttribution: 'Voice: simulated (production: ElevenLabs)',
  },
  hi: {
    panelTitle: 'पैनल A · पेरेंट फ़ोन व्यू',
    inputChannel: 'Call on speaker / merged call (स्पीकर / मर्ज्ड कॉल)',
    idlePrompt: 'कॉल सिमुलेशन शुरू करने के लिए Start demo या Step दबाएँ।',
    listeningLabel: 'स्पीकर पर शांत निगरानी जारी है',
    detectedBanner: 'संभावित डिजिटल अरेस्ट स्कैम पकड़ा गया',
    awaitingPrompt: 'क्या सुरक्षा अभी अंश को बुलाए?',
    yesLabel: 'Haan (हाँ)',
    yesSub: 'अंश को सूचित करें',
    noLabel: 'Nahi (नहीं)',
    noSub: 'सूचना न भेजें',
    approvedNote: 'अंश को सूचना भेज दी गई है। शांत रहें और OTP, PIN या पैसे साझा न करें।',
    deniedNote: 'परिवार को सूचना नहीं भेजी गई। सुरक्षा लाइन पर शांत बना हुआ है।',
    voiceAttribution: 'Voice: simulated (production: ElevenLabs)',
  },
};

export function ParentPhonePanel({
  state,
  language,
  segments,
  detection,
  currentInterruption,
  familyNotified,
  onApprove,
  onDeny,
}: ParentPhonePanelProps) {
  const copy = UI_COPY[language];
  const isListening =
    state === 'LISTENING' ||
    state === 'SIGNAL_DETECTED' ||
    state === 'INTERRUPTING' ||
    state === 'AWAITING_APPROVAL';
  const showConsentButtons = state === 'AWAITING_APPROVAL';
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [segments.length, currentInterruption]);

  return (
    <section
      aria-labelledby="panel-a-heading"
      className="bg-white border border-slate-200 rounded-lg flex flex-col h-full"
    >
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
        <h2
          id="panel-a-heading"
          className="text-sm font-semibold text-slate-900"
        >
          {copy.panelTitle}
        </h2>
        <span className="text-xs text-slate-500">Calm Assist UI</span>
      </div>

      <div className="p-4 flex-1 flex flex-col items-center">
        {/* Phone Shell */}
        <div className="w-full max-w-[360px] bg-slate-900 rounded-2xl p-3 border border-slate-800 flex-1 flex flex-col">
          <div className="bg-slate-50 rounded-xl flex-1 flex flex-col overflow-hidden border border-slate-700/40">
            {/* Call Source Header */}
            <div className="bg-white px-4 py-3 border-b border-slate-200 space-y-2">
              <div className="flex items-center gap-2 min-w-0">
                <PhoneCall
                  className="w-4 h-4 text-slate-700 shrink-0"
                  aria-hidden="true"
                />
                <span className="text-xs font-semibold text-slate-900 leading-tight">
                  {copy.inputChannel}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  data-testid="listening-indicator"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border ${
                    isListening
                      ? 'bg-blue-50 text-blue-900 border-blue-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {isListening ? copy.listeningLabel : `Status: ${state}`}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                  +91-XXXX-XX-XXXX
                </span>
              </div>
            </div>

            {/* Live Transcript & Signals */}
            <div
              ref={transcriptScrollRef}
              className="p-3.5 flex-1 space-y-2.5 overflow-y-auto max-h-[420px]"
            >
              {segments.length === 0 ? (
                <div className="py-10 text-center px-3">
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {copy.idlePrompt}
                  </p>
                </div>
              ) : (
                segments.map((seg) => {
                  const isGuardian = seg.speaker === 'Suraksha';
                  const subtitle =
                    language === 'hi' ? seg.subtitleHi : seg.subtitleEn;
                  return (
                    <div
                      key={seg.id}
                      className={`p-3 rounded-lg border ${
                        isGuardian
                          ? 'bg-blue-50/70 border-blue-200'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                        <span className="font-semibold text-slate-800">
                          {isGuardian ? 'Suraksha (Family Voice)' : 'Caller'}
                        </span>
                        <span className="font-mono tabular-nums">
                          {seg.timestamp}
                        </span>
                      </div>
                      <p className="text-base font-semibold text-slate-900 leading-snug">
                        {seg.text}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        {subtitle}
                      </p>

                      {seg.id === 'seg-1' && (
                        <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5 text-[11px] font-medium text-amber-900">
                          <span>Signal: Authority impersonation</span>
                        </div>
                      )}
                      {seg.id === 'seg-2' && (
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                          <div className="text-[11px] font-medium text-red-800">
                            Signals: Isolation/secrecy · Arrest/legal threat
                          </div>
                          {detection.rulesFired.length > 0 && (
                            <div className="text-[11px] font-mono text-slate-600">
                              Rules fired: {detection.rulesFired.length} (2+
                              categories co-occurred)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Interruption / Voice Caption Box */}
              {currentInterruption && (
                <div
                  data-testid="interruption-caption"
                  className="p-3 bg-amber-50 border border-amber-300 rounded-lg"
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-amber-950 mb-1">
                    <span className="inline-flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                      {copy.detectedBanner}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900 font-medium">
                    {copy.voiceAttribution} · Mode:{' '}
                    {currentInterruption.mode === 'audio'
                      ? 'Audio playing'
                      : 'Captions only'}
                  </p>
                </div>
              )}
            </div>

            {/* Parent Consent Controls (Haan / Nahi) */}
            <div className="p-4 bg-white border-t border-slate-200">
              {showConsentButtons ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-900 text-center">
                    {copy.awaitingPrompt}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={onApprove}
                      className="min-h-[56px] px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer"
                    >
                      <span className="text-base font-bold leading-tight">
                        {copy.yesLabel}
                      </span>
                      <span className="text-[11px] text-emerald-100">
                        {copy.yesSub}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={onDeny}
                      className="min-h-[56px] px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-900 rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer"
                    >
                      <span className="text-base font-bold leading-tight">
                        {copy.noLabel}
                      </span>
                      <span className="text-[11px] text-slate-700">
                        {copy.noSub}
                      </span>
                    </button>
                  </div>
                </div>
              ) : state === 'APPROVED' ||
                state === 'FAMILY_ALERTED' ||
                state === 'EVIDENCE_READY' ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5">
                  <ShieldCheck
                    className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-xs font-semibold text-emerald-900">
                      {familyNotified
                        ? 'Consent given ("Haan") · Family alerted'
                        : 'Consent given ("Haan") · Dispatching alert'}
                    </p>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      {copy.approvedNote}
                    </p>
                  </div>
                </div>
              ) : state === 'DENIED' ? (
                <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg">
                  <p className="text-xs font-semibold text-slate-900">
                    Consent declined ("Nahi")
                  </p>
                  <p className="text-xs text-slate-700 mt-0.5">
                    {copy.deniedNote}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center">
                  Family alert requires explicit parent consent ("Haan").
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
