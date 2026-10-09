import { createTemporaryFile } from '../storage.js';
import { getLanguageConfig, normalizeLanguageCode, prepareScriptText } from './languages.js';

export class OpenAiTtsProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.TTS_API_KEY || process.env.OPENAI_API_KEY;
    this.model = options.model || process.env.TTS_MODEL || 'gpt-4o-mini-tts';
    this.fetch = options.fetch || globalThis.fetch;
  }

  isAvailable() {
    return Boolean(this.apiKey);
  }

  estimateDuration(text) {
    const words = prepareScriptText(text).split(/\s+/).filter(Boolean).length;
    return Math.max(3, Math.min(45, Number((words / 2.2).toFixed(1))));
  }

  async synthesize({ text, language = 'en-IN', voice, style = 'Natural' }) {
    const cleanText = prepareScriptText(text);
    if (!cleanText) throw new Error('A script is required before generating voice-over audio.');
    const languageCode = normalizeLanguageCode(language);
    if (!['en-IN', 'hi-IN'].includes(languageCode)) throw new Error('Unsupported language. Please choose English or Hindi.');
    const config = getLanguageConfig(languageCode);
    const voiceName = voice || config.defaultVoice;
    const allowedVoices = new Set(config.voices.map((entry) => entry.value));
    if (!allowedVoices.has(voiceName)) throw new Error('Unsupported voice for the selected language.');
    const instructions = languageCode === 'hi-IN'
      ? `Speak in Hindi with a ${String(style || 'Natural').toLowerCase()} and natural marketing tone for a short social video.`
      : `Speak in English with a ${String(style || 'Natural').toLowerCase()} and natural marketing tone for a short social video.`;
    const response = await this.fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: cleanText,
        voice: voiceName,
        response_format: 'mp3',
        instructions,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error?.message || `Text-to-speech generation failed (${response.status}).`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const temporary = await createTemporaryFile(buffer, '.mp3');
    return {
      audioPath: temporary.localPath,
      audioUrl: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
      cleanup: temporary.cleanup,
      duration: this.estimateDuration(cleanText),
      provider: 'openai',
      voice: voiceName,
      language: languageCode,
      style: style || 'Natural',
    };
  }
}

export const openAiTtsProvider = new OpenAiTtsProvider();
