import {
  ApprovalToken,
  MCP_SERVER_CATALOG,
  McpServerName,
  McpTier,
  McpToolCallRecord,
  McpToolInvocationRequest,
  McpToolName,
} from './types';

export interface ToolGateway {
  readonly productionMapping: string;
  issueApprovalToken(alertId: string, now?: Date): ApprovalToken;
  invokeTool(
    request: McpToolInvocationRequest,
    now?: Date
  ): { record: McpToolCallRecord; output: Record<string, unknown> };
  getCallLog(): McpToolCallRecord[];
  reset(): void;
}

const SERVER_MAP = new Map(MCP_SERVER_CATALOG.map((def) => [def.name, def]));

const SENSITIVE_KEYS = new Set([
  'caller_number',
  'phone',
  'transcript_raw',
  'parent_name',
  'email_body',
]);

export function redactInputs(inputs: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (SENSITIVE_KEYS.has(key)) {
      redacted[key] = '[REDACTED]';
    } else if (key === 'approval_token' && value && typeof value === 'object') {
      const token = value as Partial<ApprovalToken>;
      redacted[key] = {
        tokenId: token.tokenId ?? '[MISSING]',
        alertId: token.alertId ?? '[MISSING]',
        signature: token.signature ? '[SIGNED_PRESENT]' : '[MISSING]',
      };
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function getTierForServer(server: McpServerName): McpTier {
  const def = SERVER_MAP.get(server);
  if (!def) {
    return 'Tier 1 (Read-Only)';
  }
  return def.tier;
}

function isToolRegistered(server: McpServerName, tool: McpToolName): boolean {
  const def = SERVER_MAP.get(server);
  return Boolean(def && def.tools.includes(tool));
}

export class MockToolGateway implements ToolGateway {
  readonly productionMapping =
    'Amazon Bedrock AgentCore Gateway + Cedar Policy + Lambda interceptor';

  private log: McpToolCallRecord[] = [];
  private seq = 0;

  issueApprovalToken(alertId: string, now = new Date()): ApprovalToken {
    const expires = new Date(now.getTime() + 120_000);
    return {
      tokenId: `tok_${alertId}_${now.getTime().toString(36)}`,
      alertId,
      issuedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      signature: `sig_sim_${alertId}_parent_yes`,
      scope: 'Family.alert_guardians',
      issuedBy: 'ParentConsentUI',
    };
  }

  invokeTool(
    request: McpToolInvocationRequest,
    now = new Date()
  ): { record: McpToolCallRecord; output: Record<string, unknown> } {
    this.seq += 1;
    const tier = getTierForServer(request.server);
    const timestamp = now.toLocaleTimeString('en-GB', { hour12: false });
    const redactedInputs = redactInputs({
      ...request.inputs,
      ...(request.approval_token !== undefined
        ? { approval_token: request.approval_token }
        : {}),
    });

    if (!isToolRegistered(request.server, request.tool)) {
      const record: McpToolCallRecord = {
        id: `mcp-${this.seq}`,
        timestamp,
        server: request.server,
        tool: request.tool,
        tier,
        redactedInputs,
        decision: 'DENY',
        reason: `default-deny: unknown tool ${request.server}.${request.tool}`,
        simulated: true,
        alertId: request.alert_id,
      };
      this.log = [record, ...this.log];
      return { record, output: { allowed: false, error: record.reason } };
    }

    // Policy enforcement: Family server (Tier 2) ALWAYS requires valid bound approval_token.
    // Permission does NOT depend on the prompt.
    if (request.server === 'Family') {
      const token = request.approval_token;
      if (!token) {
        const record: McpToolCallRecord = {
          id: `mcp-${this.seq}`,
          timestamp,
          server: request.server,
          tool: request.tool,
          tier,
          redactedInputs,
          decision: 'DENY',
          reason: 'default-deny, missing approval_token',
          simulated: true,
          alertId: request.alert_id,
        };
        this.log = [record, ...this.log];
        return { record, output: { allowed: false, error: record.reason } };
      }

      if (!request.alert_id || token.alertId !== request.alert_id) {
        const record: McpToolCallRecord = {
          id: `mcp-${this.seq}`,
          timestamp,
          server: request.server,
          tool: request.tool,
          tier,
          redactedInputs,
          decision: 'DENY',
          reason: 'default-deny, approval_token alert_id mismatch',
          simulated: true,
          alertId: request.alert_id,
        };
        this.log = [record, ...this.log];
        return { record, output: { allowed: false, error: record.reason } };
      }

      if (new Date(token.expiresAt).getTime() < now.getTime()) {
        const record: McpToolCallRecord = {
          id: `mcp-${this.seq}`,
          timestamp,
          server: request.server,
          tool: request.tool,
          tier,
          redactedInputs,
          decision: 'DENY',
          reason: 'default-deny, approval_token expired',
          simulated: true,
          alertId: request.alert_id,
        };
        this.log = [record, ...this.log];
        return { record, output: { allowed: false, error: record.reason } };
      }

      if (!token.signature || !token.signature.startsWith('sig_sim_')) {
        const record: McpToolCallRecord = {
          id: `mcp-${this.seq}`,
          timestamp,
          server: request.server,
          tool: request.tool,
          tier,
          redactedInputs,
          decision: 'DENY',
          reason: 'default-deny, invalid token signature',
          simulated: true,
          alertId: request.alert_id,
        };
        this.log = [record, ...this.log];
        return { record, output: { allowed: false, error: record.reason } };
      }

      const record: McpToolCallRecord = {
        id: `mcp-${this.seq}`,
        timestamp,
        server: request.server,
        tool: request.tool,
        tier,
        redactedInputs,
        decision: 'ALLOW',
        reason: `Interceptor validated signed approval_token (${token.tokenId}) bound to ${request.alert_id}`,
        simulated: true,
        alertId: request.alert_id,
      };
      this.log = [record, ...this.log];
      return {
        record,
        output: {
          allowed: true,
          notified: 'Ansh (Guardian)',
          channel: 'Simulated SNS notification',
        },
      };
    }

    // Tier 1 tools (Listen, Scam-Intel) and Audit.append_event run under explicit policy rules
    const tierReason =
      request.server === 'Audit'
        ? 'Append-only audit policy permits event logging'
        : 'Tier 1 read-only / zero-side-effect policy permits automatic execution';

    const record: McpToolCallRecord = {
      id: `mcp-${this.seq}`,
      timestamp,
      server: request.server,
      tool: request.tool,
      tier,
      redactedInputs,
      decision: 'ALLOW',
      reason: tierReason,
      simulated: true,
      alertId: request.alert_id,
    };
    this.log = [record, ...this.log];
    return { record, output: { allowed: true } };
  }

  getCallLog(): McpToolCallRecord[] {
    return [...this.log];
  }

  reset(): void {
    this.log = [];
    this.seq = 0;
  }
}
