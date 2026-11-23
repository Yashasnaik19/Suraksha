import fs from 'node:fs';
import path from 'node:path';
import { SpeechToTextProvider, TextToSpeechProvider } from '../providers';
import {
  IntegrationHealthState,
  IntegrationMode,
  VoiceClipStatus,
} from '../types';

export interface PreApprovedClip {
  clip_id: string;
  label: string;
  transcript: string;
  hindi_subtitle: string;
  english_subtitle: string;
  consented_by: string;
}

export const PRE_GENERATED_CLIPS: Record<string, PreApprovedClip> = {
  digital_arrest: {
    clip_id: 'clip_family_digital_arrest_v1',
    label: 'Consented Family Voice — Digital Arrest Warning',
    transcript:
      'Mummy, ruko. Koi agency video call par arrest nahi karti. Yeh scam hai. Kya main Ansh ko abhi bula loon?',
    hindi_subtitle:
      'मम्मी, रुको। कोई भी एजेंसी वीडियो कॉल पर गिरफ्तारी नहीं करती। यह स्कैम है। क्या मैं अंश को अभी बुला लूँ?',
    english_subtitle:
      'Mom, wait. No agency conducts arrests over a video call. This is a scam. Kya main Ansh ko abhi bula loon?',
    consented_by: 'Parent & Ansh (Pre-consented)',
  },
  otp_pin: {
    clip_id: 'clip_family_otp_v1',
    label: 'Consented Family Voice — OTP/PIN Protection',
    transcript:
      'Mummy, ruko! Bank ya koi adhikari kabhi phone par OTP ya PIN nahi maangta. Kya main Ansh ko abhi bula loon?',
    hindi_subtitle:
      'मम्मी, रुको! बैंक या कोई अधिकारी कभी फोन पर ओटीपी या पिन नहीं माँगता। क्या मैं अंश को अभी बुला लूँ?',
    english_subtitle:
      'Mom, wait! No bank or official ever asks for an OTP or PIN on a call. Kya main Ansh ko abhi bula loon?',
    consented_by: 'Parent & Ansh (Pre-consented)',
  },
  remote_access: {
    clip_id: 'clip_family_remote_app_v1',
    label: 'Consented Family Voice — Remote App & Link Block',
    transcript:
      'Mummy, ruko! Koi link mat kholna aur AnyDesk jaisa app install mat karna. Kya main Ansh ko abhi bula loon?',
    hindi_subtitle:
      'मम्मी, रुको! कोई लिंक मत खोलना और AnyDesk जैसा ऐप इंस्टॉल मत करना। क्या मैं अंश को अभी बुला लूँ?',
    english_subtitle:
      'Mom, wait! Do not open any link or install apps like AnyDesk. Kya main Ansh ko abhi bula loon?',
    consented_by: 'Parent & Ansh (Pre-consented)',
  },
  general_scam: {
    clip_id: 'clip_family_general_v1',
    label: 'Consented Family Voice — Urgent Payment Warning',
    transcript:
      'Mummy, ruko! Jaldbazi mein koi paise ya UPI transfer mat karna. Kya main Ansh ko abhi bula loon?',
    hindi_subtitle:
      'मम्मी, रुको! जल्दबाज़ी में कोई पैसे या यूपीआई ट्रांसफर मत करना। क्या मैं अंश को अभी बुला लूँ?',
    english_subtitle:
      'Mom, wait! Do not send any money or UPI transfer in a hurry. Kya main Ansh ko abhi bula loon?',
    consented_by: 'Parent & Ansh (Pre-consented)',
  },
};

export class MockSpeechToTextProvider implements SpeechToTextProvider {
  readonly providerName = 'MockSpeechToTextProvider';
  getMode(): IntegrationMode {
    return 'LOCAL_MOCK';
  }
  getHealthState(): IntegrationHealthState {
    return 'MOCK';
  }
  getModelName(): string {
    return process.env.ELEVENLABS_SCRIBE_MODEL || 'scribe_v2_realtime';
  }
  async createRealtimeSessionConfig() {
    return {
      mode: 'LOCAL_MOCK' as const,
      model: this.getModelName(),
      websocket_url: 'wss://api.elevenlabs.io/v1/speech-to-text/realtime',
      note: 'DEMO MODE: Progressive scripted stream / browser microphone without ElevenLabs API key.',
    };
  }
}

export class ElevenLabsScribeProvider implements SpeechToTextProvider {
  readonly providerName = 'ElevenLabsScribeProvider';

  getMode(): IntegrationMode {
    if (process.env.SURAKSHA_MODE_SCRIBE === 'MOCK') return 'LOCAL_MOCK';
    return process.env.ELEVENLABS_API_KEY ? 'LIVE' : 'LOCAL_MOCK';
  }

  getHealthState(): IntegrationHealthState {
    if (process.env.SURAKSHA_MODE_SCRIBE === 'MOCK') return 'MOCK';
    if (process.env.SURAKSHA_MODE_SCRIBE === 'LIVE') {
      return process.env.ELEVENLABS_API_KEY ? 'LIVE' : 'PENDING CONFIGURATION';
    }
    return process.env.ELEVENLABS_API_KEY ? 'LIVE' : 'MOCK';
  }

  getModelName(): string {
    return process.env.ELEVENLABS_SCRIBE_MODEL || 'scribe_v2_realtime';
  }

  async createRealtimeSessionConfig(): Promise<{
    mode: IntegrationMode;
    model: string;
    websocket_url: string;
    note: string;
  }> {
    const mode = this.getMode();
    return {
      mode,
      model: this.getModelName(),
      websocket_url: 'wss://api.elevenlabs.io/v1/speech-to-text/realtime',
      note:
        mode === 'LIVE'
          ? 'ELEVENLABS_API_KEY configured on server; WebSocket session ready.'
          : 'MOCK MODE: Using progressive scripted stream / browser microphone capture without external ElevenLabs key.',
    };
  }
}

export class MockTTSProvider implements TextToSpeechProvider {
  readonly providerName = 'MockTTSProvider';

  getMode(): IntegrationMode {
    return 'LOCAL_MOCK';
  }

  getHealthState(): IntegrationHealthState {
    return 'MOCK';
  }

  async triggerPreGeneratedClip(playbook: string | null): Promise<VoiceClipStatus> {
    const clip = selectClipForPlaybook(playbook);
    const localAudioFile = path.resolve(
      process.cwd(),
      'public',
      'audio',
      `${clip.clip_id}.mp3`
    );
    const hasLocalAudio = fs.existsSync(localAudioFile);
    return {
      clip_id: clip.clip_id,
      label: clip.label,
      transcript: clip.transcript,
      hindi_subtitle: clip.hindi_subtitle,
      english_subtitle: clip.english_subtitle,
      triggered_at: new Date().toISOString(),
      mode: 'LOCAL_MOCK',
      audio_url: hasLocalAudio ? `/audio/${clip.clip_id}.mp3` : null,
      pre_generated_only: true,
      consent_verified: true,
      consented_by: clip.consented_by,
      echo_suppressed: true,
    };
  }

  async fetchLivePreGeneratedClipAudio(): Promise<ArrayBuffer | null> {
    return null;
  }
}

export function selectClipForPlaybook(playbook: string | null): PreApprovedClip {
  if (!playbook) return PRE_GENERATED_CLIPS.general_scam;
  if (playbook.includes('Digital Arrest')) {
    return PRE_GENERATED_CLIPS.digital_arrest;
  }
  if (playbook.includes('OTP')) {
    return PRE_GENERATED_CLIPS.otp_pin;
  }
  if (playbook.includes('Remote-Access')) {
    return PRE_GENERATED_CLIPS.remote_access;
  }
  return PRE_GENERATED_CLIPS.general_scam;
}

export class ElevenLabsTTSProvider implements TextToSpeechProvider {
  readonly providerName = 'ElevenLabsTTSProvider';

  getMode(): IntegrationMode {
    if (process.env.SURAKSHA_MODE_TTS === 'MOCK') return 'LOCAL_MOCK';
    return process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID
      ? 'LIVE'
      : 'LOCAL_MOCK';
  }

  getHealthState(): IntegrationHealthState {
    if (process.env.SURAKSHA_MODE_TTS === 'MOCK') return 'MOCK';
    if (process.env.SURAKSHA_MODE_TTS === 'LIVE') {
      return process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID
        ? 'LIVE'
        : 'PENDING CONFIGURATION';
    }
    return this.getMode() === 'LIVE' ? 'LIVE' : 'MOCK';
  }

  selectClipForPlaybook(playbook: string | null): PreApprovedClip {
    return selectClipForPlaybook(playbook);
  }

  async triggerPreGeneratedClip(
    playbook: string | null
  ): Promise<VoiceClipStatus> {
    const clip = this.selectClipForPlaybook(playbook);
    const mode = this.getMode();
    const localAudioFile = path.resolve(
      process.cwd(),
      'public',
      'audio',
      `${clip.clip_id}.mp3`
    );
    const hasLocalAudio = fs.existsSync(localAudioFile);

    let audioUrl: string | null = hasLocalAudio
      ? `/audio/${clip.clip_id}.mp3`
      : null;

    if (mode === 'LIVE') {
      // Only synthesize exact pre-approved clip text — never AI-generated responses
      audioUrl = `/api/voice/clip/${clip.clip_id}`;
    }

    return {
      clip_id: clip.clip_id,
      label: clip.label,
      transcript: clip.transcript,
      hindi_subtitle: clip.hindi_subtitle,
      english_subtitle: clip.english_subtitle,
      triggered_at: new Date().toISOString(),
      mode,
      audio_url: audioUrl,
      pre_generated_only: true,
      consent_verified: true,
      consented_by: clip.consented_by,
      echo_suppressed: true,
    };
  }

  async fetchLivePreGeneratedClipAudio(
    clipId: string
  ): Promise<ArrayBuffer | null> {
    const clip = Object.values(PRE_GENERATED_CLIPS).find(
      (c) => c.clip_id === clipId
    );
    if (!clip) return null;

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    if (!apiKey || !voiceId) return null;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: clip.transcript,
          model_id: 'eleven_multilingual_v2',
        }),
      }
    );

    if (!response.ok) {
      return null;
    }
    return response.arrayBuffer();
  }
}

// Backward-compatible exports
export {
  ElevenLabsScribeProvider as ElevenLabsScribeAdapter,
  ElevenLabsTTSProvider as ElevenLabsTtsAdapter,
};
