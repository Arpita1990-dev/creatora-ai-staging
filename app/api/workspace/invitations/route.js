import { NextResponse } from 'next/server';
import { createOpaqueToken, hashToken, normalizeEmail, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request) {
  try {
    const { user } = await requireRole(request, ['OWNER', 'ADMIN']);
    const body = await request.json();
    const email = normalizeEmail(body.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    const token = createOpaqueToken();
    const invitation = await prisma.teamInvitation.create({ data: { organizationId: user.organizationId, email, role: body.role || 'VIEWER', invitedById: user.sub, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
    return NextResponse.json({ data: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt } }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error.message || 'Invitation failed.' }, { status: 403 }); }
}