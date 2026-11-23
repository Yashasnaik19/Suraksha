import { ThreatIntelligenceProvider } from './providers';
import {
  IntegrationHealthState,
  IntegrationMode,
  RiskLevel,
  ScamRuleCategory,
  ScamSignalType,
  TranscriptLine,
  UrlCheckResult,
} from './types';

export const RULE_ENGINE_VERSION = 'rules-2026.11.v3';
export const HIGH_RISK_THRESHOLD = 60;
export const DEFAULT_ROLLING_WINDOW_LINES = 6; // ~10-20s live call rolling window

export interface RuleDefinition {
  id: string;
  category: ScamRuleCategory;
  signal: ScamSignalType;
  weight: number;
  immediateHighRisk: boolean;
  patterns: RegExp[];
}

export const DETECTION_RULES: RuleDefinition[] = [
  {
    id: 'RULE_OTP_PIN',
    category: 'MONEY_AND_CREDENTIALS',
    signal: 'Requests for OTP or PIN',
    weight: 65,
    immediateHighRisk: true,
    patterns: [
      /\b(?:share|tell|bataiye|batao|send|give|enter|daal)\b.*\b(?:otp|pin|cvv|passcode)\b/i,
      /\b(?:otp|pin|cvv)\b.*\b(?:bataiye|batao|share|send|verify|verification|daal|aaya)\b/i,
      /\b6[- ]?digit\s*(?:otp|code|pin)\b/i,
      /verification code.*\b(?:share|bataiye|tell)\b/i,
    ],
  },
  {
    id: 'RULE_REMOTE_ACCESS',
    category: 'REMOTE_ACCESS',
    signal: 'Requests to install remote-access applications',
    weight: 65,
    immediateHighRisk: true,
    patterns: [
      /\banydesk\b/i,
      /\bteamviewer\b/i,
      /\bquicksupport\b/i,
      /\brustdesk\b/i,
      /screen[- ]?share.*(?:install|code|allow|grant)/i,
      /remote[- ]?access.*(?:app|install|permission)/i,
      /install.*\b(?:anydesk|teamviewer|quicksupport|apk)\b/i,
    ],
  },
  {
    id: 'RULE_URGENT_PAYMENT',
    category: 'URGENCY',
    signal: 'Urgent payment demands',
    weight: 45,
    immediateHighRisk: false,
    patterns: [
      /paise transfer/i,
      /transfer.*(?:now|turant|abhi|immediately)/i,
      /turant.*(?:transfer|pay|bhej)/i,
      /pay immediately/i,
      /send money/i,
      /urgent payment/i,
      /fine bharna/i,
    ],
  },
  {
    id: 'RULE_UPI_INSTRUCTION',
    category: 'MONEY_AND_CREDENTIALS',
    signal: 'Suspicious payment or UPI instructions',
    weight: 45,
    immediateHighRisk: false,
    patterns: [
      /upi pin/i,
      /upi id.*(?:transfer|pay|bhej|send)/i,
      /scan.*qr.*pay/i,
      /qr code.*(?:scan|pay|bhej)/i,
      /collect request.*(?:approve|accept|pin)/i,
      /transfer.*upi/i,
    ],
  },
  {
    id: 'RULE_GOVT_IMPERSONATION',
    category: 'FAKE_AUTHORITY',
    signal: 'Impersonation of government officials',
    weight: 40,
    immediateHighRisk: false,
    patterns: [
      /\b(?:main|this is|speaking from|from)\s+(?:cbi|police|customs|trai|narcotics|cyber cell|rbi)\b/i,
      /\bcbi\b.*(?:se|officer|parcel|warrant|case)/i,
      /\b(?:customs|trai|narcotics|cyber cell)\b.*(?:se|officer|notice|parcel|block)/i,
      /parcel pakda/i,
      /sbi bank account.*(?:block|kyc)/i,
      /officer speaking/i,
    ],
  },
  {
    id: 'RULE_ARREST_OR_BLOCK',
    category: 'THREATS',
    signal: 'Threats involving account blocking or arrest',
    weight: 45,
    immediateHighRisk: false,
    patterns: [
      /\barrest\b/i,
      /\bwarrant\b/i,
      /\bfir\b.*(?:file|register|against|darj)/i,
      /digital arrest/i,
      /account.*(?:block|freeze|band)/i,
      /kyc.*expire/i,
      /connection.*kat/i,
      /bijli connection/i,
      /\bjail\b/i,
    ],
  },
  {
    id: 'RULE_SUSPICIOUS_LINK',
    category: 'REMOTE_ACCESS',
    signal: 'Requests to click suspicious links',
    weight: 40,
    immediateHighRisk: false,
    patterns: [
      /https?:\/\/[^\s]+/i,
      /click.*link/i,
      /link.*kholiye/i,
      /\.apk\b/i,
    ],
  },
  {
    id: 'RULE_PANIC_SECRECY',
    category: 'ISOLATION',
    signal: 'Attempts to create panic or force secrecy',
    weight: 40,
    immediateHighRisk: false,
    patterns: [
      /kisi ko mat batana/i,
      /kisi ko call mat karna/i,
      /do not tell anyone/i,
      /video call par rahiye/i,
      /stay on.*(?:video )?call/i,
      /ghar walon ko mat/i,
      /\bemergency\b.*(?:mat|transfer|turant)/i,
    ],
  },
];

export interface RuleEvaluationResult {
  rule_version: string;
  risk_level: RiskLevel;
  risk_score: number;
  detected_signals: ScamSignalType[];
  detected_categories: ScamRuleCategory[];
  rules_fired: string[];
  matched_playbook: string | null;
  extracted_urls: string[];
  rolling_window_lines: TranscriptLine[];
  should_interrupt: boolean;
}

const URL_REGEX = /https?:\/\/[^\s"'<>]+/gi;

export function extractUrlsFromLines(lines: TranscriptLine[]): string[] {
  const found = new Set<string>();
  for (const line of lines) {
    if (line.speaker !== 'Caller') continue;
    const matches = `${line.text} ${line.english_subtitle}`.match(URL_REGEX);
    if (matches) {
      for (const m of matches) found.add(m);
    }
  }
  return Array.from(found);
}

export class MockThreatIntelProvider implements ThreatIntelligenceProvider {
  readonly providerName = 'Local Static Threat Intelligence';

  getMode(): IntegrationMode {
    return 'LOCAL_MOCK';
  }

  getHealthState(): IntegrationHealthState {
    return 'MOCK';
  }

  checkUrl(url: string): UrlCheckResult {
    return checkUrlStaticIntel(url);
  }
}

export class ConfiguredThreatIntelProvider implements ThreatIntelligenceProvider {
  readonly providerName = 'Configured Threat Intelligence Feed';

  getMode(): IntegrationMode {
    return process.env.SURAKSHA_MODE_THREAT_INTEL === 'LIVE' &&
      Boolean(process.env.THREAT_INTEL_API_KEY)
      ? 'LIVE'
      : 'LOCAL_MOCK';
  }

  getHealthState(): IntegrationHealthState {
    if (process.env.SURAKSHA_MODE_THREAT_INTEL === 'LIVE') {
      return process.env.THREAT_INTEL_API_KEY ? 'LIVE' : 'PENDING CONFIGURATION';
    }
    return 'MOCK';
  }

  checkUrl(url: string): UrlCheckResult {
    return checkUrlStaticIntel(url);
  }
}

export function checkUrlStaticIntel(url: string): UrlCheckResult {
  const lower = url.toLowerCase();
  if (
    lower.includes('kyc') ||
    lower.includes('verify') ||
    lower.includes('bill') ||
    lower.includes('update-pan') ||
    lower.includes('sbi-alert') ||
    lower.includes('.apk') ||
    lower.includes('.example') ||
    lower.includes('bit.ly') ||
    lower.includes('tinyurl')
  ) {
    return {
      url,
      verdict: 'SUSPICIOUS_DOMAIN',
      risk_label: 'High Risk',
      reason:
        'Matches phishing/verification lure pattern, shortener, or unverified APK/billing domain.',
      note: 'Static threat-intel check only; URL never fetched or clicked',
    };
  }
  return {
    url,
    verdict: 'UNVERIFIED_EXTERNAL',
    risk_label: 'Suspicious (Ask Family)',
    reason: 'External URL shared via call/message; treat as untrusted and never open directly.',
    note: 'Static threat-intel check only; URL never fetched or clicked',
  };
}

export function matchScamPlaybook(
  signals: ScamSignalType[]
): string | null {
  const has = (s: ScamSignalType) => signals.includes(s);
  if (
    has('Impersonation of government officials') &&
    (has('Threats involving account blocking or arrest') ||
      has('Attempts to create panic or force secrecy'))
  ) {
    return 'Digital Arrest / Authority Coercion Playbook';
  }
  if (has('Requests to install remote-access applications')) {
    return 'Remote-Access Device Takeover Playbook';
  }
  if (
    has('Requests for OTP or PIN') &&
    has('Threats involving account blocking or arrest')
  ) {
    return 'Bank KYC / OTP Extraction Playbook';
  }
  if (
    has('Suspicious payment or UPI instructions') ||
    has('Urgent payment demands')
  ) {
    return 'Urgent UPI / Coerced Payment Playbook';
  }
  if (signals.length > 0) {
    return 'Unverified Call Risk Pattern';
  }
  return null;
}

export function evaluateTranscriptDeterministic(
  lines: TranscriptLine[],
  windowSize = DEFAULT_ROLLING_WINDOW_LINES
): RuleEvaluationResult {
  // Never process Suraksha's own echo-suppressed playback lines as caller speech
  const callerLines = lines
    .filter((l) => l.speaker === 'Caller' && !l.echo_suppressed)
    .slice(-windowSize);

  const detectedSet = new Set<ScamSignalType>();
  const categorySet = new Set<ScamRuleCategory>();
  const rulesFired: string[] = [];
  let riskScore = 0;
  let immediateTrigger = false;

  for (const line of callerLines) {
    const combined = `${line.text} ${line.english_subtitle}`;
    for (const rule of DETECTION_RULES) {
      if (rule.patterns.some((p) => p.test(combined))) {
        if (!detectedSet.has(rule.signal)) {
          detectedSet.add(rule.signal);
          categorySet.add(rule.category);
          rulesFired.push(`${rule.id} [${rule.category}] (${rule.signal})`);
          riskScore += rule.weight;
          if (rule.immediateHighRisk) {
            immediateTrigger = true;
          }
        }
      }
    }
  }

  riskScore = Math.min(100, riskScore);
  const detected_signals = Array.from(detectedSet);
  const detected_categories = Array.from(categorySet);
  const should_interrupt =
    immediateTrigger ||
    detected_signals.length >= 2 ||
    riskScore >= HIGH_RISK_THRESHOLD;

  let risk_level: RiskLevel = 'No Known Red Flags (never share OTP/PIN)';
  if (should_interrupt) {
    risk_level = 'High Risk';
  } else if (detected_signals.length === 1) {
    risk_level = 'Suspicious (Ask Family)';
  }

  return {
    rule_version: RULE_ENGINE_VERSION,
    risk_level,
    risk_score: riskScore,
    detected_signals,
    detected_categories,
    rules_fired: rulesFired,
    matched_playbook: matchScamPlaybook(detected_signals),
    extracted_urls: extractUrlsFromLines(callerLines),
    rolling_window_lines: callerLines,
    should_interrupt,
  };
}
