import fs from 'node:fs';
import path from 'node:path';
import { McpServerGroup, McpToolName } from './types';

const FALLBACK_CEDAR_SOURCE = `// Suraksha Cedar Policy Set (Default-Deny, Forbid-Wins)
forbid (principal, action in [SurakshaAction::"reply_to_scammer", SurakshaAction::"click_untrusted_url", SurakshaAction::"execute_upi_payment", SurakshaAction::"auto_submit_police_report"], resource);`;

function loadCedarPolicySource(): string {
  try {
    const policyPath = path.resolve(process.cwd(), 'policies', 'suraksha.cedar');
    if (fs.existsSync(policyPath)) {
      return fs.readFileSync(policyPath, 'utf8');
    }
  } catch {
    // Use fallback if filesystem read fails
  }
  return FALLBACK_CEDAR_SOURCE;
}

export const CEDAR_POLICY_SOURCE = loadCedarPolicySource();

export interface CedarEvaluationContext {
  principal: string;
  server: McpServerGroup;
  action: McpToolName | string;
  cognito_authorized: boolean;
  interceptor: {
    signature_valid: boolean;
    not_expired: boolean;
    alert_id_match: boolean;
    one_time_unused: boolean;
    scope_authorized: boolean;
  };
}

export interface CedarEvaluationResult {
  decision: 'ALLOW' | 'DENY';
  matched_rule: string;
  reason: string;
}

const TIER_3_BLOCKED_ACTIONS = new Set([
  'reply_to_scammer',
  'converse_with_scammer',
  'click_untrusted_url',
  'execute_upi_payment',
  'open_banking_app',
  'disclose_otp_pin',
  'install_remote_access_app',
  'auto_submit_police_report',
  'claim_payment_safe',
]);

const TIER_1_ALLOWED: Record<string, McpServerGroup> = {
  get_transcript_window: 'Listen',
  match_scam_playbook: 'Scam-Intel',
  score_signals: 'Scam-Intel',
  check_url: 'Scam-Intel',
  prepare_evidence_pack: 'Scam-Intel',
};

const FAMILY_ACTIONS = new Set<string>([
  'alert_guardians',
  'send_family_voice_message',
]);

export function evaluateCedarPolicy(
  ctx: CedarEvaluationContext
): CedarEvaluationResult {
  // FORBID-WINS RULE 1: Tier 3 global prohibitions
  if (TIER_3_BLOCKED_ACTIONS.has(ctx.action)) {
    return {
      decision: 'DENY',
      matched_rule: 'forbid-tier3-prohibited-action',
      reason: `Cedar forbid-wins: action "${ctx.action}" violates Tier 3 safety prohibitions.`,
    };
  }

  // FORBID-WINS RULE 2: Unauthenticated Cognito caller
  if (!ctx.cognito_authorized) {
    return {
      decision: 'DENY',
      matched_rule: 'default-deny-cognito-required',
      reason:
        'Cedar default-deny: valid Cognito OAuth authorizer context is required.',
    };
  }

  // FORBID-WINS RULE 3: Family Tier 2 must pass ALL Lambda Interceptor checks
  if (ctx.server === 'Family' || FAMILY_ACTIONS.has(ctx.action)) {
    const i = ctx.interceptor;
    const failures: string[] = [];
    if (!i.signature_valid) failures.push('invalid_or_missing_signature');
    if (!i.not_expired) failures.push('token_expired');
    if (!i.alert_id_match) failures.push('alert_id_mismatch');
    if (!i.one_time_unused) failures.push('token_already_used_or_replayed');
    if (!i.scope_authorized) failures.push('unauthorized_scope');

    if (failures.length > 0) {
      return {
        decision: 'DENY',
        matched_rule: 'forbid-family-without-valid-bound-token',
        reason: `Cedar forbid-wins: blocked ${ctx.server}.${ctx.action} (${failures.join(', ')}).`,
      };
    }

    if (
      ctx.principal === 'Orchestrator::suraksha-lambda' &&
      FAMILY_ACTIONS.has(ctx.action)
    ) {
      return {
        decision: 'ALLOW',
        matched_rule: 'permit-family-with-verified-approval-token',
        reason:
          'Cedar permit: Lambda Interceptor verified signed, unspent, unexpired, alert-bound approval_token.',
      };
    }

    return {
      decision: 'DENY',
      matched_rule: 'default-deny-family-principal',
      reason: `Cedar default-deny: principal "${ctx.principal}" is not permitted for Family MCP.`,
    };
  }

  // PERMIT RULE 3: Tier 1 Listen & Scam-Intel tools
  if (
    ctx.principal === 'Orchestrator::suraksha-lambda' &&
    TIER_1_ALLOWED[ctx.action] === ctx.server
  ) {
    return {
      decision: 'ALLOW',
      matched_rule: 'permit-tier1-read-or-intel',
      reason: `Cedar permit: ${ctx.server}.${ctx.action} is Tier 1 (no approval token required).`,
    };
  }

  // PERMIT RULE 5: Audit append-only
  if (
    ctx.principal === 'Orchestrator::suraksha-lambda' &&
    ctx.server === 'Audit' &&
    ctx.action === 'append_event'
  ) {
    return {
      decision: 'ALLOW',
      matched_rule: 'permit-audit-append-only',
      reason: 'Cedar permit: Audit.append_event is append-only.',
    };
  }

  // DEFAULT DENY
  return {
    decision: 'DENY',
    matched_rule: 'default-deny-catchall',
    reason: `Cedar default-deny: no permit policy matches ${ctx.server}.${ctx.action}.`,
  };
}
