import crypto from 'node:crypto';
import {
  ApprovalRecordInternal,
  McpToolName,
  PublicApprovalSummary,
} from './types';

export interface SignedApprovalTokenPayload {
  token_id: string;
  alert_id: string;
  approver_id: string;
  permitted_actions: McpToolName[];
  issued_at: string;
  expires_at: string;
  nonce: string;
  signature: string;
}

export interface InterceptorValidationResult {
  signature_valid: boolean;
  not_expired: boolean;
  alert_id_match: boolean;
  one_time_unused: boolean;
  scope_authorized: boolean;
  failure_reasons: string[];
}

const EXPLICIT_HAAN_PATTERNS = [
  /^\s*haan\s*[.!?।]*$/i,
  /^\s*haan\s+(?:bula lo|call ansh|alert family|karo|theek hai)\s*[.!?।]*$/i,
  /^\s*हाँ\s*[.!?।]*$/,
  /^\s*yes\s*(?:alert|call ansh|please)?\s*[.!?।]*$/i,
];

const EXPLICIT_NAHI_PATTERNS = [
  /^\s*nahi\s*[.!?।]*$/i,
  /^\s*नहीं\s*[.!?।]*$/,
  /^\s*no\s*(?:thanks|alert)?\s*[.!?।]*$/i,
];

export function parseParentVoiceApproval(
  utterance: string
): 'haan' | 'nahi' | 'ambiguous' {
  const cleaned = utterance.trim();
  if (!cleaned) return 'ambiguous';
  if (EXPLICIT_HAAN_PATTERNS.some((p) => p.test(cleaned))) {
    return 'haan';
  }
  if (EXPLICIT_NAHI_PATTERNS.some((p) => p.test(cleaned))) {
    return 'nahi';
  }
  return 'ambiguous';
}

export class ApprovalService {
  // Signing key lives strictly in server memory / env — never returned to browser
  private readonly signingKey: Buffer;
  private readonly records = new Map<string, ApprovalRecordInternal>();
  private readonly history: ApprovalRecordInternal[] = [];

  constructor(secretOverride?: string) {
    const envSecret = secretOverride ?? process.env.APPROVAL_SIGNING_SECRET;
    this.signingKey = envSecret
      ? Buffer.from(envSecret, 'utf8')
      : crypto.randomBytes(32);
  }

  private signPayload(fields: {
    token_id: string;
    alert_id: string;
    approver_id: string;
    permitted_actions: McpToolName[];
    issued_at: string;
    expires_at: string;
    nonce: string;
  }): string {
    const canonical = JSON.stringify(fields);
    return crypto
      .createHmac('sha256', this.signingKey)
      .update(canonical)
      .digest('hex');
  }

  toPublicSummary(rec: ApprovalRecordInternal): PublicApprovalSummary {
    return {
      token_id: rec.token_id,
      alert_id: rec.alert_id,
      approver_id: rec.approver_id,
      permitted_actions: [...rec.permitted_actions],
      issued_at: rec.issued_at,
      expires_at: rec.expires_at,
      nonce_preview: `${rec.nonce.slice(0, 6)}...`,
      signature_preview: `hmac_sha256:${rec.signature.slice(0, 8)}...[SERVER_ONLY]`,
      used_at: rec.used_at,
      status: rec.status,
    };
  }

  issueApprovalToken(params: {
    alert_id: string;
    approver_id?: string;
    permitted_actions?: McpToolName[];
    ttlSeconds?: number;
    now?: Date;
  }): {
    internalToken: SignedApprovalTokenPayload;
    publicSummary: PublicApprovalSummary;
  } {
    const now = params.now ?? new Date();
    const ttlSeconds =
      params.ttlSeconds ??
      Number(process.env.APPROVAL_TOKEN_TTL_SECONDS || '120');
    const expires = new Date(now.getTime() + ttlSeconds * 1000);
    const token_id = `tok_${params.alert_id}_${crypto.randomUUID().slice(0, 8)}`;
    const approver_id = params.approver_id ?? 'parent-device-primary';
    const permitted_actions: McpToolName[] = params.permitted_actions ?? [
      'alert_guardians',
      'send_family_voice_message',
    ];
    const issued_at = now.toISOString();
    const expires_at = expires.toISOString();
    const nonce = crypto.randomBytes(12).toString('hex');

    const signature = this.signPayload({
      token_id,
      alert_id: params.alert_id,
      approver_id,
      permitted_actions,
      issued_at,
      expires_at,
      nonce,
    });

    const record: ApprovalRecordInternal = {
      token_id,
      alert_id: params.alert_id,
      approver_id,
      permitted_actions,
      issued_at,
      expires_at,
      nonce,
      signature,
      used_at: null,
      status: 'ACTIVE',
    };

    this.records.set(token_id, record);
    this.history.unshift(record);

    return {
      internalToken: {
        token_id,
        alert_id: params.alert_id,
        approver_id,
        permitted_actions,
        issued_at,
        expires_at,
        nonce,
        signature,
      },
      publicSummary: this.toPublicSummary(record),
    };
  }

  getInternalToken(tokenId: string): SignedApprovalTokenPayload | null {
    const rec = this.records.get(tokenId);
    if (!rec) return null;
    return {
      token_id: rec.token_id,
      alert_id: rec.alert_id,
      approver_id: rec.approver_id,
      permitted_actions: [...rec.permitted_actions],
      issued_at: rec.issued_at,
      expires_at: rec.expires_at,
      nonce: rec.nonce,
      signature: rec.signature,
    };
  }

  validateToken(params: {
    token: SignedApprovalTokenPayload | null | undefined;
    expectedAlertId: string;
    requestedAction: McpToolName | string;
    now?: Date;
  }): InterceptorValidationResult {
    const now = params.now ?? new Date();
    const t = params.token;

    if (!t) {
      return {
        signature_valid: false,
        not_expired: false,
        alert_id_match: false,
        one_time_unused: false,
        scope_authorized: false,
        failure_reasons: ['missing approval_token'],
      };
    }

    const expectedSig = this.signPayload({
      token_id: t.token_id,
      alert_id: t.alert_id,
      approver_id: t.approver_id,
      permitted_actions: t.permitted_actions,
      issued_at: t.issued_at,
      expires_at: t.expires_at,
      nonce: t.nonce,
    });

    let signature_valid = false;
    try {
      const a = Buffer.from(t.signature, 'hex');
      const b = Buffer.from(expectedSig, 'hex');
      signature_valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      signature_valid = false;
    }

    const not_expired = new Date(t.expires_at).getTime() > now.getTime();
    const alert_id_match = t.alert_id === params.expectedAlertId;

    const stored = this.records.get(t.token_id);
    const one_time_unused = Boolean(
      stored &&
        stored.used_at === null &&
        stored.status === 'ACTIVE' &&
        stored.nonce === t.nonce
    );
    const scope_authorized = Array.isArray(t.permitted_actions)
      ? t.permitted_actions.includes(params.requestedAction as McpToolName)
      : false;

    if (stored && !not_expired && stored.status === 'ACTIVE') {
      stored.status = 'EXPIRED';
    }

    const failure_reasons: string[] = [];
    if (!signature_valid)
      failure_reasons.push('invalid HMAC signature or tampered payload');
    if (!not_expired) failure_reasons.push('token expired');
    if (!alert_id_match) failure_reasons.push('alert_id mismatch');
    if (!one_time_unused)
      failure_reasons.push(
        'token missing from active registry or already used (replay)'
      );
    if (!scope_authorized)
      failure_reasons.push(
        `action "${params.requestedAction}" outside permitted scope`
      );

    return {
      signature_valid,
      not_expired,
      alert_id_match,
      one_time_unused,
      scope_authorized,
      failure_reasons,
    };
  }

  markTokenUsed(tokenId: string, now = new Date()): void {
    const rec = this.records.get(tokenId);
    if (rec && rec.used_at === null) {
      rec.used_at = now.toISOString();
      rec.status = 'USED';
    }
  }

  getHistory(): PublicApprovalSummary[] {
    return this.history.map((r) => this.toPublicSummary(r));
  }

  reset(): void {
    this.records.clear();
    this.history.length = 0;
  }
}
