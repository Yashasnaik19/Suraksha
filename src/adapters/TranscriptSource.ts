import { TranscriptSegment } from './types';

export interface TranscriptSource {
  readonly sourceLabel: string;
  readonly productionMapping: string;
  getScriptedSegments(): TranscriptSegment[];
  getWindow(upToIndex: number): TranscriptSegment[];
}

const SCRIPTED_SEGMENTS: TranscriptSegment[] = [
  {
    id: 'seg-1',
    stepIndex: 0,
    speaker: 'Scammer',
    text: 'Main CBI se bol raha hoon. Aapke naam par ek parcel pakda gaya hai.',
    subtitleEn: 'I am speaking from the CBI. A parcel has been seized in your name.',
    subtitleHi: 'मैं सीबीआई से बोल रहा हूँ। आपके नाम पर एक पार्सल पकड़ा गया है।',
    timestamp: '00:04',
    delayMs: 2000,
  },
  {
    id: 'seg-2',
    stepIndex: 1,
    speaker: 'Scammer',
    text: 'Aap video call par rahiye, kisi ko mat batana, warna arrest ho jayega.',
    subtitleEn: 'Stay on this video call, do not tell anyone, otherwise you will be arrested.',
    subtitleHi: 'आप वीडियो कॉल पर रहिए, किसी को मत बताना, वरना गिरफ्तारी हो जाएगी।',
    timestamp: '00:11',
    delayMs: 2400,
  },
  {
    id: 'seg-3',
    stepIndex: 2,
    speaker: 'Suraksha',
    text: 'Mummy, ruko. Koi agency video call par arrest nahi karti. Yeh scam hai.',
    subtitleEn: 'Mom, wait. No government agency conducts arrests on a video call. This is a scam.',
    subtitleHi: 'मम्मी, रुको। कोई भी एजेंसी वीडियो कॉल पर गिरफ्तारी नहीं करती। यह स्कैम है।',
    timestamp: '00:14',
    delayMs: 2200,
    audioKey: 'interruption_alert',
  },
  {
    id: 'seg-4',
    stepIndex: 3,
    speaker: 'Suraksha',
    text: 'Kya main Ansh ko abhi bula loon?',
    subtitleEn: 'Should I alert Ansh right now?',
    subtitleHi: 'क्या मैं अंश को अभी बुला लूँ?',
    timestamp: '00:18',
    delayMs: 1800,
    audioKey: 'ask_consent',
  },
];

export class MockTranscriptSource implements TranscriptSource {
  readonly sourceLabel = 'Call on speaker / merged call';
  readonly productionMapping = 'ElevenLabs Scribe v2 Realtime';

  getScriptedSegments(): TranscriptSegment[] {
    return SCRIPTED_SEGMENTS.map((segment) => ({ ...segment }));
  }

  getWindow(upToIndex: number): TranscriptSegment[] {
    if (upToIndex < 0) return [];
    return SCRIPTED_SEGMENTS.slice(0, upToIndex + 1).map((segment) => ({ ...segment }));
  }
}
