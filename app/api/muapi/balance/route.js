import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/tokenEncryption";
import { getMuApiBalance } from "@/lib/muapiAccount";
import { getProviderCredentialScope } from "@/lib/providerCredentialScope";
import { balanceUsdToCredits } from "@/lib/ai/credits";

export async function GET(request) {
  try {
    const { user } = await requireOrganization(request);
    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { accountType: true },
    });
    const shared = organization?.accountType === "ORGANIZATION";
    const { where } = getProviderCredentialScope({
      shared,
      organizationId: user.organizationId,
      userId: user.sub,
    });
    const credential = await prisma.providerCredential.findUnique({ where });

    if (!credential) {
      return NextResponse.json({ connected: false, stale: false, balance: null, credits: null });
    }

    try {
      const apiKey = decryptToken(credential.secretEncrypted);
      const balance = await getMuApiBalance(apiKey);
      await prisma.providerCredential.update({
        where: { id: credential.id },
        data: { lastBalanceUsd: balance, lastBalanceSyncAt: new Date() },
      });
      const credits = balanceUsdToCredits(balance);
      return NextResponse.json({ connected: true, stale: false, balance, credits });
    } catch {
      // MuAPI is unreachable. Fall back to the last persisted USD figure, but
      // still convert it so clients always receive the same AI-Credit unit and
      // never mix a USD number into a credits widget.
      return NextResponse.json({
        connected: true,
        stale: true,
        balance: credential.lastBalanceUsd,
        credits: balanceUsdToCredits(credential.lastBalanceUsd),
        lastSynced: credential.lastBalanceSyncAt,
      });
    }
  } catch (error) {
    const authenticationError = /auth|token|jwt|claim timestamp|organization access/i.test(error.message || "");
    return NextResponse.json(
      { error: error.message || "Unable to fetch balance." },
      { status: authenticationError ? 401 : 502 }
    );
  }
}
