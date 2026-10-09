import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { registerHooks } from "node:module";
import { PLAN_CATALOG, planEnvId } from "../lib/planCatalog.js";

let state;
const database = {
  organization: { findUnique: async ({ where }) => ({ id: where.id, ownerId: "test-owner", name: "Test workspace", accountType: "PERSONAL", subscription: state.subscription ? { ...state.subscription, plan: state.plans.get(state.subscription.planId) } : null }) },
  plan: {
    upsert: async ({ create }) => { const plan = { ...create, id: create.code }; state.plans.set(create.code, plan); return plan; },
    findUnique: async ({ where }) => state.plans.get(where.code || where.id),
  },
  billingAccount: { upsert: async ({ create }) => ({ ...create, id: "test-billing-account" }) },
  generationJob: { count: async () => state.imageCount },
  subscription: {
    findUnique: async ({ where }) => state.subscription?.organizationId === where.organizationId ? { ...state.subscription, plan: state.plans.get(state.subscription.planId) } : null,
    findFirst: async ({ where }) => {
      const matches = (subscription, clause) => Object.entries(clause).every(([key, value]) => key === "OR" ? value.some((option) => matches(subscription, option)) : subscription[key] === value);
      return state.subscription && matches(state.subscription, where) ? { ...state.subscription, plan: state.plans.get(state.subscription.planId) } : null;
    },
    updateMany: async ({ where, data }) => {
      if (!state.subscription || !Object.entries(where).every(([key, value]) => key === "updatedAt" ? state.subscription[key].getTime() === value.getTime() : state.subscription[key] === value)) return { count: 0 };
      state.subscription = { ...state.subscription, ...data, updatedAt: new Date(state.subscription.updatedAt.getTime() + 1) };
      state.writes += 1; return { count: 1 };
    },
    update: async ({ data }) => Object.assign(state.subscription, data),
  },
};
globalThis.__creatoraBillingDatabase = database;
const sourceModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/prisma") return { url: sourceModule("export const prisma = globalThis.__creatoraBillingDatabase;"), shortCircuit: true };
  if (specifier === "@/lib/auth") return { url: sourceModule("export const requireOrganization = async () => globalThis.__creatoraBillingContext; export const checkRateLimit = () => {};"), shortCircuit: true };
  if (specifier === "@/lib/generationJobs") return { url: sourceModule("export const createGenerationJob = async () => { globalThis.__creatoraBillingGenerationCalls += 1; return { id: 'job-test', status: 'QUEUED' }; }; export const serializeGenerationJob = value => value; export const serializeGenerationJobForWorkspace = value => value;"), shortCircuit: true };
  if (specifier === "next/server") return { url: sourceModule("export const NextResponse = { json: (data, options) => Response.json(data, options) };"), shortCircuit: true };
  if (specifier.startsWith("@/lib/")) return { url: new URL(`../lib/${specifier.slice(6)}.js`, import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
let billing, verify, webhook, generation;
try {
  billing = await import("../app/api/billing/subscription/route.js");
  verify = await import("../app/api/billing/verify/route.js");
  webhook = await import("../app/api/webhooks/razorpay/route.js");
  generation = await import("../app/api/generation-jobs/route.js");
} finally { hooks.deregister(); }

function setup() {
  const names = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_CREATOR_MONTHLY_PLAN_ID", "RAZORPAY_PRO_MONTHLY_PLAN_ID", "ALLOW_FREE_VIDEO", "ALLOW_FREE_AVATAR_VIDEO"];
  const previous = names.map((name) => process.env[name]);
  names.forEach((name) => { process.env[name] = `test-only-${name}`; });
  process.env.ALLOW_FREE_VIDEO = "true";
  process.env.ALLOW_FREE_AVATAR_VIDEO = "true";
  state = { plans: new Map(Object.values(PLAN_CATALOG).map((plan) => [plan.code, { ...plan, id: plan.code }])), subscription: { id: "test-subscription", organizationId: "workspace-one", planId: "free", status: "TRIALING", provider: null, providerSubscriptionId: null, cancelAtPeriodEnd: false, pendingPlanId: null, pendingChangeType: null, pendingChangeStatus: null, pendingProviderSubscriptionId: null, updatedAt: new Date(0) }, writes: 0, providerCalls: [], imageCount: 0, cancelApplies: false, cancelFails: false, cancelNetworkFails: false, cancelResponse: null, upgradeMode: "success", subscriptionsCreated: 0, upgradeRemote: null };
  globalThis.__creatoraBillingContext = { user: { sub: "test-owner", organizationId: "workspace-one" }, membership: { role: "OWNER" } };
  globalThis.__creatoraBillingGenerationCalls = 0;
  const fetch = globalThis.fetch;
  const errorLog = console.error;
  console.error = () => {};
  const remote = { id: "sub_test", plan_id: process.env.RAZORPAY_CREATOR_MONTHLY_PLAN_ID, status: "created", notes: { organizationId: "workspace-one" }, total_count: 120, remaining_count: 120 };
  globalThis.fetch = async (url, options) => {
    const path = String(url).split("/v1/")[1]; state.providerCalls.push({ path, options });
    if (path.startsWith("plans/")) {
      const plan = Object.values(PLAN_CATALOG).find((item) => planEnvId(item) === decodeURIComponent(path.slice(6)));
      return Response.json({ id: planEnvId(plan), period: "monthly", interval: 1, item: { amount: plan.monthlyPrice, currency: "INR" } });
    }
    if (path === "subscriptions/sub_test/cancel") {
      if (JSON.parse(options.body).cancel_at_cycle_end === 0) { remote.status = "cancelled"; return Response.json(remote); }
      if (state.cancelNetworkFails) throw new Error("network failure");
      if (state.cancelFails) return Response.json({ error: { description: "provider failure" } }, { status: 500 });
      if (state.cancelApplies) remote.cancel_at_cycle_end = true;
      if (state.cancelEvidence) Object.assign(remote, { remaining_count: 0, end_at: remote.current_end });
      return Response.json(state.cancelResponse || remote);
    }
    if (path === "subscriptions/sub_test" && options?.method === "PATCH") {
      if (state.upgradeMode === "network") throw new Error("network failure");
      if (state.upgradeMode === "failure") return Response.json({ error: { description: "unsupported transition" } }, { status: 400 });
      if (state.upgradeMode === "success") {
        const update = JSON.parse(options.body);
        remote.plan_id = update.plan_id;
        if (update.remaining_count != null) remote.remaining_count = update.remaining_count;
        remote.cancel_at_cycle_end = false;
      }
      return Response.json(remote);
    }
    if (path === "subscriptions" && options?.method === "POST" && state.subscriptionsCreated++ > 0) {
      if (state.upgradeMode === "create-failure") return Response.json({ error: { description: "rejected" } }, { status: 400 });
      const body = JSON.parse(options.body);
      state.upgradeRemote = { id: "sub_pro", plan_id: body.plan_id, status: "created", notes: body.notes, total_count: body.total_count, remaining_count: body.total_count };
      return Response.json(state.upgradeRemote);
    }
    if (path.startsWith("subscriptions/sub_pro")) {
      if (path.endsWith("/cancel")) state.upgradeRemote.status = "cancelled";
      return Response.json(state.upgradeRemote);
    }
    if (path === "subscriptions") remote.plan_id = JSON.parse(options.body).plan_id;
    return Response.json(remote);
  };
  return { state, remote, restore() { names.forEach((name, index) => previous[index] == null ? delete process.env[name] : (process.env[name] = previous[index])); globalThis.fetch = fetch; console.error = errorLog; } };
}
const jsonRequest = (path, body) => new Request(`https://app.example${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const patchRequest = (path) => new Request(`https://app.example${path}`, { method: "PATCH" });
const checkoutSignature = (subscriptionId = "sub_test") => createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`pay_test|${subscriptionId}`).digest("hex");
function eventRequest(event, signature = true, subscriptionId = "sub_test") {
  const body = JSON.stringify({ event, payload: { subscription: { entity: { id: subscriptionId } } } });
  return new Request("https://app.example/api/webhooks/razorpay", { method: "POST", headers: { "x-razorpay-signature": signature ? createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex") : "invalid" }, body });
}

async function activateCreator(context) {
  const checkout = await billing.POST(jsonRequest("/api/billing/subscription", { planCode: "creator" }));
  assert.equal(checkout.status, 201);
  Object.assign(context.remote, { status: "active", paid_count: 1, current_start: 1700000000, current_end: 1702592000, remaining_count: 119 });
  const verified = await verify.POST(jsonRequest("/api/billing/verify", { razorpay_payment_id: "pay_test", razorpay_subscription_id: "sub_test", razorpay_signature: checkoutSignature() }));
  assert.equal(verified.status, 200);
}

test("Creator to Creator is rejected as already current without a new subscription", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    const response = await billing.POST(jsonRequest("/api/billing/subscription", { planCode: "creator" }));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /already your current plan/i);
    assert.equal(state.providerCalls.filter((call) => call.path === "subscriptions" && call.options?.method === "POST").length, 1);
    assert.equal(state.providerCalls.filter((call) => call.path === "subscriptions/sub_test" && call.options?.method === "PATCH").length, 0);
  } finally { context.restore(); }
});

const proPlanId = () => process.env.RAZORPAY_PRO_MONTHLY_PLAN_ID;
const createdSubscriptions = () => state.providerCalls.filter((call) => call.path === "subscriptions" && call.options?.method === "POST").length;
const getBilling = async () => (await billing.GET(new Request("https://app.example/api/billing/subscription"))).json();
const authorizePro = (context) => Object.assign(context.state.upgradeRemote, { status: "active", paid_count: 1, current_start: 1700100000, current_end: 1702692000, remaining_count: 119 });
const verifyPro = () => verify.POST(jsonRequest("/api/billing/verify", { razorpay_payment_id: "pay_test", razorpay_subscription_id: "sub_pro", razorpay_signature: checkoutSignature("sub_pro") }));

async function startCancelledCreatorUpgrade(context) {
  await activateCreator(context);
  state.subscription.cancelAtPeriodEnd = true;
  const response = await billing.POST(jsonRequest("/api/billing/subscription", { planCode: "pro" }));
  return { response, body: await response.json() };
}

test("Creator to Pro starts a separate Pro authorization without changing the UPI Creator subscription", async () => {
  const context = setup();
  try {
    const { response, body } = await startCancelledCreatorUpgrade(context);
    assert.equal(response.status, 201);
    assert.equal(body.subscriptionId, "sub_pro");
    assert.equal(body.upgradeCheckout, true);
    assert.equal(body.plan.monthlyPrice, 149900);
    assert.equal(context.state.upgradeRemote.plan_id, proPlanId());
    assert.equal(context.state.upgradeRemote.notes.organizationId, "workspace-one");
    assert.equal(state.providerCalls.filter((call) => call.path === "subscriptions/sub_test" && call.options?.method === "PATCH").length, 0);
    assert.equal(createdSubscriptions(), 2);
    assert.equal(state.subscription.providerSubscriptionId, "sub_test");
  } finally { context.restore(); }
});

test("pending upgrade keeps Creator, scheduled cancellation and period end; Pro is not granted before confirmation", async () => {
  const context = setup();
  try {
    const periodEnd = (await (async () => { await activateCreator(context); return state.subscription.currentPeriodEnd; })());
    state.subscription.cancelAtPeriodEnd = true;
    assert.equal((await billing.POST(jsonRequest("/api/billing/subscription", { planCode: "pro" }))).status, 201);
    context.state.upgradeRemote.status = "authenticated";
    assert.equal((await verifyPro()).status, 202);
    const pending = await getBilling();
    assert.equal(pending.planChangePending, true);
    assert.equal(pending.pendingPlan.code, "pro");
    assert.equal(pending.effectivePlan.code, "creator");
    assert.equal(pending.subscription.status, "ACTIVE");
    assert.equal(pending.subscription.cancelAtPeriodEnd, true);
    assert.equal(state.subscription.currentPeriodEnd.getTime(), periodEnd.getTime());
    assert.equal(state.providerCalls.filter((call) => call.path === "subscriptions/sub_test/cancel").length, 0);
  } finally { context.restore(); }
});

test("failed Pro upgrade preserves Creator and its scheduled cancellation", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    state.subscription.cancelAtPeriodEnd = true;
    context.state.upgradeMode = "create-failure";
    const response = await billing.POST(jsonRequest("/api/billing/subscription", { planCode: "pro" }));
    assert.equal(response.status, 400);
    assert.equal(state.subscription.planId, "creator");
    assert.equal(state.subscription.status, "ACTIVE");
    assert.equal(state.subscription.cancelAtPeriodEnd, true);
    assert.equal(state.subscription.pendingPlanId, null);
    assert.equal(state.subscription.pendingProviderSubscriptionId, null);
  } finally { context.restore(); }
});

test("abandoned upgrade checkout keeps Creator cancellation and is resumable or released", async () => {
  const context = setup();
  try {
    await startCancelledCreatorUpgrade(context);
    const resumed = await billing.POST(jsonRequest("/api/billing/subscription", { planCode: "pro" }));
    assert.equal(resumed.status, 201);
    assert.equal((await resumed.json()).subscriptionId, "sub_pro");
    assert.equal(createdSubscriptions(), 2);
    assert.equal((await getBilling()).subscription.cancelAtPeriodEnd, true);
    context.state.upgradeRemote.status = "expired";
    const released = await getBilling();
    assert.equal(released.planChangePending, false);
    assert.equal(released.effectivePlan.code, "creator");
    assert.equal(released.subscription.cancelAtPeriodEnd, true);
    assert.equal(state.subscription.pendingProviderSubscriptionId, null);
  } finally { context.restore(); }
});

test("provider-confirmed upgrade activates Pro and closes the old Creator subscription", async () => {
  const context = setup();
  try {
    await startCancelledCreatorUpgrade(context);
    authorizePro(context);
    const verified = await verifyPro();
    assert.equal(verified.status, 200);
    assert.equal((await verified.json()).plan, "pro");
    assert.equal(state.subscription.planId, "pro");
    assert.equal(state.subscription.providerSubscriptionId, "sub_pro");
    assert.equal(state.subscription.cancelAtPeriodEnd, false);
    assert.equal(state.subscription.currentPeriodEnd.getTime(), 1702692000 * 1000);
    assert.equal(state.subscription.pendingChangeType, null);
    const closed = state.providerCalls.filter((call) => call.path === "subscriptions/sub_test/cancel");
    assert.equal(closed.length, 1);
    assert.deepEqual(JSON.parse(closed[0].options.body), { cancel_at_cycle_end: 0 });
    assert.equal(context.remote.status, "cancelled");
    const result = await getBilling();
    assert.equal(result.effectivePlan.code, "pro");
    assert.equal(result.effectivePlan.maxProjects, null);
    assert.equal(result.effectivePlan.maxFacebookAccounts, 5);
    assert.equal(result.planChangePending, false);
  } finally { context.restore(); }
});

test("duplicate Upgrade clicks create one Pro subscription", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    const responses = await Promise.all([1, 2].map(() => billing.POST(jsonRequest("/api/billing/subscription", { planCode: "pro" }))));
    assert.ok(responses.every((response) => [201, 409].includes(response.status)));
    assert.equal((await billing.POST(jsonRequest("/api/billing/subscription", { planCode: "pro" }))).status, 201);
    assert.equal(createdSubscriptions(), 2);
  } finally { context.restore(); }
});

test("duplicate upgrade webhooks and verification retries are idempotent", async () => {
  const context = setup();
  try {
    await startCancelledCreatorUpgrade(context);
    authorizePro(context);
    for (let attempt = 0; attempt < 3; attempt += 1) assert.equal((await webhook.POST(eventRequest("subscription.activated", true, "sub_pro"))).status, 200);
    assert.equal((await verifyPro()).status, 200);
    assert.equal(state.subscription.planId, "pro");
    assert.equal(state.providerCalls.filter((call) => call.path === "subscriptions/sub_test/cancel").length, 1);
    assert.equal(createdSubscriptions(), 2);
  } finally { context.restore(); }
});

test("unexpected plan on the pending upgrade subscription is rejected without granting Pro", async () => {
  const context = setup();
  try {
    await startCancelledCreatorUpgrade(context);
    authorizePro(context);
    context.state.upgradeRemote.plan_id = "plan_unexpected";
    assert.equal((await webhook.POST(eventRequest("subscription.activated", true, "sub_pro"))).status, 500);
    assert.equal(state.subscription.planId, "creator");
    assert.equal(state.subscription.cancelAtPeriodEnd, true);
    context.state.upgradeRemote.plan_id = proPlanId();
    context.remote.plan_id = proPlanId();
    assert.equal((await webhook.POST(eventRequest("subscription.updated"))).status, 500);
    assert.equal(state.subscription.planId, "creator");
  } finally { context.restore(); }
});

test("old Creator lifecycle events cannot downgrade an activated Pro subscription", async () => {
  const context = setup();
  try {
    await startCancelledCreatorUpgrade(context);
    authorizePro(context);
    assert.equal((await verifyPro()).status, 200);
    for (const event of ["subscription.cancelled", "subscription.completed", "subscription.charged"]) {
      assert.equal((await webhook.POST(eventRequest(event))).status, 200);
    }
    const result = await getBilling();
    assert.equal(result.effectivePlan.code, "pro");
    assert.equal(state.subscription.status, "ACTIVE");
    assert.equal(state.subscription.providerSubscriptionId, "sub_pro");
  } finally { context.restore(); }
});

test("Pro to Creator remains blocked as a future downgrade without creating another subscription", async () => {
  const context = setup();
  try {
    await startCancelledCreatorUpgrade(context);
    authorizePro(context);
    assert.equal((await verifyPro()).status, 200);
    const response = await billing.POST(jsonRequest("/api/billing/subscription", { planCode: "creator" }));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /not supported yet/i);
    assert.equal(createdSubscriptions(), 2);
  } finally { context.restore(); }
});

test("without a confirmed upgrade, terminal Creator cancellation still falls back to Free", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    state.subscription.cancelAtPeriodEnd = true;
    context.remote.status = "cancelled";
    assert.equal((await webhook.POST(eventRequest("subscription.cancelled"))).status, 200);
    const result = await (await billing.GET(new Request("https://app.example/api/billing/subscription"))).json();
    assert.equal(result.effectivePlan.code, "free");
    assert.equal(state.subscription.status, "CANCELLED");
  } finally { context.restore(); }
});

test("cancellation succeeds only after Razorpay confirms cycle-end cancellation", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    context.state.cancelApplies = true;
    const response = await billing.PATCH(patchRequest("/api/billing/subscription"));
    assert.equal(response.status, 200);
    const cancellationCalls = state.providerCalls.filter((call) => call.path === "subscriptions/sub_test/cancel");
    assert.equal(cancellationCalls.length, 1);
    assert.equal(cancellationCalls[0].options.method, "POST");
    assert.deepEqual(JSON.parse(cancellationCalls[0].options.body), { cancel_at_cycle_end: 1 });
    assert.equal(state.subscription.status, "ACTIVE");
    assert.equal(state.subscription.cancelAtPeriodEnd, true);
    assert.ok(state.subscription.currentPeriodEnd instanceof Date);
  } finally { context.restore(); }
});

test("successful cancellation response must still identify an active subscription", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    context.state.cancelResponse = { id: "sub_test", status: "cancelled", cancel_at_cycle_end: true };
    const response = await billing.PATCH(patchRequest("/api/billing/subscription"));
    assert.equal(response.status, 409);
    assert.equal(state.subscription.cancelAtPeriodEnd, false);
  } finally { context.restore(); }
});

test("validated cancellation command with omitted flag schedules cancellation, keeps Creator and is idempotent", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    Object.assign(context.remote, { end_at: 1990000000, remaining_count: 119 });
    const response = await billing.PATCH(patchRequest("/api/billing/subscription"));
    assert.equal(response.status, 200);
    assert.ok(!Object.hasOwn(context.remote, "cancel_at_cycle_end"));
    for (let refresh = 0; refresh < 2; refresh += 1) {
      const result = await (await billing.GET(new Request("https://app.example/api/billing/subscription"))).json();
      assert.equal(result.subscription.status, "ACTIVE");
      assert.equal(result.subscription.cancelAtPeriodEnd, true);
      assert.equal(result.subscription.currentPeriodEnd, new Date(1702592000 * 1000).toISOString());
      assert.equal(result.effectivePlan.code, "creator");
    }
    assert.equal(state.subscription.cancelAtPeriodEnd, true);
  } finally { context.restore(); }
});

test("explicit provider renewal contradiction rejects cancellation", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    Object.assign(context.remote, { cancel_at_cycle_end: false, end_at: 1990000000, remaining_count: 119 });
    const response = await billing.PATCH(patchRequest("/api/billing/subscription"));
    assert.equal(response.status, 409);
    assert.equal(state.subscription.status, "ACTIVE");
    assert.equal(state.subscription.cancelAtPeriodEnd, false);
    const result = await (await billing.GET(new Request("https://app.example/api/billing/subscription"))).json();
    assert.equal(result.subscription.cancelAtPeriodEnd, false);
    assert.equal(result.subscription.currentPeriodEnd, new Date(1702592000 * 1000).toISOString());
  } finally { context.restore(); }
});

test("webhooks preserve known cancellation when the optional flag is omitted and apply definitive transitions", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    state.subscription.cancelAtPeriodEnd = true;
    Object.assign(context.remote, { remaining_count: 0, end_at: context.remote.current_end });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.equal((await webhook.POST(eventRequest("subscription.updated"))).status, 200);
      assert.equal(state.subscription.cancelAtPeriodEnd, true);
      assert.equal(state.subscription.status, "ACTIVE");
    }
    Object.assign(context.remote, { remaining_count: 119, end_at: 1990000000 });
    assert.equal((await webhook.POST(eventRequest("subscription.updated"))).status, 200);
    assert.equal(state.subscription.cancelAtPeriodEnd, true);
    context.remote.status = "cancelled";
    assert.equal((await webhook.POST(eventRequest("subscription.cancelled"))).status, 200);
    assert.equal(state.subscription.status, "CANCELLED");
    assert.equal(state.subscription.cancelAtPeriodEnd, false);
  } finally { context.restore(); }
});

test("provider cancellation failure leaves the active subscription cancellation state unchanged", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    context.state.cancelFails = true;
    const response = await billing.PATCH(patchRequest("/api/billing/subscription"));
    assert.equal(response.status, 503);
    assert.equal(state.subscription.status, "ACTIVE");
    assert.equal(state.subscription.cancelAtPeriodEnd, false);
  } finally { context.restore(); }
});

test("active billing retrieval reconciles cancellation state in both directions", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    state.subscription.cancelAtPeriodEnd = true;
    context.remote.cancel_at_cycle_end = false;
    let response = await billing.GET(new Request("https://app.example/api/billing/subscription"));
    assert.equal((await response.json()).subscription.cancelAtPeriodEnd, false);
    assert.equal(state.subscription.cancelAtPeriodEnd, false);

    state.subscription.cancelAtPeriodEnd = false;
    context.remote.cancel_at_cycle_end = true;
    response = await billing.GET(new Request("https://app.example/api/billing/subscription"));
    assert.equal((await response.json()).subscription.cancelAtPeriodEnd, true);
    assert.equal(state.subscription.cancelAtPeriodEnd, true);
  } finally { context.restore(); }
});

test("replayed signed webhooks preserve authoritative cancellation state", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    context.remote.cancel_at_cycle_end = true;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.equal((await webhook.POST(eventRequest("subscription.updated"))).status, 200);
      assert.equal(state.subscription.cancelAtPeriodEnd, true);
    }
    context.remote.cancel_at_cycle_end = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.equal((await webhook.POST(eventRequest("subscription.updated"))).status, 200);
      assert.equal(state.subscription.cancelAtPeriodEnd, false);
    }
  } finally { context.restore(); }
});

test("signed checkout reconciles provider activation and Creator persists as current across reload", async () => {
  const context = setup();
  try {
    assert.equal((await (await billing.GET(new Request("https://app.example/api/billing/subscription"))).json()).effectivePlan.code, "free");
    const checkout = await billing.POST(jsonRequest("/api/billing/subscription", { planCode: "creator", price: 1 }));
    assert.equal(checkout.status, 201);
    assert.equal((await checkout.json()).plan.monthlyPrice, 59900);
    const payload = JSON.parse(state.providerCalls.find((call) => call.path === "subscriptions").options.body);
    assert.ok(!Object.hasOwn(payload, "price"));
    Object.assign(context.remote, { status: "active", paid_count: 1, current_start: 1700000000, current_end: 1702592000 });
    const verified = await verify.POST(jsonRequest("/api/billing/verify", { razorpay_payment_id: "pay_test", razorpay_subscription_id: "sub_test", razorpay_signature: checkoutSignature() }));
    assert.equal(verified.status, 200);
    assert.equal((await verified.json()).status, "ACTIVE");
    assert.equal(state.subscription.status, "ACTIVE");
    assert.ok(state.providerCalls.some((call) => call.path === "subscriptions/sub_test"));
    assert.equal((await (await billing.GET(new Request("https://app.example/api/billing/subscription"))).json()).effectivePlan.code, "creator");
    assert.equal((await verify.POST(jsonRequest("/api/billing/verify", { razorpay_payment_id: "pay_test", razorpay_subscription_id: "sub_test", razorpay_signature: checkoutSignature() }))).status, 200);
    assert.equal((await webhook.POST(eventRequest("subscription.activated", false))).status, 400);
    assert.equal(state.subscription.status, "ACTIVE");
    assert.equal((await webhook.POST(eventRequest("subscription.activated"))).status, 200);
    assert.equal((await webhook.POST(eventRequest("subscription.activated"))).status, 200);
    assert.equal(state.subscription.status, "ACTIVE");
    Object.assign(context.remote, { status: "active", paid_count: 1, current_start: 1700000000, current_end: 1702592000 });
    assert.equal((await webhook.POST(eventRequest("subscription.activated"))).status, 200);
    assert.equal(state.subscription.status, "ACTIVE");
    for (let refresh = 0; refresh < 2; refresh += 1) assert.equal((await (await billing.GET(new Request("https://app.example/api/billing/subscription"))).json()).effectivePlan.code, "creator");
    context.remote.status = "cancelled";
    await webhook.POST(eventRequest("subscription.activated"));
    assert.equal(state.subscription.status, "CANCELLED");
  } finally { context.restore(); }
});

test("billing refresh reconciles an existing pending subscription from Razorpay", async () => {
  const context = setup();
  try {
    await billing.POST(jsonRequest("/api/billing/subscription", { planCode: "creator" }));
    Object.assign(context.remote, { status: "active", paid_count: 1, current_start: 1700000000, current_end: 1702592000 });
    const refreshed = await billing.GET(new Request("https://app.example/api/billing/subscription"));
    const result = await refreshed.json();
    assert.equal(result.effectivePlan.code, "creator");
    assert.equal(result.paymentPending, false);
    assert.equal(result.subscription.status, "ACTIVE");
    assert.equal(state.subscription.status, "ACTIVE");
  } finally { context.restore(); }
});

test("Free to Pro maps 1499, invalid plan and foreign-workspace signatures never activate a subscription", async () => {
  const context = setup();
  try {
    assert.equal((await billing.POST(jsonRequest("/api/billing/subscription", { planCode: "invalid" }))).status, 400);
    const checkout = await billing.POST(jsonRequest("/api/billing/subscription", { planCode: "pro", price: 1 }));
    assert.equal((await checkout.json()).plan.monthlyPrice, 149900);
    assert.equal((await verify.POST(jsonRequest("/api/billing/verify", { razorpay_payment_id: "pay_test", razorpay_subscription_id: "sub_test", razorpay_signature: "invalid" }))).status, 400);
    assert.equal((await verify.POST(jsonRequest("/api/billing/verify", { razorpay_payment_id: "pay_test", razorpay_subscription_id: "sub_test" }))).status, 400);
    assert.equal((await verify.POST(jsonRequest("/api/billing/verify", { razorpay_payment_id: "pay_test", razorpay_subscription_id: "sub_other", razorpay_signature: checkoutSignature() }))).status, 404);
    assert.equal(state.providerCalls.filter((call) => call.path === "subscriptions/sub_test").length, 0);
    context.remote.status = "authenticated";
    const pending = await verify.POST(jsonRequest("/api/billing/verify", { razorpay_payment_id: "pay_test", razorpay_subscription_id: "sub_test", razorpay_signature: checkoutSignature() }));
    assert.equal(pending.status, 202);
    assert.equal((await pending.json()).status, "PAST_DUE");
    globalThis.__creatoraBillingContext.user.organizationId = "workspace-two";
    assert.equal((await verify.POST(jsonRequest("/api/billing/verify", { razorpay_payment_id: "pay_test", razorpay_subscription_id: "sub_test", razorpay_signature: checkoutSignature() }))).status, 404);
    assert.equal(state.subscription.organizationId, "workspace-one");
    assert.equal(state.subscription.status, "PAST_DUE");
  } finally { context.restore(); }
});

test("generation endpoint rejects Free Avatar before scheduling even with development bypass flags; paid plans allow it", async () => {
  const context = setup();
  try {
    for (const code of ["free", "creator", "pro"]) {
      state.subscription.planId = code;
      state.subscription.status = code === "free" ? "TRIALING" : "ACTIVE";
      const form = new FormData(); form.set("kind", "video"); form.set("avatarConfig", JSON.stringify({ enabled: true }));
      const calls = globalThis.__creatoraBillingGenerationCalls;
      const response = await generation.POST(new Request("https://app.example/api/generation-jobs", { method: "POST", body: form }));
      assert.equal(response.status, code === "free" ? 403 : 202);
      assert.equal(globalThis.__creatoraBillingGenerationCalls - calls, code === "free" ? 0 : 1);
      if (code === "free") assert.equal((await response.json()).code, "UPGRADE_REQUIRED");
    }
  } finally { context.restore(); }
});

test("Free image allowance is server enforced before scheduling", async () => {
  const context = setup();
  try {
    state.imageCount = 10;
    const form = new FormData(); form.set("kind", "image");
    const response = await generation.POST(new Request("https://app.example/api/generation-jobs", { method: "POST", body: form }));
    assert.equal(response.status, 403);
    assert.equal(globalThis.__creatoraBillingGenerationCalls, 0);
  } finally { context.restore(); }
});

test("unsigned webhook does not call the provider or change state", async () => {
  const context = setup();
  try {
    assert.equal((await webhook.POST(eventRequest("subscription.activated", false))).status, 400);
    assert.equal(state.providerCalls.length, 0);
    assert.equal(state.writes, 0);
  } finally { context.restore(); }
});

test("network failure leaves the active subscription cancellation state unchanged", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    context.state.cancelNetworkFails = true;
    const response = await billing.PATCH(patchRequest("/api/billing/subscription"));
    assert.equal(response.status, 503);
    assert.equal(state.subscription.status, "ACTIVE");
    assert.equal(state.subscription.cancelAtPeriodEnd, false);
  } finally { context.restore(); }
});

test("webhook reconciliation clears cancellation after a definitive period renewal", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    state.subscription.cancelAtPeriodEnd = true;
    Object.assign(context.remote, { current_start: 1702592000, current_end: 1705184000 });
    assert.ok(!Object.hasOwn(context.remote, "cancel_at_cycle_end"));
    assert.equal((await webhook.POST(eventRequest("subscription.charged"))).status, 200);
    assert.equal(state.subscription.status, "ACTIVE");
    assert.equal(state.subscription.cancelAtPeriodEnd, false);
  } finally { context.restore(); }
});

test("cancellation identity mismatch never marks the local subscription", async () => {
  const context = setup();
  try {
    await activateCreator(context);
    context.state.cancelResponse = { id: "sub_other", status: "active" };
    const response = await billing.PATCH(patchRequest("/api/billing/subscription"));
    assert.equal(response.status, 502);
    assert.equal(state.subscription.status, "ACTIVE");
    assert.equal(state.subscription.cancelAtPeriodEnd, false);
  } finally { context.restore(); }
});
