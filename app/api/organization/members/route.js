import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrganization, requireRole, normalizeEmail } from "@/lib/auth";
import { workspaceEntitlements } from "@/lib/planCatalog";

const ADMIN_ROLES = ["OWNER", "ADMIN"];

function serializeMember(member) {
  return {
    id: member.id,
    userId: member.userId,
    name: `${member.user.firstName || ""} ${member.user.lastName || ""}`.trim() || member.user.email,
    email: member.user.email,
    role: member.role,
    status: member.status,
    isAdmin: ADMIN_ROLES.includes(member.role),
    joinedAt: member.joinedAt,
  };
}

export async function GET(request) {
  try {
    const { user } = await requireOrganization(request);
    const organization = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { accountType: true } });
    if (organization?.accountType !== "ORGANIZATION") return NextResponse.json({ error: "Team management is only available for organization workspaces." }, { status: 403 });
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: user.organizationId, status: { not: "SUSPENDED" } },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ data: members.map(serializeMember) });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to load team members." }, { status: 401 });
  }
}

export async function POST(request) {
  try {
    const { user } = await requireRole(request, ADMIN_ROLES);
    const organization = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { accountType: true } });
    if (organization?.accountType !== "ORGANIZATION") return NextResponse.json({ error: "Team management is only available for organization workspaces." }, { status: 403 });
    const entitlement = await workspaceEntitlements(prisma, user.organizationId);
    const memberCount = await prisma.organizationMember.count({ where: { organizationId: user.organizationId, status: { not: "SUSPENDED" } } });
    if (memberCount >= entitlement.maxTeamMembers) return NextResponse.json({ error: `${entitlement.plan.name} supports up to ${entitlement.maxTeamMembers} team members.` }, { status: 403 });
    const body = await request.json();
    const email = normalizeEmail(body.email);
    if (!email) return NextResponse.json({ error: "An email address is required." }, { status: 400 });
    const account = await prisma.user.findUnique({ where: { email } });
    if (!account) return NextResponse.json({ error: `No Createora account found for ${email}. Ask the user to create a Createora account first.` }, { status: 404 });
    const existing = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: user.organizationId, userId: account.id } } });
    if (existing?.status === "ACTIVE") return NextResponse.json({ error: `${email} is already a member of this workspace.` }, { status: 409 });
    const member = existing
      ? await prisma.organizationMember.update({ where: { id: existing.id }, data: { status: "ACTIVE", role: "EDITOR", joinedAt: new Date() }, include: { user: { select: { firstName: true, lastName: true, email: true } } } })
      : await prisma.organizationMember.create({ data: { organizationId: user.organizationId, userId: account.id, role: "EDITOR", status: "ACTIVE", invitedById: user.sub, joinedAt: new Date() }, include: { user: { select: { firstName: true, lastName: true, email: true } } } });
    return NextResponse.json({ data: serializeMember(member) }, { status: 201 });
  } catch (error) {
    const status = /organization access|insufficient permission/i.test(error.message || "") ? 403 : /auth|token|jwt/i.test(error.message || "") ? 401 : 400;
    return NextResponse.json({ error: error.message || "Unable to add team member." }, { status });
  }
}
