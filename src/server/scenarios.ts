import { ScenarioDefinition } from './types';

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'digital-arrest',
    title: 'Digital Arrest (CBI Parcel Threat)',
    category: 'Authority Impersonation + Coerced Secrecy',
    summary:
      'Caller impersonates CBI, claims a seized parcel, forces video-call isolation, and threatens arrest.',
    caller_label: 'Unknown Caller (+91-XXXX-XX-4821)',
    lines: [
      {
        speaker: 'Caller',
        text: 'Main CBI se bol raha hoon. Aapke naam par ek parcel pakda gaya hai.',
        english_subtitle:
          'I am speaking from the CBI. A parcel has been seized in your name.',
        hindi_subtitle:
          'मैं सीबीआई से बोल रहा हूँ। आपके नाम पर एक पार्सल पकड़ा गया है।',
        elapsed: '00:04',
      },
      {
        speaker: 'Caller',
        text: 'Aap video call par rahiye, kisi ko mat batana, warna turant arrest ho jayega.',
        english_subtitle:
          'Stay on this video call, do not tell anyone, otherwise you will be arrested immediately.',
        hindi_subtitle:
          'आप वीडियो कॉल पर रहिए, किसी को मत बताना, वरना तुरंत गिरफ्तारी हो जाएगी।',
        elapsed: '00:11',
      },
    ],
  },
  {
    id: 'otp-account-block',
    title: 'Bank KYC Block & OTP Extraction',
    category: 'Account Block Threat + OTP Request',
    summary:
      'Caller claims the parent bank account will be frozen today unless an OTP is read aloud immediately.',
    caller_label: 'Unknown Caller (Fake Bank KYC)',
    lines: [
      {
        speaker: 'Caller',
        text: 'Aapka SBI bank account aaj block ho jayega kyunki KYC expire ho gaya hai.',
        english_subtitle:
          'Your bank account will be blocked today because your KYC has expired.',
        hindi_subtitle:
          'आपका बैंक खाता आज ब्लॉक हो जाएगा क्योंकि आपका केवाईसी समाप्त हो गया है।',
        elapsed: '00:05',
      },
      {
        speaker: 'Caller',
        text: 'Abhi jo 6 digit OTP aaya hai woh turant bataiye verification ke liye.',
        english_subtitle:
          'Tell me the 6-digit OTP that just arrived immediately for verification.',
        hindi_subtitle:
          'अभी जो 6 अंकों का ओटीपी आया है वह सत्यापन के लिए तुरंत बताइए।',
        elapsed: '00:12',
      },
    ],
  },
  {
    id: 'urgent-upi',
    title: 'Urgent UPI Payment Demand',
    category: 'Urgent Payment + UPI Instruction',
    summary:
      'Caller pressures the parent into an immediate UPI transfer claiming a family medical emergency.',
    caller_label: 'Unknown Caller (Urgent Payment)',
    lines: [
      {
        speaker: 'Caller',
        text: 'Hospital mein emergency hai, kisi ko call mat karna, bas phone par raho.',
        english_subtitle:
          'There is a hospital emergency, do not call anyone else, just stay on this phone.',
        hindi_subtitle:
          'अस्पताल में इमरजेंसी है, किसी को कॉल मत करना, बस फोन पर रहो।',
        elapsed: '00:04',
      },
      {
        speaker: 'Caller',
        text: 'Turant UPI PIN daalkar is UPI ID par paise transfer kar dijiye abhi.',
        english_subtitle:
          'Enter your UPI PIN and transfer the money to this UPI ID right now.',
        hindi_subtitle:
          'तुरंत यूपीआई पिन डालकर इस यूपीआई आईडी पर पैसे ट्रांसफर कर दीजिए।',
        elapsed: '00:11',
      },
    ],
  },
  {
    id: 'remote-access',
    title: 'Remote-Access App & Suspicious Link',
    category: 'Remote-Access App + Suspicious URL',
    summary:
      'Caller instructs parent to click an unverified link and install AnyDesk to prevent electricity disconnection.',
    caller_label: 'Unknown Caller (Utility Disconnection)',
    lines: [
      {
        speaker: 'Caller',
        text: 'Aapka bijli connection aaj raat kat jayega agar bill update nahi hua.',
        english_subtitle:
          'Your electricity connection will be cut tonight if the bill is not updated.',
        hindi_subtitle:
          'यदि बिल अपडेट नहीं हुआ तो आज रात आपका बिजली कनेक्शन काट दिया जाएगा।',
        elapsed: '00:05',
      },
      {
        speaker: 'Caller',
        text: 'Yeh link http://kyc-bill-verify.example/support kholiye aur AnyDesk app install kijiye.',
        english_subtitle:
          'Open http://kyc-bill-verify.example/support and install the AnyDesk app.',
        hindi_subtitle:
          'यह लिंक http://kyc-bill-verify.example/support खोलिए और AnyDesk ऐप इंस्टॉल कीजिए।',
        elapsed: '00:13',
      },
    ],
  },
  {
    id: 'normal-call',
    title: 'Normal Family Conversation (Safe Control)',
    category: 'Benign Call',
    summary:
      'Everyday conversation about dinner and groceries with zero scam indicators.',
    caller_label: 'Family Contact (Daughter)',
    lines: [
      {
        speaker: 'Caller',
        text: 'Namaste Mummy, main shaam ko ghar aa rahi hoon, sabzi lete aau?',
        english_subtitle:
          'Hello Mom, I am coming home this evening, should I pick up vegetables?',
        hindi_subtitle:
          'नमस्ते मम्मी, मैं शाम को घर आ रही हूँ, सब्ज़ी लेते आऊँ?',
        elapsed: '00:04',
      },
      {
        speaker: 'Caller',
        text: 'Theek hai, aaram se chai pee lijiye, milte hain 7 baje.',
        english_subtitle:
          'Alright, have your tea comfortably, see you at 7 PM.',
        hindi_subtitle:
          'ठीक है, आराम से चाय पी लीजिए, शाम 7 बजे मिलते हैं।',
        elapsed: '00:10',
      },
    ],
  },
];

export function getScenarioById(id: string): ScenarioDefinition {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
