export type SurakshaState =
  | 'IDLE'
  | 'LISTENING'
  | 'SIGNAL_DETECTED'
  | 'INTERRUPTING'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'DENIED'
  | 'FAMILY_ALERTED'
  | 'EVIDENCE_READY';

export type PipelineNodeId =
  | 'call_audio'
  | 'streaming_stt'
  | 'detection'
  | 'orchestrator'
  | 'policy_gateway'
  | 'family_alert'
  | 'audit_log';

export type SubtitleLanguage = 'en' | 'hi';

export type DetectionSignalCategory =
  | 'Authority impersonation'
  | 'Arrest/legal threat'
  | 'Isolation/secrecy'
  | 'Urgency'
  | 'Money/credential ask';

export type AllowedVerdict =
  | 'High Risk'
  | 'Suspicious (Ask Family)'
  | 'No Known Red Flags (never share OTP/PIN)';

export type McpServerName = 'Listen' | 'Scam-Intel' | 'Family' | 'Audit';

export type McpTier =
  | 'Tier 1 (Read-Only)'
  | 'Tier 1 (No External Side Effects)'
  | 'Tier 2 (Approval Required)'
  | 'Tier 2/3 (Append-Only)';

export type McpToolName =
  | 'get_transcript_window'
  | 'list_flagged_emails'
  | 'get_email'
  | 'match_scam_playbook'
  | 'score_signals'
  | 'check_url'
  | 'check_domain_age'
  | 'prepare_evidence_pack'
  | 'alert_guardians'
  | 'send_family_voice_message'
  | 'append_event';

export interface McpServerDefinition {
  name: McpServerName;
  tier: McpTier;
  description: string;
  tools: McpToolName[];
}

export interface TranscriptSegment {
  id: string;
  stepIndex: number;
  speaker: 'Scammer' | 'Suraksha';
  text: string;
  subtitleEn: string;
  subtitleHi: string;
  timestamp: string;
  delayMs: number;
  audioKey?: string;
}

export interface DetectionResult {
  verdict: AllowedVerdict;
  signals: DetectionSignalCategory[];
  rulesFired: string[];
  llmExplanation: string;
  shouldInterrupt: boolean;
  playbookMatched: string | null;
}

export interface ApprovalToken {
  tokenId: string;
  alertId: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
  scope: 'Family.alert_guardians';
  issuedBy: 'ParentConsentUI';
}

export interface McpToolInvocationRequest {
  server: McpServerName;
  tool: McpToolName;
  inputs: Record<string, unknown>;
  approval_token?: ApprovalToken | null;
  alert_id?: string;
}

export interface McpToolCallRecord {
  id: string;
  timestamp: string;
  server: McpServerName;
  tool: McpToolName;
  tier: McpTier;
  redactedInputs: Record<string, unknown>;
  decision: 'ALLOW' | 'DENY';
  reason: string;
  simulated: true;
  alertId?: string;
}

export interface ApprovalHistoryItem {
  id: string;
  alertId: string;
  timestamp: string;
  outcome: 'APPROVED' | 'DENIED' | 'GATEWAY_DENIED';
  parentResponse: string;
  tokenId: string | null;
  note: string;
}

export interface AuditEntry {
  seq: number;
  id: string;
  timestamp: string;
  eventType: string;
  actor: string;
  summary: string;
  prevHash: string;
  hash: string;
  computedLocally: true;
}

export interface EvidencePack {
  alertId: string;
  generatedAt: string;
  category: string;
  verdict: AllowedVerdict;
  callerNumberPlaceholder: string;
  signals: DetectionSignalCategory[];
  transcriptExcerpt: Array<{
    timestamp: string;
    speaker: string;
    text: string;
  }>;
  submissionNote: string;
}

export const TIER_3_PROHIBITIONS: readonly string[] = [
  'Never replies to scammers',
  'Never clicks untrusted links',
  'Never touches UPI/banking',
  'Never auto-submits reports',
];

export const MCP_SERVER_CATALOG: readonly McpServerDefinition[] = [
  {
    name: 'Listen',
    tier: 'Tier 1 (Read-Only)',
    description: 'Reads rolling transcript windows and flagged email context.',
    tools: ['get_transcript_window', 'list_flagged_emails', 'get_email'],
  },
  {
    name: 'Scam-Intel',
    tier: 'Tier 1 (No External Side Effects)',
    description: 'Runs deterministic playbooks, signal scoring, URL checks, and drafts evidence.',
    tools: [
      'match_scam_playbook',
      'score_signals',
      'check_url',
      'check_domain_age',
      'prepare_evidence_pack',
    ],
  },
  {
    name: 'Family',
    tier: 'Tier 2 (Approval Required)',
    description: 'Contacts trusted family guardians only with a valid bound approval_token.',
    tools: ['alert_guardians', 'send_family_voice_message'],
  },
  {
    name: 'Audit',
    tier: 'Tier 2/3 (Append-Only)',
    description: 'Records tamper-evident hash-chained events locally.',
    tools: ['append_event'],
  },
];
