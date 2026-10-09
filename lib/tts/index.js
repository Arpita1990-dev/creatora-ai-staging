import { createTemporaryFile } from '../storage.js';
import { getLanguageConfig, normalizeLanguageCode, prepareScriptText, TTS_LANGUAGE_OPTIONS } from './languages.js';

export async function generateTtsScript(payload = {}) {
  const language = normalizeLanguageCode(payload.language || 'en-IN');
  const prompt = String(payload.prompt || '').trim();
  const duration = Number(payload.duration || 15);
  const tone = String(payload.tone || payload.style || 'Professional');
  const brand = String(payload.brand || '').trim();
  const campaign = String(payload.campaign || '').trim();
  if (!prompt) throw new Error('A prompt is required to generate a script.');
  const maxWords = Math.max(1, Math.floor((duration + 0.5) * 2.2));
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const fallback = language === 'hi-IN'
      ? `अपने बिज़नेस के लिए एक आकर्षक मार्केटिंग संदेश तैयार करें। जल्दी से कहें कि आप क्या बेचते हैं, ग्राहक को क्या लाभ मिलेगा, और अंत में कार्रवाई का संदेश दें।`
      : `Create a short marketing script for this product or campaign. Highlight the main value, the reason to care, and a clear call to action.`;
    return fitScriptToDuration(fallback, duration);
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VOICE_BRIEF_MODEL || 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: `Write a concise marketing script for a short social video. Use ${language === 'hi-IN' ? 'natural modern Hindi' : 'natural marketing English'} with a ${tone.toLowerCase()} tone. Keep it suitable for social video narration. Keep the script readable in one block, no bullet list, and no quotes. Use no more than ${maxWords} spoken words so it fits within ${duration} seconds. Include the key benefit and call to action within that limit. ${brand ? `Brand context: ${brand}.` : ''} ${campaign ? `Campaign context: ${campaign}.` : ''}`,
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Script generation failed.');
  const outputText = result.output_text || result.output?.flatMap((entry) => entry.content || []).find((entry) => entry.type === 'output_text')?.text || '';
  const script = prepareScriptText(outputText);
  return fitScriptToDuration(script || `Create a polished ${language === 'hi-IN' ? 'Hindi' : 'English'} ad script for this offer.`, duration);
}

export function fitScriptToDuration(text, duration) {
  const maxWords = Math.max(1, Math.floor((Number(duration || 15) + 0.5) * 2.2));
  const words = prepareScriptText(text).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  const fitted = words.slice(0, maxWords).join(' ');
  return /[.!?।…]$/.test(fitted) ? fitted : `${fitted}.`;
}

export async function writeAudioBinaryToStorage(payload) {
  const bytes = Buffer.from(payload.audioBuffer || payload.bytes || []);
  const temporary = await createTemporaryFile(bytes, '.mp3');
  return {
    localPath: temporary.localPath,
    audioUrl: `data:audio/mpeg;base64,${bytes.toString('base64')}`,
    cleanup: temporary.cleanup,
  };
}

export { TTS_LANGUAGE_OPTIONS, TTS_PROVIDER, TTS_LANGUAGE_CODES, normalizeLanguageCode, getLanguageConfig, getVoiceOptions, prepareScriptText } from './languages.js';
