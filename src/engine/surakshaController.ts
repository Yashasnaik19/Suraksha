import { AuditLog, BrowserAuditLog } from '../adapters/AuditLog';
import { DetectionEngine, MockDetectionEngine } from '../adapters/DetectionEngine';
import { MockToolGateway, ToolGateway } from '../adapters/ToolGateway';
import { MockTranscriptSource, TranscriptSource } from '../adapters/TranscriptSource';
import { MockVoicePlayer, VoicePlaybackResult, VoicePlayer } from '../adapters/VoicePlayer';
import {
  AllowedVerdict,
  ApprovalHistoryItem,
  ApprovalToken,
  AuditEntry,
  DetectionResult,
  EvidencePack,
  McpToolCallRecord,
  PipelineNodeId,
  SurakshaState,
  TranscriptSegment,
} from '../adapters/types';

export interface SurakshaSnapshot {
  state: SurakshaState;
  activeNode: PipelineNodeId;
  alertId: string;
  segments: TranscriptSegment[];
  detection: DetectionResult;
  currentInterruption: VoicePlaybackResult | null;
  activeToken: ApprovalToken | null;
  approvalHistory: ApprovalHistoryItem[];
  toolCalls: McpToolCallRecord[];
  auditEntries: AuditEntry[];
  evidencePack: EvidencePack | null;
  familyNotified: boolean;
  tryWithoutApproval: boolean;
  lastGatewayDenial: string | null;
}

export interface SurakshaAdapters {
  transcriptSource: TranscriptSource;
  detectionEngine: DetectionEngine;
  toolGateway: ToolGateway;
  voicePlayer: VoicePlayer;
  auditLog: AuditLog;
}

const INITIAL_DETECTION: DetectionResult = {
  verdict: 'No Known Red Flags (never share OTP/PIN)',
  signals: [],
  rulesFired: [],
  llmExplanation: 'Waiting for call transcript window. Never share an OTP or PIN.',
  shouldInterrupt: false,
  playbookMatched: null,
};

export class SurakshaController {
  private readonly adapters: SurakshaAdapters;
  private state: SurakshaState = 'IDLE';
  private activeNode: PipelineNodeId = 'call_audio';
  private alertId = 'ALT-2026-01';
  private stepCursor = -1;
  private segments: TranscriptSegment[] = [];
  private detection: DetectionResult = { ...INITIAL_DETECTION };
  private currentInterruption: VoicePlaybackResult | null = null;
  private activeToken: ApprovalToken | null = null;
  private approvalHistory: ApprovalHistoryItem[] = [];
  private evidencePack: EvidencePack | null = null;
  private familyNotified = false;
  private tryWithoutApproval = false;
  private lastGatewayDenial: string | null = null;
  private historySeq = 0;

  constructor(adapters?: Partial<SurakshaAdapters>) {
    this.adapters = {
      transcriptSource: adapters?.transcriptSource ?? new MockTranscriptSource(),
      detectionEngine: adapters?.detectionEngine ?? new MockDetectionEngine(),
      toolGateway: adapters?.toolGateway ?? new MockToolGateway(),
      voicePlayer: adapters?.voicePlayer ?? new MockVoicePlayer(),
      auditLog: adapters?.auditLog ?? new BrowserAuditLog(),
    };
  }

  getSnapshot(): SurakshaSnapshot {
    return {
      state: this.state,
      activeNode: this.activeNode,
      alertId: this.alertId,
      segments: [...this.segments],
      detection: {
        ...this.detection,
        signals: [...this.detection.signals],
        rulesFired: [...this.detection.rulesFired],
      },
      currentInterruption: this.currentInterruption
        ? { ...this.currentInterruption }
        : null,
      activeToken: this.activeToken ? { ...this.activeToken } : null,
      approvalHistory: [...this.approvalHistory],
      toolCalls: this.adapters.toolGateway.getCallLog(),
      auditEntries: this.adapters.auditLog.getEntries(),
      evidencePack: this.evidencePack ? { ...this.evidencePack } : null,
      familyNotified: this.familyNotified,
      tryWithoutApproval: this.tryWithoutApproval,
      lastGatewayDenial: this.lastGatewayDenial,
    };
  }

  setTryWithoutApproval(enabled: boolean): void {
    this.tryWithoutApproval = enabled;
  }

  async triggerUnapprovedFamilyAttempt(): Promise<SurakshaSnapshot> {
    this.activeNode = 'policy_gateway';
    const { record } = this.adapters.toolGateway.invokeTool({
      server: 'Family',
      tool: 'alert_guardians',
      alert_id: this.alertId,
      approval_token: null,
      inputs: {
        alert_id: this.alertId,
        verdict: this.detection.verdict,
        guardian: 'Ansh',
        caller_number: '+91-98765-43210',
      },
    });

    this.lastGatewayDenial = `${record.decision}: ${record.reason}`;
    this.historySeq += 1;
    this.approvalHistory = [
      {
        id: `hist-${this.historySeq}`,
        alertId: this.alertId,
        timestamp: record.timestamp,
        outcome: 'GATEWAY_DENIED',
        parentResponse: 'No parent consent',
        tokenId: null,
        note: `Gateway blocked Family.alert_guardians (${record.reason})`,
      },
      ...this.approvalHistory,
    ];

    this.adapters.toolGateway.invokeTool({
      server: 'Audit',
      tool: 'append_event',
      alert_id: this.alertId,
      inputs: {
        eventType: 'POLICY_GATEWAY_DENIED',
        tool: 'Family.alert_guardians',
        reason: record.reason,
      },
    });

    this.activeNode = 'audit_log';
    await this.adapters.auditLog.append({
      eventType: 'POLICY_GATEWAY_DENIED',
      actor: 'PolicyGateway',
      summary: `DENY Family.alert_guardians (${record.reason})`,
      timestamp: record.timestamp,
    });

    return this.getSnapshot();
  }

  async stepForward(): Promise<SurakshaSnapshot> {
    const allSegments = this.adapters.transcriptSource.getScriptedSegments();

    if (this.state === 'IDLE') {
      this.state = 'LISTENING';
      this.activeNode = 'call_audio';
      this.stepCursor = 0;
      const windowSegments = this.adapters.transcriptSource.getWindow(0);
      this.segments = windowSegments;

      this.adapters.toolGateway.invokeTool({
        server: 'Listen',
        tool: 'get_transcript_window',
        alert_id: this.alertId,
        inputs: {
          window_size: windowSegments.length,
          caller_number: '+91-98765-43210',
          transcript_raw: windowSegments[0]?.text ?? '',
        },
      });

      this.activeNode = 'detection';
      this.detection = this.adapters.detectionEngine.evaluateWindow(windowSegments);

      this.adapters.toolGateway.invokeTool({
        server: 'Scam-Intel',
        tool: 'score_signals',
        alert_id: this.alertId,
        inputs: {
          signals_found: this.detection.signals,
          co_occurrence_count: this.detection.signals.length,
          verdict: this.detection.verdict,
        },
      });

      this.adapters.toolGateway.invokeTool({
        server: 'Audit',
        tool: 'append_event',
        alert_id: this.alertId,
        inputs: {
          eventType: 'LISTENING_WINDOW_EVALUATED',
          signals: this.detection.signals,
        },
      });

      await this.adapters.auditLog.append({
        eventType: 'LISTENING_WINDOW_EVALUATED',
        actor: 'DetectionEngine',
        summary: `Window #1 evaluated: ${this.detection.signals.join(', ') || 'None'} (${this.detection.verdict})`,
      });

      return this.getSnapshot();
    }

    if (this.state === 'LISTENING' && this.stepCursor === 0 && allSegments.length > 1) {
      this.stepCursor = 1;
      const windowSegments = this.adapters.transcriptSource.getWindow(1);
      this.segments = windowSegments;
      this.activeNode = 'streaming_stt';

      this.adapters.toolGateway.invokeTool({
        server: 'Listen',
        tool: 'get_transcript_window',
        alert_id: this.alertId,
        inputs: {
          window_size: windowSegments.length,
          caller_number: '+91-98765-43210',
          transcript_raw: windowSegments[1]?.text ?? '',
        },
      });

      this.activeNode = 'detection';
      this.detection = this.adapters.detectionEngine.evaluateWindow(windowSegments);

      this.adapters.toolGateway.invokeTool({
        server: 'Scam-Intel',
        tool: 'match_scam_playbook',
        alert_id: this.alertId,
        inputs: {
          playbook: this.detection.playbookMatched,
          rules_fired: this.detection.rulesFired,
        },
      });

      this.adapters.toolGateway.invokeTool({
        server: 'Scam-Intel',
        tool: 'score_signals',
        alert_id: this.alertId,
        inputs: {
          signals_found: this.detection.signals,
          co_occurrence_count: this.detection.signals.length,
          verdict: this.detection.verdict,
        },
      });

      if (this.detection.shouldInterrupt) {
        this.state = 'SIGNAL_DETECTED';
        this.activeNode = 'orchestrator';
      }

      this.adapters.toolGateway.invokeTool({
        server: 'Audit',
        tool: 'append_event',
        alert_id: this.alertId,
        inputs: {
          eventType: 'SIGNAL_DETECTED',
          verdict: this.detection.verdict,
          signals: this.detection.signals,
        },
      });

      await this.adapters.auditLog.append({
        eventType: 'SIGNAL_DETECTED',
        actor: 'DetectionEngine',
        summary: `2+ categories co-occurred (${this.detection.signals.join(', ')}). Verdict: ${this.detection.verdict}`,
      });

      return this.getSnapshot();
    }

    if (this.state === 'SIGNAL_DETECTED' && allSegments.length > 2) {
      this.stepCursor = 2;
      const windowSegments = this.adapters.transcriptSource.getWindow(2);
      this.segments = windowSegments;
      this.state = 'INTERRUPTING';
      this.activeNode = 'orchestrator';

      const seg = allSegments[2];
      this.currentInterruption = await this.adapters.voicePlayer.play(
        seg.text,
        seg.audioKey
      );

      this.adapters.toolGateway.invokeTool({
        server: 'Audit',
        tool: 'append_event',
        alert_id: this.alertId,
        inputs: {
          eventType: 'CALM_INTERRUPTION_DELIVERED',
          voice_mode: this.currentInterruption.mode,
        },
      });

      await this.adapters.auditLog.append({
        eventType: 'CALM_INTERRUPTION_DELIVERED',
        actor: 'VoicePlayer',
        summary: `Interrupted calmly (${this.currentInterruption.mode}): "${seg.text}"`,
      });

      return this.getSnapshot();
    }

    if (this.state === 'INTERRUPTING' && allSegments.length > 3) {
      this.stepCursor = 3;
      const windowSegments = this.adapters.transcriptSource.getWindow(3);
      this.segments = windowSegments;
      this.state = 'AWAITING_APPROVAL';
      this.activeNode = 'orchestrator';

      const seg = allSegments[3];
      this.currentInterruption = await this.adapters.voicePlayer.play(
        seg.text,
        seg.audioKey
      );

      if (this.tryWithoutApproval) {
        await this.triggerUnapprovedFamilyAttempt();
      }

      return this.getSnapshot();
    }

    if (this.state === 'APPROVED') {
      await this.dispatchFamilyAlert();
      return this.getSnapshot();
    }

    if (this.state === 'FAMILY_ALERTED') {
      await this.prepareEvidencePack();
      return this.getSnapshot();
    }

    return this.getSnapshot();
  }

  async approveByParent(): Promise<SurakshaSnapshot> {
    if (this.state !== 'AWAITING_APPROVAL') {
      return this.getSnapshot();
    }

    this.state = 'APPROVED';
    this.activeNode = 'policy_gateway';
    const token = this.adapters.toolGateway.issueApprovalToken(this.alertId);
    this.activeToken = token;
    this.lastGatewayDenial = null;

    this.historySeq += 1;
    this.approvalHistory = [
      {
        id: `hist-${this.historySeq}`,
        alertId: this.alertId,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        outcome: 'APPROVED',
        parentResponse: 'Haan (Yes)',
        tokenId: token.tokenId,
        note: `Short-lived signed approval_token issued for ${this.alertId}`,
      },
      ...this.approvalHistory,
    ];

    this.adapters.toolGateway.invokeTool({
      server: 'Audit',
      tool: 'append_event',
      alert_id: this.alertId,
      inputs: {
        eventType: 'PARENT_CONSENT_GRANTED',
        token_id: token.tokenId,
      },
    });

    await this.adapters.auditLog.append({
      eventType: 'PARENT_CONSENT_GRANTED',
      actor: 'ParentPhoneUI',
      summary: `Parent tapped "Haan". Issued signed approval_token ${token.tokenId} bound to ${this.alertId}`,
    });

    return this.getSnapshot();
  }

  async dispatchFamilyAlert(): Promise<SurakshaSnapshot> {
    if (this.state !== 'APPROVED') {
      return this.getSnapshot();
    }

    this.activeNode = 'policy_gateway';
    const { record } = this.adapters.toolGateway.invokeTool({
      server: 'Family',
      tool: 'alert_guardians',
      alert_id: this.alertId,
      approval_token: this.activeToken,
      inputs: {
        alert_id: this.alertId,
        verdict: this.detection.verdict,
        guardian: 'Ansh',
        caller_number: '+91-98765-43210',
      },
    });

    if (record.decision === 'ALLOW') {
      this.state = 'FAMILY_ALERTED';
      this.activeNode = 'family_alert';
      this.familyNotified = true;

      this.adapters.toolGateway.invokeTool({
        server: 'Audit',
        tool: 'append_event',
        alert_id: this.alertId,
        inputs: {
          eventType: 'FAMILY_ALERTED',
          guardian: 'Ansh',
          gateway_decision: record.decision,
        },
      });

      await this.adapters.auditLog.append({
        eventType: 'FAMILY_ALERTED',
        actor: 'FamilyMCP',
        summary: `ALLOW Family.alert_guardians -> Guardian Ansh notified (simulated SNS)`,
      });
    } else {
      this.lastGatewayDenial = `${record.decision}: ${record.reason}`;
      await this.adapters.auditLog.append({
        eventType: 'POLICY_GATEWAY_DENIED',
        actor: 'PolicyGateway',
        summary: `DENY Family.alert_guardians (${record.reason})`,
      });
    }

    return this.getSnapshot();
  }

  async prepareEvidencePack(): Promise<SurakshaSnapshot> {
    if (this.state !== 'FAMILY_ALERTED') {
      return this.getSnapshot();
    }

    this.activeNode = 'orchestrator';
    const verdict: AllowedVerdict = this.detection.verdict;

    this.adapters.toolGateway.invokeTool({
      server: 'Scam-Intel',
      tool: 'prepare_evidence_pack',
      alert_id: this.alertId,
      inputs: {
        alert_id: this.alertId,
        category: 'Digital Arrest / Authority Impersonation',
        verdict,
        caller_number: '+91-98765-43210',
      },
    });

    this.evidencePack = {
      alertId: this.alertId,
      generatedAt: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      category: 'Digital Arrest / Authority Impersonation',
      verdict,
      callerNumberPlaceholder: '+91-XXXX-XX-XXXX [PLACEHOLDER]',
      signals: [...this.detection.signals],
      transcriptExcerpt: this.segments.map((seg) => ({
        timestamp: seg.timestamp,
        speaker: seg.speaker,
        text: seg.text,
      })),
      submissionNote:
        'Family submits via Chakshu / cybercrime.gov.in / 1930. Suraksha does not submit.',
    };

    this.state = 'EVIDENCE_READY';
    this.activeNode = 'audit_log';

    this.adapters.toolGateway.invokeTool({
      server: 'Audit',
      tool: 'append_event',
      alert_id: this.alertId,
      inputs: {
        eventType: 'EVIDENCE_PACK_READY',
        alert_id: this.alertId,
      },
    });

    await this.adapters.auditLog.append({
      eventType: 'EVIDENCE_PACK_READY',
      actor: 'ScamIntelMCP',
      summary: `Evidence pack drafted for ${this.alertId}. Family decides external submission.`,
    });

    return this.getSnapshot();
  }

  async denyByParent(): Promise<SurakshaSnapshot> {
    if (this.state !== 'AWAITING_APPROVAL') {
      return this.getSnapshot();
    }

    this.state = 'DENIED';
    this.activeNode = 'audit_log';
    this.activeToken = null;
    this.familyNotified = false;
    this.lastGatewayDenial = null;

    this.historySeq += 1;
    this.approvalHistory = [
      {
        id: `hist-${this.historySeq}`,
        alertId: this.alertId,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        outcome: 'DENIED',
        parentResponse: 'Nahi (No)',
        tokenId: null,
        note: 'Parent declined family alert. No Family MCP tool invoked.',
      },
      ...this.approvalHistory,
    ];

    this.adapters.toolGateway.invokeTool({
      server: 'Audit',
      tool: 'append_event',
      alert_id: this.alertId,
      inputs: {
        eventType: 'PARENT_CONSENT_DECLINED',
        alert_id: this.alertId,
      },
    });

    await this.adapters.auditLog.append({
      eventType: 'PARENT_CONSENT_DECLINED',
      actor: 'ParentPhoneUI',
      summary: 'Parent tapped "Nahi". Family was NOT alerted; staying on line calmly.',
    });

    return this.getSnapshot();
  }

  reset(): SurakshaSnapshot {
    this.adapters.voicePlayer.stop();
    this.adapters.toolGateway.reset();
    this.adapters.auditLog.reset();
    this.state = 'IDLE';
    this.activeNode = 'call_audio';
    this.stepCursor = -1;
    this.segments = [];
    this.detection = { ...INITIAL_DETECTION };
    this.currentInterruption = null;
    this.activeToken = null;
    this.approvalHistory = [];
    this.evidencePack = null;
    this.familyNotified = false;
    this.lastGatewayDenial = null;
    return this.getSnapshot();
  }
}
