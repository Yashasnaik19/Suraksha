export interface VoicePlaybackResult {
  mode: 'audio' | 'captions_only';
  caption: string;
  label: string;
}

export interface VoicePlayer {
  readonly label: string;
  play(caption: string, audioKey?: string): Promise<VoicePlaybackResult>;
  stop(): void;
}

/**
 * Checks whether local audio files are configured under /public/audio/.
 * In this offline ideathon mockup, no audio files are bundled by default,
 * so the player shows captions only without issuing failed network requests.
 * On hack day, populate AVAILABLE_AUDIO_FILES with filenames placed in /public/audio/.
 */
const AVAILABLE_AUDIO_FILES: Record<string, string> = {};

export class MockVoicePlayer implements VoicePlayer {
  readonly label = 'Voice: simulated (production: ElevenLabs)';
  private activeAudio: HTMLAudioElement | null = null;

  async play(caption: string, audioKey?: string): Promise<VoicePlaybackResult> {
    this.stop();

    if (
      typeof window !== 'undefined' &&
      audioKey &&
      AVAILABLE_AUDIO_FILES[audioKey]
    ) {
      try {
        const audio = new Audio(`/audio/${AVAILABLE_AUDIO_FILES[audioKey]}`);
        this.activeAudio = audio;
        await audio.play();
        return {
          mode: 'audio',
          caption,
          label: this.label,
        };
      } catch {
        // Fall back to captions only if browser autoplay or file playback fails
      }
    }

    return {
      mode: 'captions_only',
      caption,
      label: this.label,
    };
  }

  stop(): void {
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio.currentTime = 0;
      this.activeAudio = null;
    }
  }
}
