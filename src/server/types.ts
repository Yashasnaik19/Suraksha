export type RiskLevel =
  | 'High Risk'
  | 'Suspicious (Ask Family)'
  | 'No Known Red Flags (never share OTP/PIN)';

export type SessionLifecycleState =
  | 'IDLE'
  | 'LISTENING'
  | 'SIGNAL_DETECTED'
  | 'INTERRUPTING'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'DENIED'
  | 'BLOCKED'
  | 'FAMILY_ALERTED'
  | 'EVIDENCE_READY';

export type ScamSignalType =
  | 'Requests for OTP or PIN'
  | 'Urgent payment demands'
  | 'Impersonation of government officials'
  | 'Threats involving account blocking or arrest'
  | 'Requests to install remote-access applications'
  | 'Suspicious payment or UPI instructions'
  | 'Requests to click suspicious links'
  | 'Attempts to create panic or force secrecy';

export type ScamRuleCategory =
  | 'ISOLATION'
  | 'FAKE_AUTHORITY'
  | 'THREATS'
  | 'URGENCY'
  | 'MONEY_AND_CREDENTIALS'
  | 'REMOTE_ACCESS';

export type McpServerGroup = 'Listen' | 'Scam-Intel' | 'Family' | 'Audit';

export type McpToolName =
  | 'get_transcript_window'
  | 'match_scam_playbook'
  | 'score_signals'
  | 'check_url'
  | 'prepare_evidence_pack'
  | 'alert_guardians'
  | 'send_family_voice_message'
  | 'append_event';

export type IntegrationMode = 'LIVE' | 'LOCAL_MOCK';

export type IntegrationHealthState =
  | 'MOCK'
  | 'LIVE'
  | 'PENDING CONFIGURATION'
  | 'CONNECTION FAILED';

export interface IntegrationStatus {
  name: string;
  key:
    | 'elevenlabs_scribe'
    | 'elevenlabs_tts'
    | 'bedrock'
    | 'orchestrator_lambda'
    | 'cognito'
    | 'agentcore_gateway'
    | 'lambda_interceptor'
    | 'cedar_policy'
    | 'sns'
    | 'dynamodb'
    | 's3_object_lock'
    | 'threat_intel';
  mode: IntegrationMode;
  configured_mode: 'MOCK' | 'LIVE';
  health: IntegrationHealthState;
  status: 'READY' | 'ACTIVE' | 'DEGRADED' | 'SIMULATED';
  required_env: string[];
  missing_env: string[];
  last_checked_at: string;
  detail: string;
}

export interface TranscriptLine {
  id: string;
  session_id: string;
  speaker: 'Caller' | 'Suraksha' | 'Parent';
  text: string;
  english_subtitle: string;
  hindi_subtitle: string;
  timestamp: string;
  elapsed: string;
  source: 'scribe_scripted' | 'scribe_microphone';
  echo_suppressed?: boolean;
}

export interface UrlCheckResult {
  url: string;
  verdict: 'SUSPICIOUS_DOMAIN' | 'UNVERIFIED_EXTERNAL' | 'NO_KNOWN_FLAG';
  risk_label: RiskLevel;
  reason: string;
  note: 'Static threat-intel check only; URL never fetched or clicked';
}

export interface AlertModel {
  alert_id: string;
  session_id: string;
  created_at: string;
  risk_level: RiskLevel;
  risk_score: number;
  detected_signals: ScamSignalType[];
  detected_categories: ScamRuleCategory[];
  rules_fired: string[];
  matched_playbook: string | null;
  url_check_results: UrlCheckResult[];
  transcript_excerpt: TranscriptLine[];
  rolling_window: TranscriptLine[];
  explanation: string;
  explanation_source: 'BEDROCK_LIVE' | 'BEDROCK_FALLBACK' | 'PENDING';
  hindi_script: string;
  rule_version: string;
  approval_status:
    | 'PENDING'
    | 'AWAITING_PARENT_HAAN'
    | 'APPROVED'
    | 'DECLINED_NAHI'
    | 'BLOCKED_BY_POLICY';
  guardian_notification_status:
    | 'NOT_SENT'
    | 'DISPATCHED_LIVE_SNS'
    | 'DISPATCHED_MOCK_SNS'
    | 'BLOCKED';
  evidence_pack_id: string | null;
}

export interface ApprovalRecordInternal {
  token_id: string;
  alert_id: string;
  approver_id: string;
  permitted_actions: McpToolName[];
  issued_at: string;
  expires_at: string;
  nonce: string;
  signature: string;
  used_at: string | null;
  status: 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';
}

export interface PublicApprovalSummary {
  token_id: string;
  alert_id: string;
  approver_id: string;
  permitted_actions: McpToolName[];
  issued_at: string;
  expires_at: string;
  nonce_preview: string;
  signature_preview: string;
  used_at: string | null;
  status: 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';
}

export interface AuditEventModel {
  event_id: string;
  seq: number;
  alert_id: string;
  event_type: string;
  timestamp: string;
  actor: string;
  action: string;
  outcome: 'ALLOW' | 'DENY' | 'INFO' | 'FALLBACK';
  metadata: Record<string, unknown>;
  previous_hash: string;
  event_hash: string;
  storage_mode: IntegrationMode;
}

export interface EvidencePackModel {
  evidence_pack_id: string;
  alert_id: string;
  created_at: string;
  call_timestamps: {
    started_at: string;
    flagged_at: string;
    generated_at: string;
  };
  transcript_window: TranscriptLine[];
  scam_indicators: ScamSignalType[];
  scam_categories: ScamRuleCategory[];
  matched_playbook: string | null;
  URL_check_results: UrlCheckResult[];
  risk_verdict: RiskLevel;
  explanation: string;
  event_timeline: Array<{
    seq: number;
    timestamp: string;
    event_type: string;
    actor: string;
    outcome: string;
  }>;
  integrity_hash: string;
  manual_submission_status: 'READY_FOR_MANUAL_SUBMISSION';
  manual_submission_banner: 'EVIDENCE READY – MANUAL FAMILY SUBMISSION REQUIRED';
  manual_channels: ['Chakshu', '1930', 'cybercrime.gov.in'];
  auto_submitted: false;
  handoff_instructions: string[];
}

export interface GatewayTraceItem {
  trace_id: string;
  timestamp: string;
  alert_id: string;
  server: McpServerGroup;
  tool: McpToolName;
  tier: 'Tier 1' | 'Tier 2' | 'Audit';
  interceptor_checks: {
    cognito_authorizer: 'PASS' | 'FAIL';
    signature_valid: boolean;
    not_expired: boolean;
    alert_id_match: boolean;
    one_time_unused: boolean;
    scope_authorized: boolean;
  };
  cedar_decision: 'ALLOW' | 'DENY';
  cedar_policy_rule: string;
  reason: string;
  redacted_inputs: Record<string, unknown>;
  mode: IntegrationMode;
}

export interface VoiceClipStatus {
  clip_id: string;
  label: string;
  transcript: string;
  hindi_subtitle: string;
  english_subtitle: string;
  triggered_at: string;
  mode: IntegrationMode;
  audio_url: string | null;
  pre_generated_only: true;
  consent_verified: true;
  consented_by: string;
  echo_suppressed: boolean;
}

export interface McpToolSchemaSummary {
  server: McpServerGroup;
  tier: 'Tier 1' | 'Tier 2' | 'Audit';
  tool: McpToolName;
  description: string;
  requires_approval_token: boolean;
  input_schema: Record<string, unknown>;
}

export interface ScenarioLine {
  speaker: 'Caller' | 'Suraksha';
  text: string;
  english_subtitle: string;
  hindi_subtitle: string;
  elapsed: string;
}

export interface ScenarioDefinition {
  id: string;
  title: string;
  category: string;
  summary: string;
  caller_label: string;
  lines: ScenarioLine[];
}

export type PolicyTestScenario =
  | 'missing_token'
  | 'expired_token'
  | 'invalid_signature'
  | 'wrong_alert_id'
  | 'reused_token'
  | 'tampered_token'
  | 'unauthorized_family_action';

export interface MessageLinkCheckResult {
  checked_at: string;
  verdict: RiskLevel;
  risk_score: number;
  detected_categories: ScamRuleCategory[];
  detected_signals: ScamSignalType[];
  urls_analyzed: UrlCheckResult[];
  explanation: string;
  never_fetched_or_clicked: true;
  recommended_action: string;
}

export interface SystemStateSnapshot {
  session_id: string;
  lifecycle_state: SessionLifecycleState;
  active_scenario_id: string;
  input_mode: 'scripted' | 'microphone';
  bedrock_simulation_mode: 'normal' | 'timeout' | 'unavailable';
  echo_suppression_active: boolean;
  active_alert: AlertModel | null;
  alert_history: AlertModel[];
  transcript: TranscriptLine[];
  rolling_window: TranscriptLine[];
  active_approval: PublicApprovalSummary | null;
  approval_history: PublicApprovalSummary[];
  voice_clip: VoiceClipStatus | null;
  gateway_traces: GatewayTraceItem[];
  audit_events: AuditEventModel[];
  audit_chain_valid: boolean;
  evidence_pack: EvidencePackModel | null;
  sns_notifications: Array<{
    notification_id: string;
    alert_id: string;
    risk_level: RiskLevel;
    timestamp: string;
    short_explanation: string;
    dashboard_ref: string;
    mode: IntegrationMode;
  }>;
  integrations: IntegrationStatus[];
  mcp_catalog: McpToolSchemaSummary[];
  cedar_policy_text: string;
  tier3_prohibitions: string[];
  blocked_banner: string | null;
}
