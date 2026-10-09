import { NextResponse } from 'next/server';

import { requireOrganization } from '@/lib/auth';
import { generateTtsScript } from '@/lib/tts/index.js';
import { buildBrandContext } from '@/lib/brandContext.js';

export async function POST(request) {
  try {
    const { user } = await requireOrganization(request);
    if (!user?.sub) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const body = await request.json();
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return NextResponse.json({ error: 'Describe the video before generating a script.' }, { status: 400 });
    const limit = Number(process.env.TTS_MAX_SCRIPT_LENGTH || 500);
    if (prompt.length > limit) return NextResponse.json({ error: `Prompts must be ${limit} characters or fewer.` }, { status: 400 });
    const brandContext = body.applyBrandKit === false
      ? null
      : await buildBrandContext({ organizationId: user.organizationId, userId: user.sub, purpose: 'AVATAR' });
    const brand = brandContext
      ? [brandContext.brandName, brandContext.description, brandContext.targetAudience && `Audience: ${brandContext.targetAudience}`, brandContext.tone && `Tone: ${brandContext.tone}`, brandContext.videoStyle && `Video style: ${brandContext.videoStyle}`, brandContext.callToAction && `Call to action: ${brandContext.callToAction}`].filter(Boolean).join('. ')
      : '';
    const script = await generateTtsScript({
      prompt,
      language: body.language || 'en-IN',
      duration: Number(body.duration || 15),
      brand,
      campaign: body.campaign || '',
      tone: brandContext?.tone || body.style || 'Professional',
    });
    return NextResponse.json({ script });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to generate a script.' }, { status: 500 });
  }
}
