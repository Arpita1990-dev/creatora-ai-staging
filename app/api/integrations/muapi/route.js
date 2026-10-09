import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/tokenEncryption";
import { getMuApiBalance } from "@/lib/muapiAccount";
import { getProviderCredentialScope } from "@/lib/providerCredentialScope";
import { canManageMuApi } from "@/lib/muapiPermissions";
import { balanceUsdToCredits } from "@/lib/ai/credits";

async function getScope(user) {
  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { accountType: true, ownerId: true },
  });
  const shared = organization?.accountType === "ORGANIZATION";
  const credentialScope = getProviderCredentialScope({
    shared,
    organizationId: user.organizationId,
    userId: user.sub,
  });
  return {
    shared,
    organization,
    ...credentialScope,
  };
}

export async function GET(request) {
  try {
    const { user, membership } = await requireOrganization(request);
    const scope = await getScope(user);
    const credential = await prisma.providerCredential.findUnique({ where: scope.where });

    if (!credential) {
      return NextResponse.json({
        provider: "MUAPI",
        connected: false,
        keyLastFour: null,
        balance: null,
        credits: null,
        lastSynced: null,
        scope: scope.shared ? "ORGANIZATION" : "PERSONAL",
        canManage: canManageMuApi(scope.organization, membership, user.sub),
      });
    }

    // If connected, try to fetch balance
    let balance = null;
    let lastSynced = null;
    try {
      const apiKey = decryptToken(credential.secretEncrypted);
      const balanceValue = await getMuApiBalance(apiKey);
      balance = balanceValue;
      lastSynced = new Date().toISOString();

      // Cache balance in credential record
      await prisma.providerCredential.update({
        where: { id: credential.id },
        data: { lastBalanceUsd: balanceValue, lastBalanceSyncAt: new Date() },
      });
    } catch {
      // Balance fetch failed - still show as connected
    }

    return NextResponse.json({
      provider: "MUAPI",
      connected: true,
      keyLastFour: canManageMuApi(scope.organization, membership, user.sub) ? credential.secretPrefix?.slice(-4) || null : null,
      balance,
      credits: balanceUsdToCredits(balance),
      lastSynced,
      scope: scope.shared ? "ORGANIZATION" : "PERSONAL",
      canManage: canManageMuApi(scope.organization, membership, user.sub),
    });
  } catch (error) {
    const authError = /auth|token|jwt|claim timestamp|organization access/i.test(error.message || "");
    return NextResponse.json(
      { error: error.message || "Unable to load MuAPI status." },
      { status: authError ? 401 : 502 }
    );
  }
}
