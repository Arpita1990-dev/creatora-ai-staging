import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { MuApiVideoProvider } from '@/lib/providers/muApiVideoProvider';
import { requireOrganizationSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { lockWorkspaceQuota, reserveGenerationUsage, setGenerationUsageStatus } from '@/lib/planCatalog';

const muapiProvider = new MuApiVideoProvider();

function validateRequestId(requestId) {
  return /^[a-zA-Z0-9_-]{6,200}$/.test(requestId);
}

export async function GET(request) {
  let user;
  try { ({ user } = await requireOrganizationSession(request)); }
  catch (error) { return NextResponse.json({ error: error.message || 'Authentication required.' }, { status: 401 }); }
  const requestId = request.nextUrl.searchParams.get('requestId') || '';
  const kind = ['video', 'audio'].includes(request.nextUrl.searchParams.get('kind')) ? request.nextUrl.searchParams.get('kind') : 'video';
  if (!validateRequestId(requestId)) return NextResponse.json({ error: 'A valid generation request ID is required.' }, { status: 400 });
  try {
    const result = await muapiProvider.getTaskStatus(requestId, kind);
    const usage = await prisma.generationUsage.findFirst({ where: { organizationId: user.organizationId, providerRequestId: requestId, status: 'RESERVED' }, select: { id: true } });
    if (result.status === 'FAILED') {
      if (usage) await setGenerationUsageStatus(prisma, { id: usage.id }, 'FAILED');
      return NextResponse.json({ error: result.error, requestId, status: 'failed' }, { status: 422 });
    }
    if (result.status !== 'SUCCEEDED') return NextResponse.json({ requestId, status: 'processing', progress: result.progress }, { status: 202, headers: { 'Retry-After': '3' } });
    if (usage) await setGenerationUsageStatus(prisma, { id: usage.id }, 'COMPLETED');
    return NextResponse.json({ requestId, status: 'completed', progress: 100, url: result.url, cost: result.cost, kind });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to check generation status.' }, { status: 502 });
  }
}

export async function POST(request) {
  let usage = null;
  try {
    const { user } = await requireOrganizationSession(request);
    const formData = await request.formData();
    const kind = ['video', 'audio'].includes(formData.get('kind')) ? formData.get('kind') : 'video';
    const prompt = String(formData.get('prompt') || '').trim();
    if (!prompt) return NextResponse.json({ error: 'A prompt is required.' }, { status: 400 });
    if (kind === 'video') {
      const idempotencyKey = `direct_video_${randomUUID()}`;
      usage = await prisma.$transaction(async (tx) => {
        await lockWorkspaceQuota(tx, user.organizationId);
        return reserveGenerationUsage(tx, { organizationId: user.organizationId, userId: user.sub, kind, idempotencyKey });
      });
    }
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
    if (result.url) {
      if (usage) await setGenerationUsageStatus(prisma, { id: usage.id }, 'COMPLETED');
      return NextResponse.json({ requestId: null, status: 'completed', provider: 'MUAPI', kind, url: result.url, cost: result.cost });
    }
    if (usage && result.taskId) await prisma.generationUsage.update({ where: { id: usage.id }, data: { providerRequestId: String(result.taskId) } });
    return NextResponse.json({ requestId: result.taskId, status: 'submitted', provider: 'MUAPI', kind }, { status: 202, headers: { 'Retry-After': '3' } });
  } catch (error) {
    if (usage) await setGenerationUsageStatus(prisma, { id: usage.id }, 'FAILED').catch(() => {});
    if (error.code === 'GENERATION_LIMIT_REACHED') return NextResponse.json({ error: error.message, code: error.code, generationType: error.generationType, limit: error.limit, used: error.used }, { status: 403 });
    const status = /not configured/i.test(error.message) ? 503 : /required|must be/i.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error.message || 'Generation failed.' }, { status });
  }
}
