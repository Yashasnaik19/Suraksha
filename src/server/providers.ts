import {
  AuditEventModel,
  IntegrationHealthState,
  IntegrationMode,
  RiskLevel,
  ScamSignalType,
  TranscriptLine,
  UrlCheckResult,
  VoiceClipStatus,
} from './types';

export interface SpeechToTextProvider {
  readonly providerName: string;
  getMode(): IntegrationMode;
  getHealthState(): IntegrationHealthState;
  getModelName(): string;
  createRealtimeSessionConfig(): Promise<{
    mode: IntegrationMode;
    model: string;
    websocket_url: string;
    note: string;
  }>;
}

export interface TextToSpeechProvider {
  readonly providerName: string;
  getMode(): IntegrationMode;
  getHealthState(): IntegrationHealthState;
  triggerPreGeneratedClip(playbook: string | null): Promise<VoiceClipStatus>;
  fetchLivePreGeneratedClipAudio(clipId: string): Promise<ArrayBuffer | null>;
}

export interface LLMProvider {
  readonly providerName: string;
  getMode(): IntegrationMode;
  getHealthState(): IntegrationHealthState;
  generateExplanation(params: {
    signals: ScamSignalType[];
    playbook: string | null;
    transcript: TranscriptLine[];
    simulationMode?: 'normal' | 'timeout' | 'unavailable';
    timeoutMs?: number;
  }): Promise<{
    explanation: string;
    hindi_script: string;
    source: 'BEDROCK_LIVE' | 'BEDROCK_FALLBACK';
    mode: IntegrationMode;
    fallback_reason?: string;
  }>;
}

export interface NotificationProvider {
  readonly providerName: string;
  getMode(): IntegrationMode;
  getHealthState(): IntegrationHealthState;
  publishGuardianAlert(params: {
    alert_id: string;
    risk_level: RiskLevel;
    timestamp: string;
    short_explanation: string;
    dashboard_ref: string;
  }): Promise<{
    notification_id: string;
    mode: IntegrationMode;
    dispatched: boolean;
  }>;
}

export interface GatewayProvider {
  getMode(): IntegrationMode;
  getHealthState(): IntegrationHealthState;
}

export interface AuditStorageProvider {
  getDynamoMode(): IntegrationMode;
  getS3LockMode(): IntegrationMode;
  appendEvent(params: {
    alert_id: string;
    event_type: string;
    actor: string;
    action: string;
    outcome: 'ALLOW' | 'DENY' | 'INFO' | 'FALLBACK';
    metadata?: Record<string, unknown>;
  }): Promise<AuditEventModel>;
  getAllEvents(): AuditEventModel[];
  verifyChainIntegrity(eventsToCheck?: AuditEventModel[]): {
    valid: boolean;
    checked_count: number;
    broken_at_seq: number | null;
    reason?: string;
  };
}

export interface ThreatIntelligenceProvider {
  readonly providerName: string;
  getMode(): IntegrationMode;
  getHealthState(): IntegrationHealthState;
  checkUrl(url: string): UrlCheckResult;
}
