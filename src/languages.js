/* ============================================================
   CLINICALFLOW — Language Registry
   Centralized language data for Deepgram, Whisper, WebSpeech,
   note generation, and corrections dictionaries.
   ============================================================ */

// Each entry:
//   code    — BCP-47 code (Deepgram, WebSpeech, App.language)
//   whisper — ISO 639-1 code for Whisper --language flag
//   label   — Display name for UI

export const LANGUAGES = [
  // English variants
  { code: 'en-US',  whisper: 'en', label: 'English (US)' },
  { code: 'en-GB',  whisper: 'en', label: 'English (UK)' },
  { code: 'en-AU',  whisper: 'en', label: 'English (Australia)' },
  { code: 'en-IN',  whisper: 'en', label: 'English (India)' },

  // Major clinical languages
  { code: 'es',     whisper: 'es', label: 'Spanish' },
  { code: 'es-419', whisper: 'es', label: 'Spanish (Latin America)' },
  { code: 'fr',     whisper: 'fr', label: 'French' },
  { code: 'de',     whisper: 'de', label: 'German' },
  { code: 'pt',     whisper: 'pt', label: 'Portuguese' },
  { code: 'pt-BR',  whisper: 'pt', label: 'Portuguese (Brazil)' },
  { code: 'it',     whisper: 'it', label: 'Italian' },
  { code: 'nl',     whisper: 'nl', label: 'Dutch' },

  // Asian languages
  { code: 'ja',     whisper: 'ja', label: 'Japanese' },
  { code: 'ko',     whisper: 'ko', label: 'Korean' },
  { code: 'zh-CN',  whisper: 'zh', label: 'Chinese (Simplified)' },
  { code: 'zh-TW',  whisper: 'zh', label: 'Chinese (Traditional)' },
  { code: 'hi',     whisper: 'hi', label: 'Hindi' },
  { code: 'ta',     whisper: 'ta', label: 'Tamil' },
  { code: 'te',     whisper: 'te', label: 'Telugu' },
  { code: 'th',     whisper: 'th', label: 'Thai' },
  { code: 'vi',     whisper: 'vi', label: 'Vietnamese' },
  { code: 'id',     whisper: 'id', label: 'Indonesian' },
  { code: 'ms',     whisper: 'ms', label: 'Malay' },

  // Middle Eastern / African
  { code: 'ar',     whisper: 'ar', label: 'Arabic' },
  { code: 'he',     whisper: 'he', label: 'Hebrew' },
  { code: 'tr',     whisper: 'tr', label: 'Turkish' },

  // Eastern European
  { code: 'ru',     whisper: 'ru', label: 'Russian' },
  { code: 'uk',     whisper: 'uk', label: 'Ukrainian' },
  { code: 'pl',     whisper: 'pl', label: 'Polish' },
  { code: 'cs',     whisper: 'cs', label: 'Czech' },
  { code: 'sk',     whisper: 'sk', label: 'Slovak' },
  { code: 'hu',     whisper: 'hu', label: 'Hungarian' },
  { code: 'ro',     whisper: 'ro', label: 'Romanian' },
  { code: 'bg',     whisper: 'bg', label: 'Bulgarian' },
  { code: 'hr',     whisper: 'hr', label: 'Croatian' },
  { code: 'sl',     whisper: 'sl', label: 'Slovenian' },
  { code: 'el',     whisper: 'el', label: 'Greek' },

  // Nordic
  { code: 'sv',     whisper: 'sv', label: 'Swedish' },
  { code: 'da',     whisper: 'da', label: 'Danish' },
  { code: 'no',     whisper: 'no', label: 'Norwegian' },
  { code: 'fi',     whisper: 'fi', label: 'Finnish' },
];

/** Map BCP-47 code to Whisper ISO 639-1 code */
export function getWhisperCode(bcp47) {
  const lang = LANGUAGES.find(l => l.code === bcp47);
  if (lang) return lang.whisper;
  return bcp47.split('-')[0].toLowerCase();
}

/** Get display label for a language code */
export function getLanguageLabel(code) {
  const lang = LANGUAGES.find(l => l.code === code);
  return lang ? lang.label : code;
}

/** Check if language code is an English variant */
export function isEnglish(code) {
  return code.startsWith('en');
}
