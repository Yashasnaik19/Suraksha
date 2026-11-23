import { AuditEntry } from './types';

export interface AuditLog {
  readonly productionMapping: string;
  append(params: {
    eventType: string;
    actor: string;
    summary: string;
    timestamp?: string;
  }): Promise<AuditEntry>;
  getEntries(): AuditEntry[];
  reset(): void;
}

export const GENESIS_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Computes SHA-256 hex digest using Web Crypto API in the browser
 * (and Node 20+ globalThis.crypto.subtle in tests). Never makes network calls.
 */
export async function computeSha256Hex(payload: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoded = new TextEncoder().encode(payload);
    const buffer = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    const bytes = Array.from(new Uint8Array(buffer));
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Deterministic 256-bit fallback if Web Crypto is unavailable in an older context
  const bytes = new TextEncoder().encode(payload);
  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  for (let i = 0; i < bytes.length; i += 1) {
    const idx = i % 8;
    state[idx] = (Math.imul(state[idx] ^ bytes[i], 0x01000193) + i) >>> 0;
  }
  return state.map((n) => n.toString(16).padStart(8, '0')).join('');
}

export class BrowserAuditLog implements AuditLog {
  readonly productionMapping = 'Append-only tamper-evident audit store';
  private entries: AuditEntry[] = [];

  async append(params: {
    eventType: string;
    actor: string;
    summary: string;
    timestamp?: string;
  }): Promise<AuditEntry> {
    const seq = this.entries.length + 1;
    const prevHash =
      this.entries.length > 0
        ? this.entries[this.entries.length - 1].hash
        : GENESIS_HASH;
    const timestamp =
      params.timestamp ?? new Date().toLocaleTimeString('en-GB', { hour12: false });

    const canonicalPayload = JSON.stringify({
      seq,
      timestamp,
      eventType: params.eventType,
      actor: params.actor,
      summary: params.summary,
      prevHash,
    });

    const hash = await computeSha256Hex(canonicalPayload);

    const entry: AuditEntry = {
      seq,
      id: `audit-${seq}`,
      timestamp,
      eventType: params.eventType,
      actor: params.actor,
      summary: params.summary,
      prevHash,
      hash,
      computedLocally: true,
    };

    this.entries = [...this.entries, entry];
    return entry;
  }

  getEntries(): AuditEntry[] {
    return [...this.entries];
  }

  reset(): void {
    this.entries = [];
  }
}
