import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

const ADMIN_ROLES = ["OWNER", "ADMIN"];

export async function DELETE(request, { params }) {
  try {
    const { user } = await requireRole(request, ADMIN_ROLES);
    const { memberId } = await params;
    const member = await prisma.organizationMember.findFirst({ where: { id: memberId, organizationId: user.organizationId } });
    if (!member) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
    if (member.userId === user.sub) return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 });
    if (member.role === "OWNER") return NextResponse.json({ error: "The workspace owner cannot be removed." }, { status: 400 });
    // Soft-remove: keep the row (and any content created by this member) so
    // projects/assets they authored remain in the organization workspace.
    await prisma.organizationMember.update({ where: { id: member.id }, data: { status: "SUSPENDED" } });
    return NextResponse.json({ data: { id: member.id } });
  } catch (error) {
    const status = /organization access|insufficient permission/i.test(error.message || "") ? 403 : /auth|token|jwt/i.test(error.message || "") ? 401 : 400;
    return NextResponse.json({ error: error.message || "Unable to remove team member." }, { status });
  }
}
