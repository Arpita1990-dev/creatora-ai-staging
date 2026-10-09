import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

let context;
let storedJob;
let retryCalls;

globalThis.__retryAuth = async () => {
  if (!context) throw new Error("Authentication required.");
  return context;
};
globalThis.__retryDatabase = {
  generationJob: {
    findFirst: async ({ where }) => storedJob?.id === where.id && storedJob.organizationId === where.organizationId ? storedJob : null,
  },
};
globalThis.__retryJob = async (job) => { retryCalls += 1; return { ...job, status: "QUEUED" }; };

const sourceModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const hooks = registerHooks({ resolve(specifier, importContext, nextResolve) {
  if (specifier === "@/lib/prisma") return { url: sourceModule("export const prisma = globalThis.__retryDatabase;"), shortCircuit: true };
  if (specifier === "@/lib/auth") return { url: sourceModule("export const requireOrganization = globalThis.__retryAuth;"), shortCircuit: true };
  if (specifier === "@/lib/generationJobs") return { url: sourceModule("export const retryGenerationJob = globalThis.__retryJob; export const serializeGenerationJob = value => value; export const serializeGenerationJobForWorkspace = value => value;"), shortCircuit: true };
  if (specifier === "next/server") return { url: sourceModule("export const NextResponse = { json: (data, options) => Response.json(data, options) };"), shortCircuit: true };
  return nextResolve(specifier, importContext);
} });

let route;
try { route = await import("../app/api/generation-jobs/[id]/retry/route.js"); }
finally { hooks.deregister(); }

const request = new Request("https://app.example/api/generation-jobs/job-a/retry", { method: "POST" });
const params = (id = "job-a") => ({ params: Promise.resolve({ id }) });
const reset = () => {
  context = { user: { sub: "user-a", organizationId: "org-a" }, membership: { role: "EDITOR", status: "ACTIVE" } };
  storedJob = { id: "job-a", organizationId: "org-a", status: "FAILED" };
  retryCalls = 0;
};

test("retry requires authentication", async () => {
  reset(); context = null;
  const response = await route.POST(request, params());
  assert.equal(response.status, 401);
  assert.equal(retryCalls, 0);
});

test("retry hides jobs from another workspace", async () => {
  reset(); storedJob.organizationId = "org-b";
  const response = await route.POST(request, params());
  assert.equal(response.status, 404);
  assert.equal(retryCalls, 0);
});

test("viewer and reviewer cannot retry generation", async () => {
  for (const role of ["VIEWER", "REVIEWER"]) {
    reset(); context.membership.role = role;
    const response = await route.POST(request, params());
    assert.equal(response.status, 403);
    assert.equal(retryCalls, 0);
  }
});

test("authorized active workspace member preserves retry behavior", async () => {
  reset();
  const response = await route.POST(request, params());
  assert.equal(response.status, 200);
  assert.equal(retryCalls, 1);
  assert.equal((await response.json()).job.status, "QUEUED");
});
