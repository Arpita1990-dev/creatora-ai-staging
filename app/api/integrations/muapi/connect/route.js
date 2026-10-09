import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/tokenEncryption";
import { getMuApiBalance } from "@/lib/muapiAccount";
import { getProviderCredentialScope } from "@/lib/providerCredentialScope";
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
        { error: "Only organization owners and admins can connect MuAPI." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const apiKey = String(body.apiKey || "").trim();

    if (apiKey.length < 12) {
      return NextResponse.json(
        { error: "Enter a valid MuAPI API key." },
        { status: 400 }
      );
    }

    // Validate the key by calling MuAPI balance endpoint
    try {
      await getMuApiBalance(apiKey);
    } catch {
      return NextResponse.json(
        { error: "Unable to connect MuAPI. Check your API key and try again." },
        { status: 400 }
      );
    }

    // Key is valid - encrypt and store
    const { where, create } = getProviderCredentialScope({
      shared,
      organizationId: user.organizationId,
      userId: user.sub,
    });

    await prisma.providerCredential.upsert({
      where,
      create: {
        ...create,
        secretEncrypted: encryptToken(apiKey),
        secretPrefix: `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`,
        createdBy: user.sub,
      },
      update: {
        secretEncrypted: encryptToken(apiKey),
        secretPrefix: `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`,
        createdBy: user.sub,
      },
    });

    return NextResponse.json({
      ok: true,
      connected: true,
      keyLastFour: apiKey.slice(-4),
      scope: shared ? "ORGANIZATION" : "PERSONAL",
    });
  } catch (error) {
    const authError = /auth|token|jwt|claim timestamp|organization access/i.test(error.message || "");
    return NextResponse.json(
      { error: authError ? "Your session has expired. Sign in and try again." : "Unable to connect MuAPI. Please try again." },
      { status: authError ? 401 : 500 }
    );
  }
}
