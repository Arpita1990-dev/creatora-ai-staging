import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncGenerationJob } from '@/lib/generationJobs';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const taskId = body?.request_id || body?.task_id || body?.id || body?.data?.taskId;
  if (!taskId) return NextResponse.json({ error: 'Missing task ID.' }, { status: 400 });
  const attempt = await prisma.providerAttempt.findFirst({ where: { taskId, provider: 'MUAPI' }, orderBy: { createdAt: 'desc' } });
  if (!attempt) return NextResponse.json({ accepted: true });
  const job = await prisma.generationJob.findUnique({ where: { id: attempt.generationJobId } });
  if (!job || job.status === 'COMPLETED' || job.providerJobId !== taskId) return NextResponse.json({ accepted: true, ignored: true });
  await syncGenerationJob(job);
  return NextResponse.json({ accepted: true });
}
