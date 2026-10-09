import { NextResponse } from 'next/server';

import { MuApiVideoProvider } from '@/lib/providers/muApiVideoProvider';

const muapiProvider = new MuApiVideoProvider();

function validateRequestId(requestId) {
  return /^[a-zA-Z0-9_-]{6,200}$/.test(requestId);
}

export async function GET(request) {
  const requestId = request.nextUrl.searchParams.get('requestId') || '';
  const kind = ['video', 'audio'].includes(request.nextUrl.searchParams.get('kind')) ? request.nextUrl.searchParams.get('kind') : 'video';
  if (!validateRequestId(requestId)) return NextResponse.json({ error: 'A valid generation request ID is required.' }, { status: 400 });
  try {
    const result = await muapiProvider.getTaskStatus(requestId, kind);
    if (result.status === 'FAILED') return NextResponse.json({ error: result.error, requestId, status: 'failed' }, { status: 422 });
    if (result.status !== 'SUCCEEDED') return NextResponse.json({ requestId, status: 'processing', progress: result.progress }, { status: 202, headers: { 'Retry-After': '3' } });
    return NextResponse.json({ requestId, status: 'completed', progress: 100, url: result.url, cost: result.cost, kind });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to check generation status.' }, { status: 502 });
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const kind = ['video', 'audio'].includes(formData.get('kind')) ? formData.get('kind') : 'video';
    const prompt = String(formData.get('prompt') || '').trim();
    if (!prompt) return NextResponse.json({ error: 'A prompt is required.' }, { status: 400 });
    const referenceFile = formData.get('reference');
    const referenceUrl = referenceFile instanceof File && referenceFile.size > 0
      ? await muapiProvider.uploadReferenceFile(referenceFile)
      : null;
    const result = await muapiProvider.createVideoTask({
      kind,
      prompt,
      aspectRatio: formData.get('aspectRatio'),
      duration: formData.get('duration'),
      model: formData.get('model'),
      referenceUrl: formData.get('referenceUrl') || referenceUrl,
      voiceover: formData.get('voiceover') !== 'false',
    });
    if (result.url) return NextResponse.json({ requestId: null, status: 'completed', provider: 'MUAPI', kind, url: result.url, cost: result.cost });
    return NextResponse.json({ requestId: result.taskId, status: 'submitted', provider: 'MUAPI', kind }, { status: 202, headers: { 'Retry-After': '3' } });
  } catch (error) {
    const status = /not configured/i.test(error.message) ? 503 : /required|must be/i.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error.message || 'Generation failed.' }, { status });
  }
}
