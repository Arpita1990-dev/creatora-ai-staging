import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageMuApi } from "@/lib/muapiPermissions";

export async function POST(request) {
  try {
    const { user, membership } = await requireOrganization(request);
    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { accountType: true, ownerId: true },
    });
    const shared = organization?.accountType === "ORGANIZATION";

    if (!canManageMuApi(organization, membership, user.sub)) {
      return NextResponse.json(
        { error: "Only organization owners and admins can disconnect MuAPI." },
        { status: 403 }
      );
    }

    await prisma.providerCredential.deleteMany({
      where: shared
        ? { provider: "MUAPI", organizationId: user.organizationId }
        : { provider: "MUAPI", userId: user.sub, organizationId: null },
    });

    return NextResponse.json({ ok: true, connected: false });
  } catch (error) {
    const authError = /auth|token|jwt|claim timestamp|organization access/i.test(error.message || "");
    return NextResponse.json(
      { error: error.message || "Unable to disconnect MuAPI." },
      { status: authError ? 401 : 500 }
    );
  }
}
