export const TTS_LANGUAGE_OPTIONS = {
  enIN: {
    code: 'en-IN',
    label: 'English',
    defaultVoice: 'alloy',
    muapiVoice: 'Friendly_Person',
    voices: [
      { value: 'alloy', label: 'Alloy' },
      { value: 'ash', label: 'Ash' },
      { value: 'sage', label: 'Sage' },
      { value: 'verse', label: 'Verse' },
      { value: 'coral', label: 'Coral' },
    ],
    styles: ['Natural', 'Professional', 'Energetic', 'Calm'],
  },
  hiIN: {
    code: 'hi-IN',
    label: 'Hindi',
    defaultVoice: 'alloy',
    muapiVoice: 'Friendly_Person',
    voices: [
      { value: 'alloy', label: 'Alloy' },
      { value: 'sage', label: 'Sage' },
      { value: 'verse', label: 'Verse' },
      { value: 'coral', label: 'Coral' },
    ],
    styles: ['Natural', 'Professional', 'Energetic', 'Calm'],
  },
};

export function normalizeLanguageCode(language) {
  const normalized = String(language || 'en-IN').trim();
  if (normalized === 'hi' || normalized === 'hi-IN') return 'hi-IN';
  if (normalized === 'en' || normalized === 'en-US' || normalized === 'en-IN') return 'en-IN';
  return normalized in TTS_LANGUAGE_OPTIONS ? normalized : 'en-IN';
}

export function getLanguageConfig(language) {
  const code = normalizeLanguageCode(language);
  return TTS_LANGUAGE_OPTIONS[code.replace('-', '')] || TTS_LANGUAGE_OPTIONS.enIN;
}

export function getVoiceOptions(language = 'en-IN') {
  const config = getLanguageConfig(language);
  return config.voices || TTS_LANGUAGE_OPTIONS.enIN.voices;
}

export function prepareScriptText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export const TTS_PROVIDER = 'openai';
export const TTS_LANGUAGE_CODES = Object.fromEntries(Object.values(TTS_LANGUAGE_OPTIONS).map((language) => [language.code, language]));
export const TTS_SUPPORTED_LANGUAGES = Object.freeze(Object.keys(TTS_LANGUAGE_CODES));
