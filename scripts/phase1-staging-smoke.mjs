import { SignJWT } from "jose";
import { PrismaClient } from "../generated/postgres-client/index.js";
import { decryptToken } from "../lib/tokenEncryption.js";

const targetUrl = process.env.TARGET_DATABASE_URL;
const baseUrl = process.env.PHASE1_STAGING_URL || "http://127.0.0.1:3011";
const secret = process.env.JWT_ACCESS_SECRET || "development-only-secret-change-me";
const client = new PrismaClient({ datasources: { db: { url: targetUrl } }, log: [] });

async function tokenFor(membership) {
  return new SignJWT({
    email: membership.user.email,
    organizationId: membership.organizationId,
    role: membership.role,
    sessionId: "phase1-read-only-smoke",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(membership.userId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
}

async function getJson(path, accessToken) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Staging GET failed");
  return response.json();
}

try {
  const memberships = {};
  for (const accountType of ["PERSONAL", "ORGANIZATION"]) {
    const membership = await client.organizationMember.findFirst({
      where: {
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        organization: { status: "ACTIVE", accountType },
      },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) throw new Error("No active workspace membership");
    memberships[accountType] = membership;
    const accessToken = await tokenFor(membership);

    for (const resource of ["projects", "campaigns", "workflows", "templates", "notifications"]) {
      const payload = await getJson(`/api/workspace/${resource}?limit=1`, accessToken);
      if (!Array.isArray(payload.data) || !payload.pagination) throw new Error("Unexpected workspace response");
    }
    const assetPayload = await getJson("/api/assets", accessToken);
    if (!Array.isArray(assetPayload.assets) || typeof assetPayload.count !== "number") throw new Error("Unexpected asset response");
    const settings = await getJson("/api/settings/muapi-key", accessToken);
    const expectedScope = accountType;
    if (settings.scope !== expectedScope || (settings.prefix && !settings.prefix.startsWith("••••"))) throw new Error("Unexpected credential settings response");
    console.log(`STAGING_${accountType}_WORKSPACE_READS: PASS`);

    if (accountType === "ORGANIZATION") {
      const brandKit = await getJson("/api/brand-kit", accessToken);
      if (!Object.hasOwn(brandKit, "brandKit")) throw new Error("Unexpected brand kit response");
      const members = await getJson("/api/organization/members", accessToken);
      if (!Array.isArray(members.data)) throw new Error("Unexpected team response");
      console.log("STAGING_BRAND_KIT_AND_TEAM: PASS");
    }
  }

  const generationJob = await client.generationJob.findFirst({
    where: {
      organizationId: memberships.ORGANIZATION.organizationId,
      status: { in: ["COMPLETED", "FAILED", "CANCELLED"] },
    },
    select: { id: true },
  });
  if (generationJob) {
    const history = await getJson(`/api/generation-jobs/${encodeURIComponent(generationJob.id)}`, await tokenFor(memberships.ORGANIZATION));
    if (!history.job) throw new Error("Unexpected generation history response");
    console.log("STAGING_GENERATION_HISTORY: PASS");
  } else {
    console.log("STAGING_GENERATION_HISTORY: DATABASE_READ_PASS (no terminal job available for route smoke)");
  }

  const [plans, subscriptions, credentials, socialConnections, socialDestinations] = await Promise.all([
    client.plan.findMany({ select: { id: true, razorpayPlanId: true } }),
    client.subscription.findMany({ select: { id: true, provider: true, providerSubscriptionId: true } }),
    client.providerCredential.findMany({ select: { provider: true, secretEncrypted: true } }),
    client.socialConnection.findMany({ select: { provider: true, accessTokenEncrypted: true, refreshTokenEncrypted: true } }),
    client.socialDestination.count(),
  ]);
  if (!plans.length || !subscriptions.length) throw new Error("Missing billing records");
  console.log(`STAGING_RAZORPAY_RECORDS: PASS (plans=${plans.length}, subscriptions=${subscriptions.length}; external calls=0)`);

  const muapiCredentials = credentials.filter((credential) => credential.provider === "MUAPI");
  if (!muapiCredentials.length) throw new Error("Missing MuAPI credentials");
  for (const credential of muapiCredentials) decryptToken(credential.secretEncrypted);
  console.log(`STAGING_MUAPI_CREDENTIALS: PASS (records=${muapiCredentials.length})`);

  const socialCiphertexts = socialConnections.flatMap((connection) => [
    connection.accessTokenEncrypted,
    connection.refreshTokenEncrypted,
  ]).filter(Boolean);
  for (const ciphertext of socialCiphertexts) decryptToken(ciphertext);
  if (!socialConnections.length || !socialDestinations) throw new Error("Missing social connection records");
  console.log(`STAGING_SOCIAL_CONNECTIONS: PASS (connections=${socialConnections.length}, destinations=${socialDestinations}, encrypted values=${socialCiphertexts.length})`);
} catch {
  console.error("STAGING_PHASE1_SMOKE: FAIL");
  process.exitCode = 2;
} finally {
  await client.$disconnect();
}