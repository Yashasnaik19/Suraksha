import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { AuditStorageProvider, NotificationProvider } from '../providers';
import {
  AuditEventModel,
  IntegrationHealthState,
  IntegrationMode,
  RiskLevel,
} from '../types';

export const GENESIS_AUDIT_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000';

function getSnsTopicArn(): string | undefined {
  return process.env.SNS_TOPIC_ARN || process.env.SNS_GUARDIAN_TOPIC_ARN;
}

function getDynamoTableName(): string | undefined {
  return process.env.DYNAMODB_TABLE_NAME || process.env.DYNAMODB_AUDIT_TABLE;
}

function getS3AuditBucket(): string | undefined {
  return process.env.S3_AUDIT_BUCKET || process.env.S3_AUDIT_LOCK_BUCKET;
}

function hasAwsAuth(): boolean {
  return Boolean(
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
      process.env.AWS_SESSION_TOKEN
  );
}

export class MockNotificationProvider implements NotificationProvider {
  readonly providerName = 'MockNotificationProvider';

  getMode(): IntegrationMode {
    return 'LOCAL_MOCK';
  }

  getHealthState(): IntegrationHealthState {
    return 'MOCK';
  }

  async publishGuardianAlert(): Promise<{
    notification_id: string;
    mode: IntegrationMode;
    dispatched: boolean;
  }> {
    return {
      notification_id: `sns_mock_${crypto.randomUUID().slice(0, 8)}`,
      mode: 'LOCAL_MOCK',
      dispatched: true,
    };
  }
}

export class SnsNotificationAdapter implements NotificationProvider {
  readonly providerName = 'AmazonSnsNotificationProvider';
  private lastFailed = false;

  getMode(): IntegrationMode {
    if (process.env.SURAKSHA_MODE_SNS === 'MOCK') return 'LOCAL_MOCK';
    return hasAwsAuth() && Boolean(getSnsTopicArn()) ? 'LIVE' : 'LOCAL_MOCK';
  }

  getHealthState(): IntegrationHealthState {
    if (this.lastFailed) return 'CONNECTION FAILED';
    if (process.env.SURAKSHA_MODE_SNS === 'MOCK') return 'MOCK';
    if (process.env.SURAKSHA_MODE_SNS === 'LIVE' || getSnsTopicArn()) {
      return hasAwsAuth() && Boolean(getSnsTopicArn())
        ? 'LIVE'
        : 'PENDING CONFIGURATION';
    }
    return 'MOCK';
  }

  async publishGuardianAlert(params: {
    alert_id: string;
    risk_level: RiskLevel;
    timestamp: string;
    short_explanation: string;
    dashboard_ref: string;
  }): Promise<{
    notification_id: string;
    mode: IntegrationMode;
    dispatched: boolean;
  }> {
    const mode = this.getMode();
    if (mode === 'LIVE') {
      try {
        const region = process.env.AWS_REGION || 'ap-south-1';
        const topicArn = getSnsTopicArn()!;
        const client = new SNSClient({ region });
        const res = await client.send(
          new PublishCommand({
            TopicArn: topicArn,
            Subject: `Suraksha Alert ${params.alert_id}: ${params.risk_level}`,
            Message: JSON.stringify(params, null, 2),
          })
        );
        this.lastFailed = false;
        return {
          notification_id: res.MessageId || `sns_${Date.now()}`,
          mode: 'LIVE',
          dispatched: true,
        };
      } catch {
        this.lastFailed = true;
        return {
          notification_id: `sns_fallback_${crypto.randomUUID().slice(0, 8)}`,
          mode: 'LOCAL_MOCK',
          dispatched: true,
        };
      }
    }

    return {
      notification_id: `sns_mock_${crypto.randomUUID().slice(0, 8)}`,
      mode: 'LOCAL_MOCK',
      dispatched: true,
    };
  }
}

export function computeAuditEventHash(params: {
  event_id: string;
  seq: number;
  alert_id: string;
  event_type: string;
  timestamp: string;
  actor: string;
  action: string;
  outcome: string;
  metadata: Record<string, unknown>;
  previous_hash: string;
}): string {
  const canonical = JSON.stringify({
    event_id: params.event_id,
    seq: params.seq,
    alert_id: params.alert_id,
    event_type: params.event_type,
    timestamp: params.timestamp,
    actor: params.actor,
    action: params.action,
    outcome: params.outcome,
    metadata: params.metadata,
    previous_hash: params.previous_hash,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export class AuditStorageAdapter implements AuditStorageProvider {
  private readonly events: AuditEventModel[] = [];
  private readonly persistPath: string | null;

  constructor(options?: { persistPath?: string | null }) {
    if (options && options.persistPath === null) {
      this.persistPath = null;
    } else if (options?.persistPath) {
      const baseDir = process.cwd();
      const resolved = path.resolve(baseDir, options.persistPath);
      this.persistPath = resolved.startsWith(baseDir + path.sep) ? resolved : null;
    } else {
      const defaultDir = path.resolve(process.cwd(), 'data');
      this.persistPath = path.join(defaultDir, 'suraksha-audit.json');
    }

    if (this.persistPath && fs.existsSync(this.persistPath)) {
      try {
        const raw = fs.readFileSync(this.persistPath, 'utf8');
        const parsed = JSON.parse(raw) as AuditEventModel[];
        if (Array.isArray(parsed)) {
          this.events.push(...parsed);
        }
      } catch {
        // Ignore corrupted local seed file
      }
    }
  }

  private flushLocalPersistence(): void {
    if (!this.persistPath) return;
    try {
      fs.mkdirSync(path.dirname(this.persistPath), { recursive: true });
      fs.writeFileSync(
        this.persistPath,
        JSON.stringify(this.events, null, 2),
        'utf8'
      );
    } catch {
      // Non-fatal in read-only containers
    }
  }

  getDynamoMode(): IntegrationMode {
    if (process.env.SURAKSHA_MODE_DYNAMODB === 'MOCK') return 'LOCAL_MOCK';
    return hasAwsAuth() && Boolean(getDynamoTableName()) ? 'LIVE' : 'LOCAL_MOCK';
  }

  getDynamoHealthState(): IntegrationHealthState {
    if (process.env.SURAKSHA_MODE_DYNAMODB === 'MOCK') return 'MOCK';
    if (process.env.SURAKSHA_MODE_DYNAMODB === 'LIVE' || getDynamoTableName()) {
      return hasAwsAuth() && Boolean(getDynamoTableName())
        ? 'LIVE'
        : 'PENDING CONFIGURATION';
    }
    return 'MOCK';
  }

  getS3LockMode(): IntegrationMode {
    if (process.env.SURAKSHA_MODE_S3 === 'MOCK') return 'LOCAL_MOCK';
    return hasAwsAuth() && Boolean(getS3AuditBucket()) ? 'LIVE' : 'LOCAL_MOCK';
  }

  getS3HealthState(): IntegrationHealthState {
    if (process.env.SURAKSHA_MODE_S3 === 'MOCK') return 'MOCK';
    if (process.env.SURAKSHA_MODE_S3 === 'LIVE' || getS3AuditBucket()) {
      return hasAwsAuth() && Boolean(getS3AuditBucket())
        ? 'LIVE'
        : 'PENDING CONFIGURATION';
    }
    return 'MOCK';
  }

  async appendEvent(params: {
    alert_id: string;
    event_type: string;
    actor: string;
    action: string;
    outcome: 'ALLOW' | 'DENY' | 'INFO' | 'FALLBACK';
    metadata?: Record<string, unknown>;
  }): Promise<AuditEventModel> {
    const seq = this.events.length + 1;
    const event_id = `evt_${String(seq).padStart(4, '0')}_${crypto.randomUUID().slice(0, 6)}`;
    const timestamp = new Date().toISOString();
    const previous_hash =
      this.events.length > 0
        ? this.events[this.events.length - 1].event_hash
        : GENESIS_AUDIT_HASH;
    const metadata = params.metadata ?? {};

    const event_hash = computeAuditEventHash({
      event_id,
      seq,
      alert_id: params.alert_id,
      event_type: params.event_type,
      timestamp,
      actor: params.actor,
      action: params.action,
      outcome: params.outcome,
      metadata,
      previous_hash,
    });

    const dynamoMode = this.getDynamoMode();
    const s3Mode = this.getS3LockMode();
    const storage_mode: IntegrationMode =
      dynamoMode === 'LIVE' || s3Mode === 'LIVE' ? 'LIVE' : 'LOCAL_MOCK';

    const event: AuditEventModel = {
      event_id,
      seq,
      alert_id: params.alert_id,
      event_type: params.event_type,
      timestamp,
      actor: params.actor,
      action: params.action,
      outcome: params.outcome,
      metadata,
      previous_hash,
      event_hash,
      storage_mode,
    };

    // Append-only write (no update or delete API exists)
    this.events.push(event);
    this.flushLocalPersistence();

    const region = process.env.AWS_REGION || 'ap-south-1';

    if (dynamoMode === 'LIVE') {
      const ddb = new DynamoDBClient({ region });
      await ddb.send(
        new PutItemCommand({
          TableName: getDynamoTableName()!,
          Item: {
            alert_id: { S: event.alert_id },
            seq: { N: String(event.seq) },
            event_id: { S: event.event_id },
            event_type: { S: event.event_type },
            timestamp: { S: event.timestamp },
            previous_hash: { S: event.previous_hash },
            event_hash: { S: event.event_hash },
            payload: { S: JSON.stringify(event) },
          },
          ConditionExpression: 'attribute_not_exists(event_id)',
        })
      );
    }

    if (s3Mode === 'LIVE') {
      const s3 = new S3Client({ region });
      const retainUntil = new Date(Date.now() + 86_400_000 * 30);
      await s3.send(
        new PutObjectCommand({
          Bucket: getS3AuditBucket()!,
          Key: `audit/${event.alert_id}/${String(event.seq).padStart(4, '0')}_${event.event_id}.json`,
          Body: JSON.stringify(event, null, 2),
          ContentType: 'application/json',
          ObjectLockMode: 'GOVERNANCE',
          ObjectLockRetainUntilDate: retainUntil,
        })
      );
    }

    return { ...event };
  }

  getAllEvents(): AuditEventModel[] {
    return this.events.map((e) => ({ ...e, metadata: { ...e.metadata } }));
  }

  verifyChainIntegrity(eventsToCheck: AuditEventModel[] = this.events): {
    valid: boolean;
    checked_count: number;
    broken_at_seq: number | null;
    reason?: string;
  } {
    let expectedPrev = GENESIS_AUDIT_HASH;
    for (const evt of eventsToCheck) {
      if (evt.previous_hash !== expectedPrev) {
        return {
          valid: false,
          checked_count: evt.seq,
          broken_at_seq: evt.seq,
          reason: `Chain link mismatch at seq #${evt.seq}: expected previous_hash ${expectedPrev.slice(0, 12)}...`,
        };
      }
      const recomputed = computeAuditEventHash({
        event_id: evt.event_id,
        seq: evt.seq,
        alert_id: evt.alert_id,
        event_type: evt.event_type,
        timestamp: evt.timestamp,
        actor: evt.actor,
        action: evt.action,
        outcome: evt.outcome,
        metadata: evt.metadata,
        previous_hash: evt.previous_hash,
      });
      if (recomputed !== evt.event_hash) {
        return {
          valid: false,
          checked_count: evt.seq,
          broken_at_seq: evt.seq,
          reason: `Hash tamper detected at seq #${evt.seq}: recomputed SHA-256 does not match stored event_hash.`,
        };
      }
      expectedPrev = evt.event_hash;
    }

    return {
      valid: true,
      checked_count: eventsToCheck.length,
      broken_at_seq: null,
    };
  }

  simulateTamperCheck(): {
    valid: boolean;
    checked_count: number;
    broken_at_seq: number | null;
    reason?: string;
  } {
    if (this.events.length === 0) {
      return {
        valid: false,
        checked_count: 0,
        broken_at_seq: null,
        reason: 'No audit events recorded yet; start a call first to verify tamper detection.',
      };
    }
    const clone = this.events.map((e) => ({ ...e, metadata: { ...e.metadata } }));
    const targetIdx = Math.min(1, clone.length - 1);
    clone[targetIdx].action = 'TAMPERED_UNAUTHORIZED_EDIT';
    return this.verifyChainIntegrity(clone);
  }

  clearForSessionReset(): void {
    this.events.length = 0;
    this.flushLocalPersistence();
  }
}
