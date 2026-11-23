import crypto from 'node:crypto';
import {
  AuditStorageAdapter,
  SnsNotificationAdapter,
} from './adapters/awsOutput';
import {
  BedrockExplanationAdapter,
  BedrockSimulationMode,
} from './adapters/bedrock';
import {
  ElevenLabsScribeAdapter,
  ElevenLabsTtsAdapter,
} from './adapters/elevenlabs';
import {
  ApprovalService,
  parseParentVoiceApproval,
  SignedApprovalTokenPayload,
} from './approvalService';
import { CEDAR_POLICY_SOURCE } from './cedarPolicy';
import {
  AgentCoreGateway,
  AuditMcpServer,
  CognitoAuthorizerAdapter,
  FamilyMcpServer,
  ListenMcpServer,
  MCP_TOOL_CATALOG,
  ScamIntelMcpServer,
} from './gatewayAndMcp';
import {
  ConfiguredThreatIntelProvider,
  DEFAULT_ROLLING_WINDOW_LINES,
  evaluateTranscriptDeterministic,
  RULE_ENGINE_VERSION,
} from './ruleEngine';
import { getScenarioById } from './scenarios';
import {
  AlertModel,
  EvidencePackModel,
  IntegrationHealthState,
  IntegrationStatus,
  McpToolName,
  PolicyTestScenario,
  PublicApprovalSummary,
  SessionLifecycleState,
  SystemStateSnapshot,
  TranscriptLine,
  UrlCheckResult,
  VoiceClipStatus,
} from './types';

function computeMissingEnv(required: string[]): string[] {
  return required.filter((key) => {
    if (key === 'SNS_TOPIC_ARN') {
      return !(process.env.SNS_TOPIC_ARN || process.env.SNS_GUARDIAN_TOPIC_ARN);
    }
    if (key === 'DYNAMODB_TABLE_NAME') {
      return !(process.env.DYNAMODB_TABLE_NAME || process.env.DYNAMODB_AUDIT_TABLE);
    }
    if (key === 'S3_AUDIT_BUCKET') {
      return !(process.env.S3_AUDIT_BUCKET || process.env.S3_AUDIT_LOCK_BUCKET);
    }
    if (key === 'AWS_CREDENTIALS') {
      return !(
        (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
        process.env.AWS_SESSION_TOKEN
      );
    }
    return !process.env[key];
  });
}

export class SurakshaOrchestrator {
  readonly scribe = new ElevenLabsScribeAdapter();
  readonly tts = new ElevenLabsTtsAdapter();
  readonly bedrock = new BedrockExplanationAdapter();
  readonly sns = new SnsNotificationAdapter();
  readonly auditStorage: AuditStorageAdapter;
  readonly threatIntel = new ConfiguredThreatIntelProvider();
  readonly cognito = new CognitoAuthorizerAdapter();
  readonly approvalService = new ApprovalService();
  readonly listenMcp = new ListenMcpServer();
  readonly scamIntelMcp = new ScamIntelMcpServer();
  readonly familyMcp: FamilyMcpServer;
  readonly auditMcp: AuditMcpServer;
  readonly gateway: AgentCoreGateway;

  private sessionId = `sess_${crypto.randomUUID().slice(0, 8)}`;
  private sessionStartedAt = new Date().toISOString();
  private lifecycleState: SessionLifecycleState = 'IDLE';
  private activeScenarioId = 'digital-arrest';
  private scriptCursor = 0;
  private inputMode: 'scripted' | 'microphone' = 'scripted';
  private bedrockSimMode: BedrockSimulationMode = 'normal';
  private echoSuppressionActive = false;
  private activeAlert: AlertModel | null = null;
  private alertHistory: AlertModel[] = [];
  private transcript: TranscriptLine[] = [];
  private activeApprovalSummary: PublicApprovalSummary | null = null;
  private activeInternalToken: SignedApprovalTokenPayload | null = null;
  private voiceClip: VoiceClipStatus | null = null;
  private evidencePack: EvidencePackModel | null = null;
  private snsNotifications: SystemStateSnapshot['sns_notifications'] = [];
  private blockedBanner: string | null = null;
  private lastHealthCheckAt = new Date().toISOString();
  private listeners = new Set<(snapshot: SystemStateSnapshot) => void>();

  constructor(options?: { persistAuditPath?: string | null }) {
    this.auditStorage = new AuditStorageAdapter({
      persistPath: options?.persistAuditPath,
    });
    this.familyMcp = new FamilyMcpServer(this.sns);
    this.auditMcp = new AuditMcpServer(this.auditStorage);
    this.gateway = new AgentCoreGateway(
      this.cognito,
      this.approvalService,
      this.listenMcp,
      this.scamIntelMcp,
      this.familyMcp,
      this.auditMcp
    );
  }

  subscribe(listener: (snapshot: SystemStateSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  private buildIntegrationRow(params: {
    name: string;
    key: IntegrationStatus['key'];
    mode: 'LIVE' | 'LOCAL_MOCK';
    health: IntegrationHealthState;
    requiredEnv: string[];
    detail: string;
  }): IntegrationStatus {
    const missing = computeMissingEnv(params.requiredEnv);
    const status: IntegrationStatus['status'] =
      params.health === 'CONNECTION FAILED'
        ? 'DEGRADED'
        : params.health === 'LIVE'
          ? 'ACTIVE'
          : params.health === 'PENDING CONFIGURATION'
            ? 'READY'
            : 'SIMULATED';

    return {
      name: params.name,
      key: params.key,
      mode: params.mode,
      configured_mode: params.mode === 'LIVE' ? 'LIVE' : 'MOCK',
      health: params.health,
      status,
      required_env: params.requiredEnv,
      missing_env: missing,
      last_checked_at: this.lastHealthCheckAt,
      detail: params.detail,
    };
  }

  getIntegrationStatuses(): IntegrationStatus[] {
    const bedrockHealth = this.bedrock.getHealthState(this.bedrockSimMode);
    const orchLive = Boolean(process.env.ORCHESTRATOR_LAMBDA_ARN);
    const interceptorLive = Boolean(process.env.LAMBDA_INTERCEPTOR_ARN);
    const cedarLive =
      this.gateway.getMode() === 'LIVE' &&
      this.cognito.getMode() === 'LIVE';

    return [
      this.buildIntegrationRow({
        name: 'ElevenLabs Scribe v2',
        key: 'elevenlabs_scribe',
        mode: this.scribe.getMode(),
        health: this.scribe.getHealthState(),
        requiredEnv: ['ELEVENLABS_API_KEY'],
        detail: `Model ${this.scribe.getModelName()} (WebSocket STT)`,
      }),
      this.buildIntegrationRow({
        name: 'ElevenLabs TTS',
        key: 'elevenlabs_tts',
        mode: this.tts.getMode(),
        health: this.tts.getHealthState(),
        requiredEnv: ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID'],
        detail: 'Pre-generated consented family voice clips only',
      }),
      this.buildIntegrationRow({
        name: 'Amazon Bedrock',
        key: 'bedrock',
        mode: this.bedrock.getMode(),
        health: bedrockHealth,
        requiredEnv: ['AWS_REGION', 'AWS_CREDENTIALS', 'BEDROCK_MODEL_ID'],
        detail:
          this.bedrockSimMode === 'normal'
            ? 'Async explanation & Hindi script (non-blocking)'
            : `Simulated ${this.bedrockSimMode} (Rule Engine unaffected)`,
      }),
      this.buildIntegrationRow({
        name: 'Orchestrator Lambda',
        key: 'orchestrator_lambda',
        mode: orchLive ? 'LIVE' : 'LOCAL_MOCK',
        health: orchLive ? 'LIVE' : 'MOCK',
        requiredEnv: ['ORCHESTRATOR_LAMBDA_ARN'],
        detail: 'Coordinates Rule Engine, TTS, Approval & Gateway',
      }),
      this.buildIntegrationRow({
        name: 'Cognito Authorizer',
        key: 'cognito',
        mode: this.cognito.getMode(),
        health: this.cognito.getHealthState(),
        requiredEnv: ['COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'],
        detail: 'OAuth authorizer on AgentCore Gateway',
      }),
      this.buildIntegrationRow({
        name: 'AgentCore Gateway',
        key: 'agentcore_gateway',
        mode: this.gateway.getMode(),
        health: this.gateway.getHealthState(),
        requiredEnv: ['AGENTCORE_GATEWAY_URL', 'LAMBDA_INTERCEPTOR_ARN'],
        detail: 'Single entry point for all 4 MCP server groups',
      }),
      this.buildIntegrationRow({
        name: 'Lambda Interceptor',
        key: 'lambda_interceptor',
        mode: interceptorLive ? 'LIVE' : 'LOCAL_MOCK',
        health: interceptorLive ? 'LIVE' : 'MOCK',
        requiredEnv: ['LAMBDA_INTERCEPTOR_ARN'],
        detail: 'Validates sig, TTL, alert_id, nonce, scope',
      }),
      this.buildIntegrationRow({
        name: 'Cedar Policy Engine',
        key: 'cedar_policy',
        mode: cedarLive ? 'LIVE' : 'LOCAL_MOCK',
        health: cedarLive ? 'LIVE' : 'MOCK',
        requiredEnv: ['AGENTCORE_GATEWAY_URL'],
        detail: 'Default-deny & forbid-wins authorization (/policies/suraksha.cedar)',
      }),
      this.buildIntegrationRow({
        name: 'Amazon SNS',
        key: 'sns',
        mode: this.sns.getMode(),
        health: this.sns.getHealthState(),
        requiredEnv: ['AWS_CREDENTIALS', 'SNS_TOPIC_ARN'],
        detail: 'Guardian alert notifications',
      }),
      this.buildIntegrationRow({
        name: 'Amazon DynamoDB',
        key: 'dynamodb',
        mode: this.auditStorage.getDynamoMode(),
        health: this.auditStorage.getDynamoHealthState(),
        requiredEnv: ['AWS_CREDENTIALS', 'DYNAMODB_TABLE_NAME'],
        detail: 'Persistent local + DynamoDB append-only audit metadata',
      }),
      this.buildIntegrationRow({
        name: 'Amazon S3 Object Lock',
        key: 's3_object_lock',
        mode: this.auditStorage.getS3LockMode(),
        health: this.auditStorage.getS3HealthState(),
        requiredEnv: ['AWS_CREDENTIALS', 'S3_AUDIT_BUCKET'],
        detail: 'WORM audit snapshots (Governance/Compliance)',
      }),
      this.buildIntegrationRow({
        name: 'Threat Intelligence',
        key: 'threat_intel',
        mode: this.threatIntel.getMode(),
        health: this.threatIntel.getHealthState(),
        requiredEnv: [],
        detail: 'Static URL & domain reputation (never fetches links)',
      }),
    ];
  }

  runIntegrationHealthChecks(): {
    checked_at: string;
    integrations: IntegrationStatus[];
  } {
    this.lastHealthCheckAt = new Date().toISOString();
    const integrations = this.getIntegrationStatuses();
    this.emit();
    return {
      checked_at: this.lastHealthCheckAt,
      integrations,
    };
  }

  getSnapshot(): SystemStateSnapshot {
    const integrity = this.auditStorage.verifyChainIntegrity();
    const rollingWindow = this.listenMcp.getTranscriptWindow(
      this.transcript,
      DEFAULT_ROLLING_WINDOW_LINES
    );
    return {
      session_id: this.sessionId,
      lifecycle_state: this.lifecycleState,
      active_scenario_id: this.activeScenarioId,
      input_mode: this.inputMode,
      bedrock_simulation_mode: this.bedrockSimMode,
      echo_suppression_active: this.echoSuppressionActive,
      active_alert: this.activeAlert
        ? {
            ...this.activeAlert,
            detected_signals: [...this.activeAlert.detected_signals],
            detected_categories: [...this.activeAlert.detected_categories],
          }
        : null,
      alert_history: [...this.alertHistory],
      transcript: [...this.transcript],
      rolling_window: rollingWindow,
      active_approval: this.activeApprovalSummary
        ? { ...this.activeApprovalSummary }
        : null,
      approval_history: this.approvalService.getHistory(),
      voice_clip: this.voiceClip ? { ...this.voiceClip } : null,
      gateway_traces: [...this.gateway.traces],
      audit_events: this.auditStorage.getAllEvents(),
      audit_chain_valid: integrity.valid,
      evidence_pack: this.evidencePack ? { ...this.evidencePack } : null,
      sns_notifications: [...this.snsNotifications],
      integrations: this.getIntegrationStatuses(),
      mcp_catalog: MCP_TOOL_CATALOG,
      cedar_policy_text: CEDAR_POLICY_SOURCE,
      tier3_prohibitions: [
        'Never replies directly to the suspected scammer',
        'Never conducts a conversational AI interaction with the scammer',
        'Never clicks untrusted links',
        'Never executes UPI transactions or touches banking apps',
        'Never enters or discloses OTPs, PINs, or financial credentials',
        'Never installs remote-access applications',
        'Never automatically submits reports or claims a payment is safe',
        'Never executes family-level actions without explicit approval',
      ],
      blocked_banner: this.blockedBanner,
    };
  }

  setBedrockSimulationMode(mode: BedrockSimulationMode): SystemStateSnapshot {
    this.bedrockSimMode = mode;
    this.emit();
    return this.getSnapshot();
  }

  async startCall(params: {
    scenario_id?: string;
    input_mode?: 'scripted' | 'microphone';
  }): Promise<SystemStateSnapshot> {
    if (this.activeAlert) {
      const existingIdx = this.alertHistory.findIndex(
        (a) => a.alert_id === this.activeAlert!.alert_id
      );
      if (existingIdx >= 0) {
        this.alertHistory[existingIdx] = { ...this.activeAlert };
      } else {
        this.alertHistory.unshift({ ...this.activeAlert });
      }
    }

    this.activeScenarioId = params.scenario_id ?? this.activeScenarioId;
    this.inputMode = params.input_mode ?? 'scripted';
    this.sessionId = `sess_${crypto.randomUUID().slice(0, 8)}`;
    this.sessionStartedAt = new Date().toISOString();
    this.scriptCursor = 0;
    this.transcript = [];
    this.echoSuppressionActive = false;
    this.activeAlert = null;
    this.activeApprovalSummary = null;
    this.activeInternalToken = null;
    this.voiceClip = null;
    this.evidencePack = null;
    this.blockedBanner = null;
    this.lifecycleState = 'LISTENING';

    const scenario = getScenarioById(this.activeScenarioId);

    await this.auditMcp.appendEvent({
      alert_id: 'PENDING',
      event_type: 'CALL_SESSION_STARTED',
      actor: 'ElevenLabsScribe',
      action: 'Scribe.stream_started',
      outcome: 'INFO',
      metadata: {
        session_id: this.sessionId,
        scenario_id: scenario.id,
        input_mode: this.inputMode,
        channel: 'Speaker / Merged Call',
      },
    });

    this.emit();
    return this.getSnapshot();
  }

  async stepScriptedOrIngestTranscript(params?: {
    custom_text?: string;
    speaker?: 'Caller' | 'Parent';
  }): Promise<SystemStateSnapshot> {
    if (this.lifecycleState === 'IDLE') {
      await this.startCall({
        scenario_id: this.activeScenarioId,
        input_mode: params?.custom_text ? 'microphone' : this.inputMode,
      });
    }

    const scenario = getScenarioById(this.activeScenarioId);
    let newLine: TranscriptLine | null = null;

    if (params?.custom_text && params.custom_text.trim().length > 0) {
      const trimmed = params.custom_text.trim();
      newLine = {
        id: `line_${this.transcript.length + 1}`,
        session_id: this.sessionId,
        speaker: params.speaker ?? 'Caller',
        text: trimmed,
        english_subtitle: trimmed,
        hindi_subtitle: trimmed,
        timestamp: new Date().toISOString(),
        elapsed: `00:${String((this.transcript.length + 1) * 5).padStart(2, '0')}`,
        source: 'scribe_microphone',
      };
    } else if (this.scriptCursor < scenario.lines.length) {
      const sLine = scenario.lines[this.scriptCursor];
      this.scriptCursor += 1;
      newLine = {
        id: `line_${this.transcript.length + 1}`,
        session_id: this.sessionId,
        speaker: sLine.speaker,
        text: sLine.text,
        english_subtitle: sLine.english_subtitle,
        hindi_subtitle: sLine.hindi_subtitle,
        timestamp: new Date().toISOString(),
        elapsed: sLine.elapsed,
        source: 'scribe_scripted',
      };
    }

    if (!newLine) {
      return this.getSnapshot();
    }

    this.transcript.push(newLine);
    const provisionalAlertId =
      this.activeAlert?.alert_id ??
      `ALT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${this.sessionId.slice(-4).toUpperCase()}`;

    // Step 2: Listen MCP (Tier 1) retrieves rolling transcript window via Gateway
    await this.gateway.execute({
      principal: 'Orchestrator::suraksha-lambda',
      cognitoBearerPresent: true,
      server: 'Listen',
      tool: 'get_transcript_window',
      alert_id: provisionalAlertId,
      inputs: {
        session_id: this.sessionId,
        window_size: this.transcript.length,
        transcript_raw: newLine.text,
      },
      invokeHandler: ({ listen }) =>
        listen.getTranscriptWindow(this.transcript, DEFAULT_ROLLING_WINDOW_LINES),
    });

    // Step 3: Deterministic Rule Engine evaluates rolling window immediately (never waits for Bedrock)
    const ruleEval = evaluateTranscriptDeterministic(
      this.transcript,
      DEFAULT_ROLLING_WINDOW_LINES
    );

    const urlResults: UrlCheckResult[] = [];
    for (const url of ruleEval.extracted_urls) {
      const urlExec = await this.gateway.execute<UrlCheckResult>({
        principal: 'Orchestrator::suraksha-lambda',
        cognitoBearerPresent: true,
        server: 'Scam-Intel',
        tool: 'check_url',
        alert_id: provisionalAlertId,
        inputs: { url },
        invokeHandler: ({ scamIntel }) => scamIntel.checkUrl(url),
      });
      if (urlExec.result) urlResults.push(urlExec.result);
    }

    await this.gateway.execute({
      principal: 'Orchestrator::suraksha-lambda',
      cognitoBearerPresent: true,
      server: 'Scam-Intel',
      tool: 'score_signals',
      alert_id: provisionalAlertId,
      inputs: {
        rule_version: RULE_ENGINE_VERSION,
        signals_count: ruleEval.detected_signals.length,
        risk_score: ruleEval.risk_score,
        risk_level: ruleEval.risk_level,
      },
      invokeHandler: ({ scamIntel }) => scamIntel.scoreSignals(this.transcript),
    });

    if (ruleEval.matched_playbook) {
      await this.gateway.execute({
        principal: 'Orchestrator::suraksha-lambda',
        cognitoBearerPresent: true,
        server: 'Scam-Intel',
        tool: 'match_scam_playbook',
        alert_id: provisionalAlertId,
        inputs: {
          signals: ruleEval.detected_signals,
          matched_playbook: ruleEval.matched_playbook,
        },
        invokeHandler: ({ scamIntel }) =>
          scamIntel.matchPlaybook(ruleEval.detected_signals),
      });
    }

    // Deduplicate alert creation: only trigger interruption if no active high-risk alert already exists for this call
    if (ruleEval.should_interrupt && !this.activeAlert) {
      this.lifecycleState = 'SIGNAL_DETECTED';

      const createdAlert: AlertModel = {
        alert_id: provisionalAlertId,
        session_id: this.sessionId,
        created_at: new Date().toISOString(),
        risk_level: ruleEval.risk_level,
        risk_score: ruleEval.risk_score,
        detected_signals: ruleEval.detected_signals,
        detected_categories: ruleEval.detected_categories,
        rules_fired: ruleEval.rules_fired,
        matched_playbook: ruleEval.matched_playbook,
        url_check_results: urlResults,
        transcript_excerpt: [...this.transcript],
        rolling_window: [...ruleEval.rolling_window_lines],
        explanation:
          'Rule Engine triggered immediate safety alert. Fetching contextual explanation...',
        explanation_source: 'PENDING',
        hindi_script:
          'मम्मी/पापा, रुकिए! यह कॉल संदिग्ध लग रही है। कृपया कोई OTP या पैसे साझा न करें।',
        rule_version: ruleEval.rule_version,
        approval_status: 'AWAITING_PARENT_HAAN',
        guardian_notification_status: 'NOT_SENT',
        evidence_pack_id: null,
      };
      this.activeAlert = createdAlert;

      await this.auditMcp.appendEvent({
        alert_id: createdAlert.alert_id,
        event_type: 'HIGH_RISK_RULE_TRIGGERED',
        actor: 'DeterministicRuleEngine',
        action: 'RuleEngine.evaluate',
        outcome: 'ALLOW',
        metadata: {
          rule_version: ruleEval.rule_version,
          risk_score: ruleEval.risk_score,
          categories: ruleEval.detected_categories,
          signals: ruleEval.detected_signals,
          rules_fired: ruleEval.rules_fired,
        },
      });

      // Step 4: Orchestrator triggers pre-generated ElevenLabs family voice clip immediately
      // Enable Echo Prevention while system voice plays so playback is never processed as caller speech
      this.lifecycleState = 'INTERRUPTING';
      this.echoSuppressionActive = true;
      this.voiceClip = await this.tts.triggerPreGeneratedClip(
        ruleEval.matched_playbook
      );

      this.transcript.push({
        id: `line_${this.transcript.length + 1}`,
        session_id: this.sessionId,
        speaker: 'Suraksha',
        text: this.voiceClip.transcript,
        english_subtitle: this.voiceClip.english_subtitle,
        hindi_subtitle: this.voiceClip.hindi_subtitle,
        timestamp: new Date().toISOString(),
        elapsed: '00:14',
        source: 'scribe_scripted',
        echo_suppressed: true,
      });

      createdAlert.transcript_excerpt = [...this.transcript];
      this.lifecycleState = 'AWAITING_APPROVAL';
      this.echoSuppressionActive = false;

      await this.auditMcp.appendEvent({
        alert_id: createdAlert.alert_id,
        event_type: 'FAMILY_VOICE_CLIP_TRIGGERED',
        actor: 'ElevenLabsTTS',
        action: 'TTS.play_pre_generated_clip',
        outcome: 'INFO',
        metadata: {
          clip_id: this.voiceClip.clip_id,
          pre_generated_only: true,
          consent_verified: true,
          echo_suppressed: true,
          mode: this.voiceClip.mode,
        },
      });

      // Non-blocking Bedrock enrichment (if Bedrock times out/fails, alert & voice still completed!)
      this.emit();
      const bedrockOut = await this.bedrock.generateExplanation({
        signals: ruleEval.detected_signals,
        playbook: ruleEval.matched_playbook,
        transcript: this.transcript,
        simulationMode: this.bedrockSimMode,
      });

      if (this.activeAlert && this.activeAlert.alert_id === createdAlert.alert_id) {
        this.activeAlert.explanation = bedrockOut.explanation;
        this.activeAlert.hindi_script = bedrockOut.hindi_script;
        this.activeAlert.explanation_source = bedrockOut.source;

        await this.auditMcp.appendEvent({
          alert_id: createdAlert.alert_id,
          event_type:
            bedrockOut.source === 'BEDROCK_LIVE'
              ? 'BEDROCK_EXPLANATION_GENERATED'
              : 'BEDROCK_FALLBACK_USED',
          actor: 'AmazonBedrock',
          action: 'Bedrock.generate_explanation',
          outcome: bedrockOut.source === 'BEDROCK_LIVE' ? 'ALLOW' : 'FALLBACK',
          metadata: {
            source: bedrockOut.source,
            fallback_reason: bedrockOut.fallback_reason ?? null,
          },
        });
      }
    } else if (ruleEval.detected_signals.length === 1 && !this.activeAlert) {
      await this.auditMcp.appendEvent({
        alert_id: provisionalAlertId,
        event_type: 'SUSPICIOUS_SIGNAL_OBSERVED',
        actor: 'DeterministicRuleEngine',
        action: 'RuleEngine.evaluate',
        outcome: 'INFO',
        metadata: {
          signals: ruleEval.detected_signals,
          categories: ruleEval.detected_categories,
          risk_level: ruleEval.risk_level,
        },
      });
    }

    this.emit();
    return this.getSnapshot();
  }

  async submitParentVoiceUtterance(utterance: string): Promise<{
    accepted: boolean;
    parsed: 'haan' | 'nahi' | 'ambiguous';
    message: string;
    snapshot: SystemStateSnapshot;
  }> {
    const parsed = parseParentVoiceApproval(utterance);
    if (parsed === 'ambiguous') {
      if (this.activeAlert) {
        await this.auditMcp.appendEvent({
          alert_id: this.activeAlert.alert_id,
          event_type: 'AMBIGUOUS_APPROVAL_IGNORED',
          actor: 'ApprovalService',
          action: 'Approval.validate_utterance',
          outcome: 'DENY',
          metadata: {
            reason: 'Ambiguous utterance rejected; explicit "haan" required',
          },
        });
      }
      this.emit();
      return {
        accepted: false,
        parsed: 'ambiguous',
        message:
          'Ambiguous utterance ignored. Please say "Haan" or tap the Haan button to authorize family notification.',
        snapshot: this.getSnapshot(),
      };
    }

    const snapshot = await this.submitParentApproval(parsed);
    return {
      accepted: true,
      parsed,
      message:
        parsed === 'haan'
          ? 'Explicit "haan" verified; signed token issued.'
          : 'Explicit "nahi" recorded; family was not notified.',
      snapshot,
    };
  }

  async submitParentApproval(decision: 'haan' | 'nahi'): Promise<SystemStateSnapshot> {
    if (!this.activeAlert) {
      return this.getSnapshot();
    }

    if (decision === 'nahi') {
      this.lifecycleState = 'DENIED';
      this.activeAlert.approval_status = 'DECLINED_NAHI';
      this.activeApprovalSummary = null;
      this.activeInternalToken = null;
      this.blockedBanner = null;

      await this.auditMcp.appendEvent({
        alert_id: this.activeAlert.alert_id,
        event_type: 'PARENT_DECLINED_ALERT',
        actor: 'ParentDevice',
        action: 'Approval.decline_nahi',
        outcome: 'INFO',
        metadata: {
          decision: 'nahi',
          family_notified: false,
        },
      });

      this.emit();
      return this.getSnapshot();
    }

    // Step 5 & 6: Parent says "haan" -> Approval Service creates signed, single-use, alert-bound token
    const { internalToken, publicSummary } =
      this.approvalService.issueApprovalToken({
        alert_id: this.activeAlert.alert_id,
        approver_id: 'parent-device-primary',
        permitted_actions: ['alert_guardians', 'send_family_voice_message'],
      });

    this.activeInternalToken = internalToken;
    this.activeApprovalSummary = publicSummary;
    this.activeAlert.approval_status = 'APPROVED';
    this.lifecycleState = 'APPROVED';
    this.blockedBanner = null;

    await this.auditMcp.appendEvent({
      alert_id: this.activeAlert.alert_id,
      event_type: 'APPROVAL_TOKEN_ISSUED',
      actor: 'ApprovalService',
      action: 'Approval.issue_token',
      outcome: 'ALLOW',
      metadata: {
        token_id: publicSummary.token_id,
        alert_id: publicSummary.alert_id,
        nonce_preview: publicSummary.nonce_preview,
        expires_at: publicSummary.expires_at,
        permitted_actions: publicSummary.permitted_actions,
      },
    });

    // Step 7 & 8 & 9: Orchestrator sends token through AgentCore Gateway -> Lambda Interceptor -> Cedar Policy
    const alertExec = await this.gateway.execute({
      principal: 'Orchestrator::suraksha-lambda',
      cognitoBearerPresent: true,
      server: 'Family',
      tool: 'alert_guardians',
      alert_id: this.activeAlert.alert_id,
      approval_token: this.activeInternalToken,
      consumeTokenOnAllow: true,
      inputs: {
        alert_id: this.activeAlert.alert_id,
        risk_level: this.activeAlert.risk_level,
        approval_token: '[SIGNED_TOKEN_HANDLE]',
      },
      invokeHandler: async ({ family }) =>
        family.alertGuardians({
          alert: this.activeAlert!,
          dashboardRef: '/guardian-dashboard',
        }),
    });

    if (alertExec.allowed && alertExec.result) {
      const snsRes = alertExec.result as {
        notification_id: string;
        mode: 'LIVE' | 'LOCAL_MOCK';
      };
      this.lifecycleState = 'FAMILY_ALERTED';
      this.activeAlert.guardian_notification_status =
        snsRes.mode === 'LIVE' ? 'DISPATCHED_LIVE_SNS' : 'DISPATCHED_MOCK_SNS';

      this.snsNotifications.unshift({
        notification_id: snsRes.notification_id,
        alert_id: this.activeAlert.alert_id,
        risk_level: this.activeAlert.risk_level,
        timestamp: new Date().toISOString(),
        short_explanation: this.activeAlert.explanation,
        dashboard_ref: `alert/${this.activeAlert.alert_id}`,
        mode: snsRes.mode,
      });

      const updated = this.approvalService
        .getHistory()
        .find((h) => h.token_id === publicSummary.token_id);
      if (updated) {
        this.activeApprovalSummary = updated;
      }

      // Step 10: Scam-Intel prepares Evidence Pack for manual family submission
      const auditEventsNow = this.auditStorage.getAllEvents();
      const evExec = await this.gateway.execute<EvidencePackModel>({
        principal: 'Orchestrator::suraksha-lambda',
        cognitoBearerPresent: true,
        server: 'Scam-Intel',
        tool: 'prepare_evidence_pack',
        alert_id: this.activeAlert.alert_id,
        inputs: {
          alert_id: this.activeAlert.alert_id,
          manual_handoff_only: true,
        },
        invokeHandler: ({ scamIntel }) =>
          scamIntel.prepareEvidencePack({
            alert: this.activeAlert!,
            transcript: this.transcript,
            auditEvents: auditEventsNow,
            startedAt: this.sessionStartedAt,
          }),
      });

      if (evExec.result) {
        this.evidencePack = evExec.result;
        this.activeAlert.evidence_pack_id = evExec.result.evidence_pack_id;
        this.lifecycleState = 'EVIDENCE_READY';

        await this.auditMcp.appendEvent({
          alert_id: this.activeAlert.alert_id,
          event_type: 'EVIDENCE_PACK_READY_MANUAL_HANDOFF',
          actor: 'ScamIntelMCP',
          action: 'ScamIntel.prepare_evidence_pack',
          outcome: 'ALLOW',
          metadata: {
            evidence_pack_id: evExec.result.evidence_pack_id,
            integrity_hash: evExec.result.integrity_hash,
            manual_submission_status: evExec.result.manual_submission_status,
            auto_submitted: false,
          },
        });
      }
    } else {
      this.lifecycleState = 'BLOCKED';
      this.activeAlert.approval_status = 'BLOCKED_BY_POLICY';
      this.activeAlert.guardian_notification_status = 'BLOCKED';
      this.blockedBanner = alertExec.trace.reason;
    }

    this.emit();
    return this.getSnapshot();
  }

  async runPolicyTest(
    scenario: PolicyTestScenario
  ): Promise<{ blocked: boolean; reason: string; snapshot: SystemStateSnapshot }> {
    const alertId =
      this.activeAlert?.alert_id ?? `ALT-TEST-${this.sessionId.slice(-4).toUpperCase()}`;

    let testToken: SignedApprovalTokenPayload | null = null;
    let requestedTool: McpToolName | string = 'alert_guardians';
    let targetAlertId = alertId;
    const nowOverride = new Date();

    if (scenario === 'missing_token') {
      testToken = null;
    } else if (scenario === 'expired_token') {
      const issued = this.approvalService.issueApprovalToken({
        alert_id: alertId,
        ttlSeconds: 1,
        now: new Date(Date.now() - 60_000),
      });
      testToken = issued.internalToken;
    } else if (scenario === 'invalid_signature') {
      const issued = this.approvalService.issueApprovalToken({
        alert_id: alertId,
      });
      testToken = {
        ...issued.internalToken,
        signature: 'deadbeef'.repeat(8),
      };
    } else if (scenario === 'wrong_alert_id') {
      const issued = this.approvalService.issueApprovalToken({
        alert_id: 'ALT-DIFFERENT-9999',
      });
      testToken = issued.internalToken;
      targetAlertId = alertId;
    } else if (scenario === 'tampered_token') {
      const issued = this.approvalService.issueApprovalToken({
        alert_id: alertId,
      });
      testToken = {
        ...issued.internalToken,
        approver_id: 'attacker-spoofed',
      };
    } else if (scenario === 'reused_token') {
      const issued = this.approvalService.issueApprovalToken({
        alert_id: alertId,
      });
      this.approvalService.markTokenUsed(issued.internalToken.token_id);
      testToken = issued.internalToken;
    } else if (scenario === 'unauthorized_family_action') {
      const issued = this.approvalService.issueApprovalToken({
        alert_id: alertId,
        permitted_actions: ['alert_guardians'],
      });
      testToken = issued.internalToken;
      requestedTool = 'send_family_voice_message';
    }

    const exec = await this.gateway.execute({
      principal: 'Orchestrator::suraksha-lambda',
      cognitoBearerPresent: true,
      server: 'Family',
      tool: requestedTool,
      alert_id: targetAlertId,
      approval_token: testToken,
      inputs: {
        alert_id: targetAlertId,
        policy_test_scenario: scenario,
        approval_token: testToken ? '[TEST_TOKEN_REDACTED]' : null,
      },
      now: nowOverride,
      invokeHandler: async ({ family }) =>
        family.sendFamilyVoiceMessage({
          alert_id: targetAlertId,
          recipient: 'Ansh',
          message: 'Should never run when blocked',
        }),
    });

    if (exec.blocked) {
      this.blockedBanner = `Policy Test (${scenario}): ${exec.trace.reason}`;
      if (this.lifecycleState === 'AWAITING_APPROVAL' && this.activeAlert) {
        this.activeAlert.guardian_notification_status = 'BLOCKED';
      }
    }

    this.emit();
    return {
      blocked: exec.blocked,
      reason: exec.trace.reason,
      snapshot: this.getSnapshot(),
    };
  }

  verifyAuditChain() {
    return this.auditStorage.verifyChainIntegrity();
  }

  simulateAuditTamperCheck() {
    return this.auditStorage.simulateTamperCheck();
  }

  resetDemo(): SystemStateSnapshot {
    this.lifecycleState = 'IDLE';
    this.scriptCursor = 0;
    this.transcript = [];
    this.echoSuppressionActive = false;
    this.activeAlert = null;
    this.alertHistory = [];
    this.activeApprovalSummary = null;
    this.activeInternalToken = null;
    this.voiceClip = null;
    this.evidencePack = null;
    this.snsNotifications = [];
    this.blockedBanner = null;
    this.approvalService.reset();
    this.gateway.resetTraces();
    this.auditStorage.clearForSessionReset();
    this.emit();
    return this.getSnapshot();
  }
}
