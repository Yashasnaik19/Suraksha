import {
  checkUrlStaticIntel,
  evaluateTranscriptDeterministic,
} from './ruleEngine';
import { MessageLinkCheckResult, TranscriptLine } from './types';

export function inspectSuspiciousMessageOrLink(params: {
  message_text?: string;
  url_input?: string;
}): MessageLinkCheckResult {
  const messageText = (params.message_text ?? '').trim();
  const explicitUrl = (params.url_input ?? '').trim();
  const combined = [messageText, explicitUrl].filter(Boolean).join(' ');

  const fakeLine: TranscriptLine = {
    id: 'msg-check-1',
    session_id: 'secondary-check',
    speaker: 'Caller',
    text: combined,
    english_subtitle: combined,
    hindi_subtitle: combined,
    timestamp: new Date().toISOString(),
    elapsed: '00:00',
    source: 'scribe_scripted',
  };

  const ruleResult = evaluateTranscriptDeterministic([fakeLine], 1);
  const extractedUrls = new Set<string>(ruleResult.extracted_urls);

  if (explicitUrl) {
    const normalized = /^https?:\/\//i.test(explicitUrl)
      ? explicitUrl
      : `https://${explicitUrl}`;
    extractedUrls.add(normalized);
  }

  const urls_analyzed = Array.from(extractedUrls).map((u) =>
    checkUrlStaticIntel(u)
  );

  const hasSuspiciousDomain = urls_analyzed.some(
    (u) => u.verdict === 'SUSPICIOUS_DOMAIN'
  );
  const score = Math.min(
    100,
    ruleResult.risk_score + (hasSuspiciousDomain ? 40 : urls_analyzed.length * 20)
  );

  let verdict = ruleResult.risk_level;
  if (hasSuspiciousDomain || score >= 60) {
    verdict = 'High Risk';
  } else if (urls_analyzed.length > 0 || ruleResult.detected_signals.length > 0) {
    verdict = 'Suspicious (Ask Family)';
  }

  const explanation =
    verdict === 'High Risk'
      ? `Static inspection flagged ${ruleResult.detected_signals.length > 0 ? ruleResult.detected_signals.join(', ') : 'suspicious domain patterns'}. Do not open the link, enter OTP/PIN, or pay.`
      : verdict === 'Suspicious (Ask Family)'
        ? 'Contains an unverified external link or pressure cue. Verify independently with a family member or official bank number before acting.'
        : 'No known red flags matched in static rules, but never assume a link or payment request is safe—never share OTP, PIN, or UPI approval.';

  const recommended_action =
    verdict === 'No Known Red Flags (never share OTP/PIN)'
      ? 'Verify sender via official helpline before trusting.'
      : 'Do not click the link. Delete the message and inform a trusted family member.';

  return {
    checked_at: new Date().toISOString(),
    verdict,
    risk_score: score,
    detected_categories: ruleResult.detected_categories,
    detected_signals: ruleResult.detected_signals,
    urls_analyzed,
    explanation,
    never_fetched_or_clicked: true,
    recommended_action,
  };
}
