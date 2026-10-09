import { NextResponse } from 'next/server';

import { requireOrganization } from '@/lib/auth';
import { OpenAiTtsProvider } from '@/lib/tts/openaiProvider.js';
import { MuApiTtsProvider } from '@/lib/tts/muapiProvider.js';
import { prisma } from '@/lib/prisma';
import { resolveMuApiKey } from '@/lib/providerCredentials.js';

export async function POST(request) {
  try {
    const { user } = await requireOrganization(request);
    if (!user?.sub) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const body = await request.json();
    const text = String(body.text || '').trim();
    if (!text) return NextResponse.json({ error: 'A script is required before previewing the voice.' }, { status: 400 });
    const limit = Number(process.env.TTS_MAX_SCRIPT_LENGTH || 500);
    if (text.length > limit) return NextResponse.json({ error: `Voice scripts must be ${limit} characters or fewer.` }, { status: 400 });
    const requestedProvider = String(body.provider || 'openai').toLowerCase();
    const provider = requestedProvider === 'muapi'
      ? new MuApiTtsProvider({ apiKey: await resolveMuApiKey(prisma, user.organizationId, user.sub) })
      : new OpenAiTtsProvider();
    if (!provider.isAvailable()) return NextResponse.json({ error: 'TTS is not configured on the server.' }, { status: 503 });
    const result = await provider.synthesize({
      text,
      language: body.language || 'en-IN',
      voice: body.voice,
      style: body.style || 'Natural',
    });
    const response = NextResponse.json({
      audioUrl: result.audioUrl,
      duration: Number(result.duration || 0),
      provider: result.provider,
      voice: result.voice,
      language: result.language,
      style: result.style,
    });
    await result.cleanup?.();
    return response;
  } catch (error) {
    const status = /auth|organization|not configured|required/i.test(error.message || '') ? (/(auth|organization)/i.test(error.message) ? 401 : 400) : 500;
    return NextResponse.json({ error: error.message || 'Unable to generate preview audio.' }, { status });
  }
}
