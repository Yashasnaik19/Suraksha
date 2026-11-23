import {
  AllowedVerdict,
  DetectionResult,
  DetectionSignalCategory,
  TranscriptSegment,
} from './types';

export interface DetectionEngine {
  readonly productionMapping: string;
  evaluateWindow(segments: TranscriptSegment[]): DetectionResult;
}

interface SignalRule {
  category: DetectionSignalCategory;
  ruleId: string;
  patterns: RegExp[];
}

const SIGNAL_RULES: SignalRule[] = [
  {
    category: 'Authority impersonation',
    ruleId: 'RULE_AUTH_IMPERSONATION',
    patterns: [/\bcbi\b/i, /\bpolice\b/i, /\bcustoms\b/i, /\bed\b/i, /\bparcel pakda\b/i],
  },
  {
    category: 'Arrest/legal threat',
    ruleId: 'RULE_ARREST_THREAT',
    patterns: [/\barrest\b/i, /\bwarrant\b/i, /\bcase\b/i, /\bjail\b/i],
  },
  {
    category: 'Isolation/secrecy',
    ruleId: 'RULE_ISOLATION_SECRECY',
    patterns: [/kisi ko mat batana/i, /video call par rahiye/i, /do not tell anyone/i, /stay on video/i],
  },
  {
    category: 'Urgency',
    ruleId: 'RULE_URGENCY',
    patterns: [/\babhi\b/i, /turant/i, /immediately/i, /within minutes/i],
  },
  {
    category: 'Money/credential ask',
    ruleId: 'RULE_MONEY_CREDENTIAL',
    patterns: [/\botp\b/i, /\bpin\b/i, /\bupi\b/i, /\btransfer\b/i, /\baccount\b/i, /\bpaise\b/i],
  },
];

export class MockDetectionEngine implements DetectionEngine {
  readonly productionMapping = 'Deterministic rules + Amazon Bedrock explanation';

  evaluateWindow(segments: TranscriptSegment[]): DetectionResult {
    const scammerWindow = segments.filter((seg) => seg.speaker === 'Scammer');
    const detected = new Set<DetectionSignalCategory>();
    const rulesFired: string[] = [];

    for (const seg of scammerWindow) {
      const combined = `${seg.text} ${seg.subtitleEn}`;
      for (const rule of SIGNAL_RULES) {
        if (rule.patterns.some((pattern) => pattern.test(combined))) {
          if (!detected.has(rule.category)) {
            detected.add(rule.category);
            rulesFired.push(`${rule.ruleId} (${rule.category})`);
          }
        }
      }
    }

    const signals = Array.from(detected);
    // Fire interruption only when 2+ categories co-occur in the rolling window
    const shouldInterrupt = signals.length >= 2;

    let verdict: AllowedVerdict = 'No Known Red Flags (never share OTP/PIN)';
    let playbookMatched: string | null = null;
    let llmExplanation =
      'No known scam pattern has crossed the 2-signal co-occurrence threshold in the current window. Never share an OTP or PIN.';

    if (shouldInterrupt) {
      verdict = 'High Risk';
      playbookMatched = 'Digital Arrest / Coerced Isolation Playbook';
      llmExplanation =
        'Multiple coercion categories co-occur in the rolling window: the caller claims CBI authority over a seized parcel, enforces secrecy on a video call, and threatens arrest. Real agencies do not conduct arrests over video calls.';
    } else if (signals.length === 1) {
      verdict = 'Suspicious (Ask Family)';
      playbookMatched = 'Unverified Authority Claim (Monitoring)';
      llmExplanation =
        'One signal detected (Authority impersonation). Holding interruption until 2+ signal categories co-occur in the rolling window.';
    }

    return {
      verdict,
      signals,
      rulesFired,
      llmExplanation,
      shouldInterrupt,
      playbookMatched,
    };
  }
}
