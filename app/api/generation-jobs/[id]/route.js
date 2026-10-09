import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { serializeGenerationJobForWorkspace, syncGenerationJob } from '@/lib/generationJobs';
import { requireOrganization } from '@/lib/auth';

export async function GET(request, { params }) {
  try {
    const { user } = await requireOrganization(request);
    const { id } = await params;
    let job = await prisma.generationJob.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!job) return NextResponse.json({ error: 'Generation job not found.' }, { status: 404 });
    if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) {
      job = await syncGenerationJob(job);
    }
    return NextResponse.json({ job: await serializeGenerationJobForWorkspace(job, user.organizationId) }, { status: ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status) ? 200 : 202, headers: { 'Retry-After': '3' } });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Authentication required.' }, { status: 401 });
  }
}
