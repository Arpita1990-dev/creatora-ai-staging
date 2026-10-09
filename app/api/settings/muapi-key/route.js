import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/tokenEncryption";
import { getProviderCredentialScope } from "@/lib/providerCredentialScope";
import { getMuApiBalance } from "@/lib/muapiAccount";
import { canManageMuApi } from "@/lib/muapiPermissions";

async function scope(request) {
  const { user, membership } = await requireOrganization(request);
  const organization = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { accountType: true, ownerId: true } });
  const shared = organization?.accountType === "ORGANIZATION";
  const credentialScope = getProviderCredentialScope({ shared, organizationId: user.organizationId, userId: user.sub });
  return {
    user, membership, organization, shared,
    ...credentialScope,
  };
}

export async function GET(request) {
  try {
    const value = await scope(request);
    const credential = await prisma.providerCredential.findUnique({ where: value.where });
    return NextResponse.json({ configured: Boolean(credential), prefix: canManageMuApi(value.organization, value.membership, value.user.sub) && credential?.secretPrefix ? `••••••••${credential.secretPrefix.slice(-4)}` : null, scope: value.shared ? "ORGANIZATION" : "PERSONAL", canManage: canManageMuApi(value.organization, value.membership, value.user.sub) });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to load MuAPI settings." }, { status: 401 });
  }
}

export async function PUT(request) {
  try {
    const value = await scope(request);
    if (!canManageMuApi(value.organization, value.membership, value.user.sub)) return NextResponse.json({ error: "Only organization owners and admins can change the organization MuAPI key." }, { status: 403 });
    const body = await request.json();
    const apiKey = String(body.apiKey || "").trim();
    if (apiKey.length < 12) return NextResponse.json({ error: "Enter a valid MuAPI key." }, { status: 400 });
    try {
      await getMuApiBalance(apiKey);
    } catch {
      return NextResponse.json({ error: "Unable to validate MuAPI key. Check the key and try again." }, { status: 400 });
    }
    await prisma.providerCredential.upsert({
      where: value.where,
      create: { ...value.create, secretEncrypted: encryptToken(apiKey), secretPrefix: `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`, createdBy: value.user.sub },
      update: { secretEncrypted: encryptToken(apiKey), secretPrefix: `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`, createdBy: value.user.sub },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to save MuAPI key." }, { status: 400 });
  }
}

export async function DELETE(request) {
  try {
    const value = await scope(request);
    if (!canManageMuApi(value.organization, value.membership, value.user.sub)) return NextResponse.json({ error: "Only organization owners and admins can remove the organization MuAPI key." }, { status: 403 });
    await prisma.providerCredential.deleteMany({ where: value.shared ? { provider: "MUAPI", organizationId: value.user.organizationId } : { provider: "MUAPI", userId: value.user.sub, organizationId: null } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Unable to remove MuAPI key." }, { status: 400 });
  }
}
