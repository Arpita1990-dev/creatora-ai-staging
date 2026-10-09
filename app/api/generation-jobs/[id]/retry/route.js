import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { retryGenerationJob, serializeGenerationJobForWorkspace } from '@/lib/generationJobs';
import { requireOrganization } from '@/lib/auth';

export async function POST(request, { params }) {
  try {
    const { user, membership } = await requireOrganization(request);
    if (["VIEWER", "REVIEWER"].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permission.' }, { status: 403 });
    }
    const { id } = await params;
    const job = await prisma.generationJob.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!job) return NextResponse.json({ error: 'Generation job not found.' }, { status: 404 });
    const retried = await retryGenerationJob(job);
    return NextResponse.json({ job: await serializeGenerationJobForWorkspace(retried, user.organizationId) });
  } catch (error) {
    const status = /auth|token|jwt|organization access/i.test(error.message || '') ? 401 : 409;
    return NextResponse.json({ error: error.message || 'Unable to retry generation.' }, { status });
  }
}
