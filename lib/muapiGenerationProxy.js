import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";
import { requireOrganizationSession } from "./auth.js";
import { cleanMuApiProxyHeaders } from "./muapiProxyCredential.js";
import { resolveMuApiKey } from "./providerCredentials.js";
import { lockWorkspaceQuota, reserveGenerationUsage, setGenerationUsageStatus, workspaceEntitlements } from "./planCatalog.js";
import { muApiGenerationKind } from "./muapiGenerationKind.js";

const MUAPI_BASE = "https://api.muapi.ai";
const PROVIDER_TASK_TIMEOUT_MS = 60 * 60 * 1000;
const completedStatuses = new Set(["COMPLETED", "SUCCEEDED", "SUCCESS"]);
const failedStatuses = new Set(["FAILED", "ERROR", "CANCELLED", "CANCELED"]);

function isUtilityPath(path) {
  return path === "upload_file"
    || path.startsWith("account/")
    || path.startsWith("app/")
    || path.startsWith("history")
    || path.startsWith("creative-agent/")
    || (path.startsWith("models/") && path.endsWith("/estimate-cost"));
}

function statusOf(data) {
  return String(data?.status || data?.data?.status || data?.state || "").toUpperCase();
}

function providerIdOf(data) {
  const result = data?.data && typeof data.data === "object" ? data.data : data;
  return result?.request_id || result?.task_id || result?.taskId || result?.id || null;
}

function hasOutput(data) {
  return Boolean(data?.url || data?.output?.url || data?.output_url || data?.outputs?.length || data?.images?.length);
}

async function applyTerminalUsageStatus(database, usageId, data) {
  const status = statusOf(data);
  if (completedStatuses.has(status) || hasOutput(data)) {
    await setGenerationUsageStatus(database, { id: usageId }, "COMPLETED");
  } else if (failedStatuses.has(status)) {
    await setGenerationUsageStatus(database, { id: usageId }, "FAILED");
  }
}

export async function reconcileMuApiGenerationUsage(user, database = prisma) {
  try {
    const pending = await database.generationUsage.findMany({
      where: {
        organizationId: user.organizationId,
        status: "RESERVED",
        providerRequestId: { not: null },
        createdAt: { lt: new Date(Date.now() - 15_000) },
      },
      take: 10,
      select: { id: true, providerRequestId: true, createdAt: true },
    });
    if (!pending.length) return;
    const apiKey = await resolveMuApiKey(database, user.organizationId, user.sub);
    for (const usage of pending) {
      try {
        const response = await fetch(`${MUAPI_BASE}/api/v1/predictions/${encodeURIComponent(usage.providerRequestId)}/result`, {
          headers: { "x-api-key": apiKey },
          cache: "no-store",
        });
        if (!response.ok && response.status >= 500) continue;
        const data = await response.json().catch(() => null);
        if (data) {
          await applyTerminalUsageStatus(database, usage.id, data);
          const terminal = completedStatuses.has(statusOf(data)) || failedStatuses.has(statusOf(data)) || hasOutput(data);
          if (!terminal && Date.now() - new Date(usage.createdAt).getTime() >= PROVIDER_TASK_TIMEOUT_MS) {
            await setGenerationUsageStatus(database, { id: usage.id }, "FAILED");
          }
        }
      } catch {}
    }
  } catch {}
}

async function reserveUsage(user, kind) {
  if (!["IMAGE", "VIDEO"].includes(kind)) return null;
  await reconcileMuApiGenerationUsage(user);
  const entitlement = await workspaceEntitlements(prisma, user.organizationId);
  const idempotencyKey = `muapi_${randomUUID()}`;
  return prisma.$transaction(async (tx) => {
    await lockWorkspaceQuota(tx, user.organizationId);
    return reserveGenerationUsage(tx, {
      organizationId: user.organizationId,
      userId: user.sub,
      kind: kind.toLowerCase(),
      idempotencyKey,
      entitlement,
    });
  }, { maxWait: 10_000, timeout: 20_000 });
}

async function trackTerminalStatus(user, path, data) {
  const match = path.match(/^predictions\/([^/]+)\/result$/);
  if (!match) return;
  const usage = await prisma.generationUsage.findFirst({
    where: { organizationId: user.organizationId, providerRequestId: match[1], status: "RESERVED" },
    select: { id: true },
  });
  if (!usage) return;
  await applyTerminalUsageStatus(prisma, usage.id, data);
}

export async function proxyMuApiGenerationRequest(request, path, search = "") {
  let usage = null;
  try {
    const { user } = await requireOrganizationSession(request);
    const apiKey = await resolveMuApiKey(prisma, user.organizationId, user.sub);
    const generationRequest = request.method === "POST" && !isUtilityPath(path);
    if (generationRequest) {
      const kind = muApiGenerationKind(path);
      if (!kind) return Response.json({ error: "Unable to determine generation type for this MuAPI request." }, { status: 400 });
      usage = await reserveUsage(user, kind);
    }

    const headers = cleanMuApiProxyHeaders(request);
    headers.set("x-api-key", apiKey);
    const hasBody = !["GET", "HEAD"].includes(request.method);
    const response = await fetch(`${MUAPI_BASE}/api/v1/${path}${search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
    });
    const data = await response.clone().json().catch(() => null);

    if (usage) {
      const status = statusOf(data);
      if (!response.ok || failedStatuses.has(status)) {
        await setGenerationUsageStatus(prisma, { id: usage.id }, "FAILED");
      } else if (completedStatuses.has(status) || hasOutput(data)) {
        await setGenerationUsageStatus(prisma, { id: usage.id }, "COMPLETED");
      } else {
        const providerRequestId = providerIdOf(data);
        if (providerRequestId) {
          await prisma.generationUsage.update({ where: { id: usage.id }, data: { providerRequestId: String(providerRequestId) } });
        } else {
          await setGenerationUsageStatus(prisma, { id: usage.id }, "FAILED");
        }
      }
    } else if (request.method === "GET" && data) {
      await trackTerminalStatus(user, path, data);
    }

    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch (error) {
    if (usage) await setGenerationUsageStatus(prisma, { id: usage.id }, "FAILED").catch(() => {});
    const authError = /auth|organization|member|MUAPI_NOT_CONNECTED/i.test(error.message || "");
    const status = error.code === "GENERATION_LIMIT_REACHED" ? 403 : authError ? 401 : 502;
    return Response.json({
      error: error.message || "MuAPI proxy request failed.",
      ...(error.code ? { code: error.code } : {}),
      ...(error.generationType ? { generationType: error.generationType } : {}),
      ...(error.limit != null ? { limit: error.limit, used: error.used } : {}),
    }, { status });
  }
}