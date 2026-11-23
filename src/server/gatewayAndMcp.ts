import crypto from 'node:crypto';
import { AuditStorageAdapter, SnsNotificationAdapter } from './adapters/awsOutput';
import { ApprovalService, SignedApprovalTokenPayload } from './approvalService';
import { evaluateCedarPolicy } from './cedarPolicy';
import { GatewayProvider } from './providers';
import {
  checkUrlStaticIntel,
  evaluateTranscriptDeterministic,
  matchScamPlaybook,
} from './ruleEngine';
import {
  AlertModel,
  AuditEventModel,
  EvidencePackModel,
  GatewayTraceItem,
  IntegrationHealthState,
  IntegrationMode,
  McpServerGroup,
  McpToolName,
  McpToolSchemaSummary,
  ScamSignalType,
  TranscriptLine,
} from './types';

export const MCP_TOOL_CATALOG: McpToolSchemaSummary[] = [
  {
    server: 'Listen',
    tier: 'Tier 1',
    tool: 'get_transcript_window',
    description:
      'Retrieve rolling 10-20s timestamped transcript window associated with an active call session.',
    requires_approval_token: false,
    input_schema: {
      type: 'object',
      required: ['session_id', 'window_size'],
      properties: {
        session_id: { type: 'string' },
        window_size: { type: 'number', minimum: 1, maximum: 20 },
      },
    },
  },
  {
    server: 'Scam-Intel',
    tier: 'Tier 1',
    tool: 'match_scam_playbook',
    description:
      'Match detected scam categories against known fraud playbooks (Digital Arrest, Bank KYC, UPI, Remote Access).',
    requires_approval_token: false,
    input_schema: {
      type: 'object',
      required: ['signals'],
      properties: {
        signals: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    server: 'Scam-Intel',
    tier: 'Tier 1',
    tool: 'score_signals',
    description:
      'Run deterministic weighted scoring over rolling transcript excerpts.',
    requires_approval_token: false,
    input_schema: {
      type: 'object',
      required: ['lines'],
      properties: {
        lines: { type: 'array' },
      },
    },
  },
  {
    server: 'Scam-Intel',
    tier: 'Tier 1',
    tool: 'check_url',
    description:
      'Inspect a URL using static threat-intelligence rules without ever fetching or opening the link.',
    requires_approval_token: false,
    input_schema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', format: 'uri' },
      },
    },
  },
  {
    server: 'Scam-Intel',
    tier: 'Tier 1',
    tool: 'prepare_evidence_pack',
    description:
      'Assemble SHA-256 integrity-hashed Evidence Pack for manual family reporting (never auto-submits).',
    requires_approval_token: false,
    input_schema: {
      type: 'object',
      required: ['alert_id', 'transcript_window'],
      properties: {
        alert_id: { type: 'string' },
        transcript_window: { type: 'array' },
      },
    },
  },
  {
    server: 'Family',
    tier: 'Tier 2',
    tool: 'alert_guardians',
    description:
      'Dispatch family notification via SNS. Requires valid signed, single-use, alert-bound approval_token.',
    requires_approval_token: true,
    input_schema: {
      type: 'object',
      required: ['alert_id', 'approval_token'],
      properties: {
        alert_id: { type: 'string' },
        approval_token: { type: 'string', description: 'HMAC-signed single-use token' },
      },
    },
  },
  {
    server: 'Family',
    tier: 'Tier 2',
    tool: 'send_family_voice_message',
    description:
      'Send consented family voice notification. Requires valid signed, single-use, alert-bound approval_token.',
    requires_approval_token: true,
    input_schema: {
      type: 'object',
      required: ['alert_id', 'recipient', 'approval_token'],
      properties: {
        alert_id: { type: 'string' },
        recipient: { type: 'string' },
        approval_token: { type: 'string' },
      },
    },
  },
  {
    server: 'Audit',
    tier: 'Audit',
    tool: 'append_event',
    description:
      'Append immutable SHA-256 hash-linked audit record. Update and delete operations are prohibited.',
    requires_approval_token: false,
    input_schema: {
      type: 'object',
      required: ['alert_id', 'event_type', 'actor', 'action', 'outcome'],
      properties: {
        alert_id: { type: 'string' },
        event_type: { type: 'string' },
        actor: { type: 'string' },
        action: { type: 'string' },
        outcome: { type: 'string', enum: ['ALLOW', 'DENY', 'INFO', 'FALLBACK'] },
      },
    },
  },
];

export class CognitoAuthorizerAdapter {
  getMode(): IntegrationMode {
    return process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID
      ? 'LIVE'
      : 'LOCAL_MOCK';
  }

  getHealthState(): IntegrationHealthState {
    if (process.env.COGNITO_USER_POOL_ID || process.env.COGNITO_CLIENT_ID) {
      return process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID
        ? 'LIVE'
        : 'PENDING CONFIGURATION';
    }
    return 'MOCK';
  }

  verifyCallerContext(authContext: {
    principal: string;
    cognitoBearerPresent: boolean;
  }): boolean {
    return (
      authContext.cognitoBearerPresent &&
      authContext.principal === 'Orchestrator::suraksha-lambda'
    );
  }
}

export class ListenMcpServer {
  getTranscriptWindow(lines: TranscriptLine[], windowSize = 6): TranscriptLine[] {
    return lines
      .filter((l) => !l.echo_suppressed)
      .slice(-windowSize);
  }
}

export class ScamIntelMcpServer {
  matchPlaybook(signals: ScamSignalType[]) {
    return {
      matched_playbook: matchScamPlaybook(signals),
    };
  }

  scoreSignals(lines: TranscriptLine[]) {
    return evaluateTranscriptDeterministic(lines);
  }

  checkUrl(url: string) {
    return checkUrlStaticIntel(url);
  }

  prepareEvidencePack(params: {
    alert: AlertModel;
    transcript: TranscriptLine[];
    auditEvents?: AuditEventModel[];
    startedAt: string;
  }): EvidencePackModel {
    const generatedAt = new Date().toISOString();
    const payloadToHash = JSON.stringify({
      alert_id: params.alert.alert_id,
      transcript_window: params.transcript,
      scam_indicators: params.alert.detected_signals,
      risk_verdict: params.alert.risk_level,
      url_check_results: params.alert.url_check_results,
    });
    const integrity_hash = crypto
      .createHash('sha256')
      .update(payloadToHash)
      .digest('hex');

    const event_timeline = (params.auditEvents ?? [])
      .filter((e) => e.alert_id === params.alert.alert_id || e.alert_id === 'PENDING')
      .map((e) => ({
        seq: e.seq,
        timestamp: e.timestamp,
        event_type: e.event_type,
        actor: e.actor,
        outcome: e.outcome,
      }));

    return {
      evidence_pack_id: `EVP-${params.alert.alert_id}`,
      alert_id: params.alert.alert_id,
      created_at: generatedAt,
      call_timestamps: {
        started_at: params.startedAt,
        flagged_at: params.alert.created_at,
        generated_at: generatedAt,
      },
      transcript_window: [...params.transcript],
      scam_indicators: [...params.alert.detected_signals],
      scam_categories: [...params.alert.detected_categories],
      matched_playbook: params.alert.matched_playbook,
      URL_check_results: [...params.alert.url_check_results],
      risk_verdict: params.alert.risk_level,
      explanation: params.alert.explanation,
      event_timeline,
      integrity_hash,
      manual_submission_status: 'READY_FOR_MANUAL_SUBMISSION',
      manual_submission_banner: 'EVIDENCE READY – MANUAL FAMILY SUBMISSION REQUIRED',
      manual_channels: ['Chakshu', '1930', 'cybercrime.gov.in'],
      auto_submitted: false,
      handoff_instructions: [
        'Download the Evidence Pack JSON or Printable Report with the SHA-256 integrity hash.',
        'Family manually dials 1930 (National Cyber Crime Helpline) or visits cybercrime.gov.in / Sanchar Saathi Chakshu.',
        'Suraksha never submits complaints automatically.',
      ],
    };
  }
}

export class FamilyMcpServer {
  constructor(private readonly sns: SnsNotificationAdapter) {}

  async alertGuardians(params: {
    alert: AlertModel;
    dashboardRef: string;
  }) {
    return this.sns.publishGuardianAlert({
      alert_id: params.alert.alert_id,
      risk_level: params.alert.risk_level,
      timestamp: new Date().toISOString(),
      short_explanation: params.alert.explanation,
      dashboard_ref: params.dashboardRef,
    });
  }

  async sendFamilyVoiceMessage(params: {
    alert_id: string;
    recipient: string;
    message: string;
  }) {
    return {
      dispatched: true,
      alert_id: params.alert_id,
      recipient: params.recipient,
      message: params.message,
      mode: this.sns.getMode(),
    };
  }
}

export class AuditMcpServer {
  constructor(private readonly storage: AuditStorageAdapter) {}

  // Strictly append-only: no update or delete methods exist
  async appendEvent(params: {
    alert_id: string;
    event_type: string;
    actor: string;
    action: string;
    outcome: 'ALLOW' | 'DENY' | 'INFO' | 'FALLBACK';
    metadata?: Record<string, unknown>;
  }) {
    return this.storage.appendEvent(params);
  }
}

export function redactTraceInputs(
  inputs: Record<string, unknown>
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(inputs)) {
    if (
      k === 'approval_token' ||
      k === 'signature' ||
      k === 'caller_phone' ||
      k === 'transcript_raw'
    ) {
      redacted[k] = '[REDACTED_BY_GATEWAY]';
    } else {
      redacted[k] = v;
    }
  }
  return redacted;
}

export class AgentCoreGateway implements GatewayProvider {
  readonly traces: GatewayTraceItem[] = [];

  constructor(
    private readonly cognito: CognitoAuthorizerAdapter,
    private readonly approvalService: ApprovalService,
    private readonly listenMcp: ListenMcpServer,
    private readonly scamIntelMcp: ScamIntelMcpServer,
    private readonly familyMcp: FamilyMcpServer,
    private readonly auditMcp: AuditMcpServer
  ) {}

  getMode(): IntegrationMode {
    if (process.env.SURAKSHA_MODE_GATEWAY === 'MOCK') return 'LOCAL_MOCK';
    return process.env.AGENTCORE_GATEWAY_URL &&
      process.env.LAMBDA_INTERCEPTOR_ARN
      ? 'LIVE'
      : 'LOCAL_MOCK';
  }

  getHealthState(): IntegrationHealthState {
    if (process.env.SURAKSHA_MODE_GATEWAY === 'MOCK') return 'MOCK';
    if (
      process.env.SURAKSHA_MODE_GATEWAY === 'LIVE' ||
      process.env.AGENTCORE_GATEWAY_URL ||
      process.env.LAMBDA_INTERCEPTOR_ARN
    ) {
      return process.env.AGENTCORE_GATEWAY_URL &&
        process.env.LAMBDA_INTERCEPTOR_ARN
        ? 'LIVE'
        : 'PENDING CONFIGURATION';
    }
    return 'MOCK';
  }

  async execute<T = unknown>(params: {
    principal: string;
    cognitoBearerPresent: boolean;
    server: McpServerGroup;
    tool: McpToolName | string;
    alert_id: string;
    approval_token?: SignedApprovalTokenPayload | null;
    consumeTokenOnAllow?: boolean;
    inputs: Record<string, unknown>;
    invokeHandler: (servers: {
      listen: ListenMcpServer;
      scamIntel: ScamIntelMcpServer;
      family: FamilyMcpServer;
      audit: AuditMcpServer;
    }) => Promise<T> | T;
    now?: Date;
  }): Promise<{
    allowed: boolean;
    blocked: boolean;
    trace: GatewayTraceItem;
    result: T | null;
  }> {
    const now = params.now ?? new Date();
    const cognitoOk = this.cognito.verifyCallerContext({
      principal: params.principal,
      cognitoBearerPresent: params.cognitoBearerPresent,
    });

    const isFamilyTier2 = params.server === 'Family';

    const interceptorChecks = isFamilyTier2
      ? this.approvalService.validateToken({
          token: params.approval_token,
          expectedAlertId: params.alert_id,
          requestedAction: params.tool,
          now,
        })
      : {
          signature_valid: true,
          not_expired: true,
          alert_id_match: true,
          one_time_unused: true,
          scope_authorized: true,
          failure_reasons: [] as string[],
        };

    const cedar = evaluateCedarPolicy({
      principal: params.principal,
      server: params.server,
      action: params.tool,
      cognito_authorized: cognitoOk,
      interceptor: {
        signature_valid: interceptorChecks.signature_valid,
        not_expired: interceptorChecks.not_expired,
        alert_id_match: interceptorChecks.alert_id_match,
        one_time_unused: interceptorChecks.one_time_unused,
        scope_authorized: interceptorChecks.scope_authorized,
      },
    });

    const tier: 'Tier 1' | 'Tier 2' | 'Audit' =
      params.server === 'Family'
        ? 'Tier 2'
        : params.server === 'Audit'
          ? 'Audit'
          : 'Tier 1';

    const trace: GatewayTraceItem = {
      trace_id: `gw_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: now.toISOString(),
      alert_id: params.alert_id,
      server: params.server,
      tool: params.tool as McpToolName,
      tier,
      interceptor_checks: {
        cognito_authorizer: cognitoOk ? 'PASS' : 'FAIL',
        signature_valid: interceptorChecks.signature_valid,
        not_expired: interceptorChecks.not_expired,
        alert_id_match: interceptorChecks.alert_id_match,
        one_time_unused: interceptorChecks.one_time_unused,
        scope_authorized: interceptorChecks.scope_authorized,
      },
      cedar_decision: cedar.decision,
      cedar_policy_rule: cedar.matched_rule,
      reason:
        cedar.decision === 'DENY' && interceptorChecks.failure_reasons.length > 0
          ? `${cedar.reason} Details: ${interceptorChecks.failure_reasons.join('; ')}`
          : cedar.reason,
      redacted_inputs: redactTraceInputs(params.inputs),
      mode: this.getMode(),
    };

    this.traces.unshift(trace);

    if (cedar.decision === 'DENY') {
      await this.auditMcp.appendEvent({
        alert_id: params.alert_id,
        event_type: 'POLICY_GATEWAY_DENIED',
        actor: 'AgentCoreGateway+Cedar',
        action: `${params.server}.${params.tool}`,
        outcome: 'DENY',
        metadata: {
          matched_rule: cedar.matched_rule,
          reason: trace.reason,
          interceptor_checks: trace.interceptor_checks,
        },
      });
      return {
        allowed: false,
        blocked: true,
        trace,
        result: null,
      };
    }

    if (
      isFamilyTier2 &&
      params.approval_token &&
      params.consumeTokenOnAllow !== false
    ) {
      this.approvalService.markTokenUsed(params.approval_token.token_id, now);
    }

    const result = await params.invokeHandler({
      listen: this.listenMcp,
      scamIntel: this.scamIntelMcp,
      family: this.familyMcp,
      audit: this.auditMcp,
    });

    if (params.server !== 'Audit') {
      await this.auditMcp.appendEvent({
        alert_id: params.alert_id,
        event_type: 'MCP_TOOL_EXECUTED',
        actor: `${params.server}MCP`,
        action: `${params.server}.${params.tool}`,
        outcome: 'ALLOW',
        metadata: {
          tier,
          matched_rule: cedar.matched_rule,
        },
      });
    }

    return {
      allowed: true,
      blocked: false,
      trace,
      result,
    };
  }

  resetTraces(): void {
    this.traces.length = 0;
  }
}
