import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { LLMProvider } from '../providers';
import {
  IntegrationHealthState,
  IntegrationMode,
  ScamSignalType,
  TranscriptLine,
} from '../types';

export type BedrockSimulationMode = 'normal' | 'timeout' | 'unavailable';

export interface BedrockExplanationOutput {
  explanation: string;
  hindi_script: string;
  source: 'BEDROCK_LIVE' | 'BEDROCK_FALLBACK';
  mode: IntegrationMode;
  fallback_reason?: string;
}

function buildDeterministicFallback(
  signals: ScamSignalType[],
  playbook: string | null
): { explanation: string; hindi_script: string } {
  const signalList =
    signals.length > 0 ? signals.join(', ') : 'suspicious pressure tactics';
  const playbookText = playbook ? ` (${playbook})` : '';
  return {
    explanation: `Deterministic rules flagged ${signalList}${playbookText}. No legitimate government office, bank, or police officer asks for OTP/PIN, secrecy on video calls, remote-access apps, or urgent UPI payments over a call.`,
    hindi_script:
      'मम्मी/पापा, घबराइए मत। कोई भी सरकारी अधिकारी, पुलिस या बैंक फोन पर OTP, पिन, पैसे या वीडियो कॉल पर गिरफ्तारी की धमकी नहीं देता। कृपया कॉल काटें और पहले परिवार से बात करें।',
  };
}

export class MockLLMProvider implements LLMProvider {
  readonly providerName = 'MockLLMProvider';
  getMode(): IntegrationMode {
    return 'LOCAL_MOCK';
  }
  getHealthState(): IntegrationHealthState {
    return 'MOCK';
  }
  async generateExplanation(params: {
    signals: ScamSignalType[];
    playbook: string | null;
    transcript: TranscriptLine[];
  }): Promise<BedrockExplanationOutput> {
    return {
      ...buildDeterministicFallback(params.signals, params.playbook),
      source: 'BEDROCK_FALLBACK',
      mode: 'LOCAL_MOCK',
      fallback_reason:
        'MOCK MODE: Context-aware explanation and Hindi script generated locally.',
    };
  }
}

export class AmazonBedrockProvider implements LLMProvider {
  readonly providerName = 'AmazonBedrockProvider';
  private lastCallFailed = false;

  getMode(): IntegrationMode {
    if (process.env.SURAKSHA_MODE_BEDROCK === 'MOCK') return 'LOCAL_MOCK';
    const hasAwsCreds =
      (Boolean(process.env.AWS_ACCESS_KEY_ID) &&
        Boolean(process.env.AWS_SECRET_ACCESS_KEY)) ||
      process.env.SURAKSHA_MODE_BEDROCK === 'LIVE';
    return hasAwsCreds ? 'LIVE' : 'LOCAL_MOCK';
  }

  getHealthState(simulationMode: BedrockSimulationMode = 'normal'): IntegrationHealthState {
    if (simulationMode !== 'normal' || this.lastCallFailed) {
      return 'CONNECTION FAILED';
    }
    if (process.env.SURAKSHA_MODE_BEDROCK === 'MOCK') return 'MOCK';
    if (process.env.SURAKSHA_MODE_BEDROCK === 'LIVE') {
      return (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
        process.env.AWS_SESSION_TOKEN
        ? 'LIVE'
        : 'PENDING CONFIGURATION';
    }
    return this.getMode() === 'LIVE' ? 'LIVE' : 'MOCK';
  }

  async generateExplanation(params: {
    signals: ScamSignalType[];
    playbook: string | null;
    transcript: TranscriptLine[];
    simulationMode?: BedrockSimulationMode;
    timeoutMs?: number;
  }): Promise<BedrockExplanationOutput> {
    const simMode = params.simulationMode ?? 'normal';
    const fallback = buildDeterministicFallback(params.signals, params.playbook);

    if (simMode === 'unavailable') {
      this.lastCallFailed = true;
      return {
        ...fallback,
        source: 'BEDROCK_FALLBACK',
        mode: this.getMode(),
        fallback_reason: 'Bedrock simulated unavailable; safety alert unaffected.',
      };
    }

    const timeoutMs =
      params.timeoutMs ?? Number(process.env.BEDROCK_TIMEOUT_MS || '2500');

    if (simMode === 'timeout') {
      this.lastCallFailed = true;
      await new Promise((resolve) => setTimeout(resolve, Math.min(timeoutMs, 150)));
      return {
        ...fallback,
        source: 'BEDROCK_FALLBACK',
        mode: this.getMode(),
        fallback_reason:
          'Bedrock timed out; fallback explanation used without delaying alert.',
      };
    }

    this.lastCallFailed = false;

    if (this.getMode() === 'LIVE') {
      const region = process.env.AWS_REGION || 'ap-south-1';
      const modelId =
        process.env.BEDROCK_MODEL_ID ||
        'anthropic.claude-3-5-sonnet-20240620-v1:0';
      const client = new BedrockRuntimeClient({ region });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const transcriptSummary = params.transcript
          .filter((l) => l.speaker === 'Caller')
          .map((l) => `[${l.elapsed}] ${l.text}`)
          .join('\n');

        const prompt = [
          'You are explaining a detected phone scam risk to an Indian family.',
          `Detected signals: ${params.signals.join(', ')}`,
          `Playbook: ${params.playbook ?? 'None'}`,
          `Transcript:\n${transcriptSummary}`,
          'Return strict JSON with keys "explanation" (2 calm English sentences) and "hindi_script" (calm Devanagari Hindi reassurance script for the parent). Never tell the parent a payment or link is safe.',
        ].join('\n\n');

        const response = await client.send(
          new ConverseCommand({
            modelId,
            messages: [{ role: 'user', content: [{ text: prompt }] }],
            inferenceConfig: { temperature: 0.2, maxTokens: 320 },
          }),
          { abortSignal: controller.signal }
        );

        clearTimeout(timer);
        const rawText =
          response.output?.message?.content?.[0]?.text?.trim() ?? '';
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as {
            explanation?: string;
            hindi_script?: string;
          };
          if (parsed.explanation && parsed.hindi_script) {
            return {
              explanation: parsed.explanation,
              hindi_script: parsed.hindi_script,
              source: 'BEDROCK_LIVE',
              mode: 'LIVE',
            };
          }
        }
      } catch (err) {
        clearTimeout(timer);
        this.lastCallFailed = true;
        return {
          ...fallback,
          source: 'BEDROCK_FALLBACK',
          mode: 'LIVE',
          fallback_reason: `Bedrock fallback triggered (${err instanceof Error ? err.message : 'error'})`,
        };
      }
    }

    return {
      ...fallback,
      source: 'BEDROCK_FALLBACK',
      mode: 'LOCAL_MOCK',
      fallback_reason:
        'LOCAL MOCK MODE: AWS credentials not set; deterministic explanation and Hindi script generated.',
    };
  }
}

export { AmazonBedrockProvider as BedrockExplanationAdapter };
