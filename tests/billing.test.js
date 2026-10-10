import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_CATALOG, planRecordData, planEnvId, assertGenerationEntitlement, assertGenerationQuota, assertProjectCapacity, assertSocialAccountCapacity, workspaceEntitlements } from "../lib/planCatalog.js";
import { PRICING_PLANS } from "../lib/pricingPlans.js";
import { createHmac } from "node:crypto";
import { verifyCheckoutSignature, verifyWebhookSignature, razorpayRequest } from "../lib/razorpay.js";
import { normalizeRazorpaySubscriptionState, PROVIDER_CANCELLATION_STATE, razorpayCancellationState, startSubscriptionCheckout, syncRazorpaySubscription } from "../lib/subscriptionBilling.js";

const activeRemote = (extra = {}) => ({ status: "active", paid_count: 1, current_start: 1700000000, current_end: 1702592000, end_at: 1990000000, remaining_count: 119, ...extra });

test("normalizer represents provider cancellation knowledge as three states", () => {
  assert.equal(razorpayCancellationState(activeRemote({ cancel_at_cycle_end: true })), PROVIDER_CANCELLATION_STATE.CONFIRMED_SCHEDULED);
  assert.equal(razorpayCancellationState(activeRemote({ cancel_at_cycle_end: false })), PROVIDER_CANCELLATION_STATE.CONFIRMED_RENEWING);
  for (const extra of [{}, { remaining_count: 0, end_at: 1702592000 }, { remaining_count: "0", end_at: 1702592000 }]) {
    assert.equal(razorpayCancellationState(activeRemote(extra)), PROVIDER_CANCELLATION_STATE.UNKNOWN);
  }
  const normalized = normalizeRazorpaySubscriptionState(activeRemote({ cancel_at_cycle_end: true }));
  assert.equal(normalized.status, "ACTIVE");
  assert.equal(normalized.cancellationState, PROVIDER_CANCELLATION_STATE.CONFIRMED_SCHEDULED);
  assert.equal(normalized.currentPeriodEnd.toISOString(), new Date(1702592000 * 1000).toISOString());
  assert.equal(normalizeRazorpaySubscriptionState({ status: "completed" }).status, "EXPIRED");
  assert.equal(normalizeRazorpaySubscriptionState({ status: "halted" }).status, "PAST_DUE");
  assert.equal(normalizeRazorpaySubscriptionState({ status: "unknown" }), null);
});

test("authoritative plans match prices, project and social limits", () => {
  for (const [code, price, projects, accounts] of [["free", 0, 2, 0], ["creator", 59900, 10, 1], ["pro", 149900, null, 5], ["business", 499900, null, 10]]) {
    const plan = PLAN_CATALOG[code];
    assert.equal(plan.monthlyPrice, price);
    assert.equal(plan.maxProjects, projects);
    for (const key of ["maxFacebookAccounts", "maxInstagramAccounts", "maxLinkedInAccounts", "maxYouTubeAccounts"]) assert.equal(plan[key], accounts);
    const display = PRICING_PLANS.find((item) => item.code === code);
    assert.equal(display.features.find((feature) => feature.text.startsWith("AI Avatar Video")).included, code !== "free");
    assert.ok(!display.features.some((feature) => /up to 2 (Facebook|Instagram)/.test(feature.text)));
  }
});

test("Free and Creator generation quotas match their advertised allowances without adding plan fields", () => {
  assert.equal(PLAN_CATALOG.free.maxProjects, 2);
  assert.equal(PLAN_CATALOG.free.imageGenerationLimit, 5);
  assert.equal(PLAN_CATALOG.free.videoGenerationLimit, 5);
  assert.equal(PLAN_CATALOG.free.avatarVideo, false);
  assert.equal(PLAN_CATALOG.creator.maxProjects, 10);
  assert.equal(PLAN_CATALOG.creator.imageGenerationLimit, 25);
  assert.equal(PLAN_CATALOG.creator.videoGenerationLimit, 15);
  assert.equal(PLAN_CATALOG.creator.avatarVideoGenerationLimit, 15);
  assert.equal(PLAN_CATALOG.pro.imageGenerationLimit, null);
  assert.equal(PLAN_CATALOG.business.videoGeneration, true);
  const record = planRecordData("creator");
  assert.ok(!Object.hasOwn(record, "videoGenerationLimit"));
  assert.ok(!Object.hasOwn(record, "avatarVideoGenerationLimit"));
});

test("generation quotas count non-failed images, standard videos, and avatar videos separately", async () => {
  const jobs = [
    { type: "VIDEO", status: "COMPLETED", requestPayload: JSON.stringify({ avatarConfig: null }) },
    { type: "VIDEO", status: "QUEUED", requestPayload: JSON.stringify({ avatarConfig: { enabled: true } }) },
    { type: "VIDEO", status: "FAILED", requestPayload: JSON.stringify({ avatarConfig: { enabled: true } }) },
  ];
  const prisma = {
    generationJob: {
      count: async () => 5,
      findMany: async ({ where }) => jobs.filter((job) => job.type === where.type && job.status !== "FAILED"),
    },
  };
  const free = { plan: { name: "Free" }, imageGenerationLimit: 5, videoGenerationLimit: 1 };
  await assert.rejects(() => assertGenerationQuota(prisma, free, { organizationId: "workspace", kind: "image" }), { code: "UPGRADE_REQUIRED" });
  await assert.rejects(() => assertGenerationQuota(prisma, free, { organizationId: "workspace", kind: "video" }), { code: "UPGRADE_REQUIRED" });
  await assert.doesNotReject(() => assertGenerationQuota(prisma, { plan: { name: "Creator" }, avatarVideoGenerationLimit: 2 }, { organizationId: "workspace", kind: "video", avatarVideo: true }));
  await assert.rejects(() => assertGenerationQuota(prisma, { plan: { name: "Creator" }, avatarVideoGenerationLimit: 1 }, { organizationId: "workspace", kind: "video", avatarVideo: true }), { code: "UPGRADE_REQUIRED" });
});

test("avatar entitlement uses existing features JSON without schema changes", () => {
  const data = planRecordData("creator");
  assert.ok(!Object.hasOwn(data, "avatarVideo"));
  assert.ok(JSON.parse(data.features).includes("avatarVideo"));
  assert.equal(planRecordData("pro").maxProjects, null);
  assert.ok(!JSON.stringify(data).includes("Infinity"));
});

test("Free allows standard video but not avatars; paid plans allow avatars", () => {
  for (const code of ["creator", "pro", "business"]) assert.doesNotThrow(() => assertGenerationEntitlement(PLAN_CATALOG[code], { kind: "video", avatarVideo: true }));
  assert.throws(() => assertGenerationEntitlement(PLAN_CATALOG.free, { kind: "video", avatarVideo: true }), { code: "UPGRADE_REQUIRED" });
  assert.doesNotThrow(() => assertGenerationEntitlement(PLAN_CATALOG.free, { kind: "video" }));
  assert.doesNotThrow(() => assertGenerationEntitlement(PLAN_CATALOG.free, { kind: "image" }));
});

test("pending/cancelled/expired workspaces receive Free entitlements", async () => {
  for (const status of ["PAST_DUE", "CANCELLED", "EXPIRED"]) {
    const db = { organization: { findUnique: async () => ({ subscription: { status, plan: { code: "pro" } } }) } };
    assert.equal((await workspaceEntitlements(db, "workspace-test")).code, "free");
  }
});

function paymentSetup() {
  const names = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_CREATOR_MONTHLY_PLAN_ID", "RAZORPAY_PRO_MONTHLY_PLAN_ID", "RAZORPAY_BUSINESS_MONTHLY_PLAN_ID"];
  const previous = names.map((name) => process.env[name]);
  names.forEach((name) => { process.env[name] = `test-only-${name}`; });
  const fetch = globalThis.fetch;
  const requests = [];
  const plans = new Map();
  let current = { id: "workspace-sub", organizationId: "personal-workspace", planId: "free", providerSubscriptionId: null, provider: null, status: "TRIALING", updatedAt: new Date(0) };
  const remote = { id: "sub_test", plan_id: process.env.RAZORPAY_CREATOR_MONTHLY_PLAN_ID, status: "created", notes: { organizationId: "personal-workspace" } };
  const db = {
    plan: { upsert: async ({ create }) => { const plan = { ...create, id: create.code }; plans.set(create.code, plan); return plan; }, findUnique: async ({ where }) => plans.get(where.code) },
    billingAccount: { upsert: async ({ create }) => ({ ...create, id: "billing-test" }) },
    subscription: {
      findUnique: async () => ({ ...current }),
      findFirst: async ({ where }) => current.providerSubscriptionId === where.providerSubscriptionId ? { ...current, plan: plans.get(current.planId) } : null,
      updateMany: async ({ where, data }) => {
        if (Object.entries(where).some(([key, value]) => key === "updatedAt" ? current[key]?.getTime() !== value?.getTime() : current[key] !== value)) return { count: 0 };
        current = { ...current, ...data, updatedAt: new Date(current.updatedAt.getTime() + 1) }; return { count: 1 };
      },
    },
  };
  globalThis.fetch = async (url, options) => {
    const path = String(url).split("/v1/")[1]; requests.push({ path, options });
    if (path.startsWith("plans/")) {
      const code = Object.keys(PLAN_CATALOG).find((key) => planEnvId(PLAN_CATALOG[key]) === decodeURIComponent(path.slice(6)));
      return Response.json({ id: planEnvId(PLAN_CATALOG[code]), period: "monthly", interval: 1, item: { amount: PLAN_CATALOG[code].monthlyPrice, currency: "INR" } });
    }
    if (path === "subscriptions") Object.assign(remote, { plan_id: JSON.parse(options.body).plan_id });
    return Response.json(remote);
  };
  return { db, requests, remote, ctx: { user: { sub: "owner", organizationId: "personal-workspace" }, membership: { role: "OWNER" }, organization: { id: "personal-workspace", ownerId: "owner", name: "Test workspace", accountType: "PERSONAL" } }, current: () => current, restore() { names.forEach((name, index) => previous[index] == null ? delete process.env[name] : (process.env[name] = previous[index])); globalThis.fetch = fetch; } };
}

test("checkout maps server prices, reuses pending subscription and persists one workspace row", async () => {
  const context = paymentSetup();
  try {
    const checkout = await startSubscriptionCheckout(context.db, context.ctx, "creator");
    assert.equal(checkout.plan.monthlyPrice, 59900);
    assert.equal(context.current().status, "PAST_DUE");
    assert.equal(context.current().organizationId, context.ctx.organization.id);
    assert.ok(!JSON.stringify(checkout).includes(process.env.RAZORPAY_KEY_SECRET));
    assert.equal((await startSubscriptionCheckout(context.db, context.ctx, "creator")).subscriptionId, checkout.subscriptionId);
    assert.equal(context.requests.filter((request) => request.path === "subscriptions").length, 1);
    const payload = JSON.parse(context.requests.find((request) => request.path === "subscriptions").options.body);
    assert.equal(payload.plan_id, process.env.RAZORPAY_CREATOR_MONTHLY_PLAN_ID);
    assert.ok(!Object.hasOwn(payload, "amount"));
  } finally { context.restore(); }
});

test("concurrent checkout claims prevent duplicate provider subscriptions", async () => {
  const context = paymentSetup();
  try {
    const results = await Promise.allSettled([startSubscriptionCheckout(context.db, context.ctx, "creator"), startSubscriptionCheckout(context.db, context.ctx, "creator")]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(context.requests.filter((request) => request.path === "subscriptions").length, 1);
  } finally { context.restore(); }
});

test("invalid plans, account types, roles and mismatched provider prices fail without creating checkout", async () => {
  const context = paymentSetup();
  try {
    await assert.rejects(startSubscriptionCheckout(context.db, context.ctx, "unknown"), /valid paid plan/);
    await assert.rejects(startSubscriptionCheckout(context.db, context.ctx, "business"), /organization workspace/);
    await assert.rejects(startSubscriptionCheckout(context.db, { ...context.ctx, membership: { role: "MEMBER" } }, "creator"), /owner/);
    globalThis.fetch = async () => Response.json({ id: process.env.RAZORPAY_CREATOR_MONTHLY_PLAN_ID, period: "monthly", interval: 1, item: { amount: 1, currency: "INR" } });
    await assert.rejects(startSubscriptionCheckout(context.db, context.ctx, "creator"), /configuration does not match/);
    assert.equal(context.requests.length, 0);
  } finally { context.restore(); }
});

test("authenticated subscription stays pending; paid activation and terminal states use authoritative provider state", async () => {
  const context = paymentSetup();
  try {
    await startSubscriptionCheckout(context.db, context.ctx, "creator");
    context.remote.status = "authenticated";
    assert.equal(await syncRazorpaySubscription(context.db, "sub_test"), "PAST_DUE");
    Object.assign(context.remote, { status: "active", paid_count: 1, current_start: 1700000000, current_end: 1702592000 });
    assert.equal(await syncRazorpaySubscription(context.db, "sub_test"), "ACTIVE");
    await assert.rejects(startSubscriptionCheckout(context.db, context.ctx, "creator"), /already has a paid/);
    context.remote.status = "cancelled";
    assert.equal(await syncRazorpaySubscription(context.db, "sub_test"), "CANCELLED");
    context.remote.status = "completed";
    assert.equal(await syncRazorpaySubscription(context.db, "sub_test"), "EXPIRED");
    context.remote.notes.organizationId = "another-workspace";
    await assert.rejects(syncRazorpaySubscription(context.db, "sub_test"), /verification failed/);
    delete context.remote.notes.organizationId;
    await assert.rejects(syncRazorpaySubscription(context.db, "sub_test"), /verification failed/);
  } finally { context.restore(); }
});

test("checkout and webhook signatures reject altered payloads and unsigned requests", () => {
  const context = paymentSetup();
  try {
    const signature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update("pay_test|sub_test").digest("hex");
    assert.equal(verifyCheckoutSignature({ paymentId: "pay_test", subscriptionId: "sub_test", signature }), true);
    assert.equal(verifyCheckoutSignature({ paymentId: "pay_other", subscriptionId: "sub_test", signature }), false);
    const body = JSON.stringify({ event: "subscription.activated" });
    const webhook = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
    assert.equal(verifyWebhookSignature(body, webhook), true);
    assert.equal(verifyWebhookSignature(body + " ", webhook), false);
    assert.equal(verifyWebhookSignature(body, ""), false);
  } finally { context.restore(); }
});

test("provider failures return safe errors without secret/raw response details", async () => {
  const context = paymentSetup();
  try {
    globalThis.fetch = async () => Response.json({ error: { description: "private provider diagnostic" } }, { status: 500 });
    await assert.rejects(razorpayRequest("subscriptions"), { code: "RAZORPAY_API_ERROR", message: "Payment service could not process this request. Please try again later." });
    globalThis.fetch = async () => { throw new Error("private network diagnostic"); };
    await assert.rejects(razorpayRequest("subscriptions"), { code: "RAZORPAY_UNAVAILABLE" });
  } finally { context.restore(); }
});

test("server-side project and social capacity gates enforce all advertised limits", () => {
  assert.doesNotThrow(() => assertProjectCapacity(PLAN_CATALOG.free, 1));
  assert.throws(() => assertProjectCapacity(PLAN_CATALOG.free, 2), { code: "PROJECT_LIMIT_REACHED", limit: 2, used: 2 });
  assert.doesNotThrow(() => assertProjectCapacity(PLAN_CATALOG.pro, 10000));
  for (const platform of ["FACEBOOK", "INSTAGRAM", "LINKEDIN", "YOUTUBE"]) {
    assert.throws(() => assertSocialAccountCapacity(PLAN_CATALOG.free, platform, 0), { code: "UPGRADE_REQUIRED" });
    assert.doesNotThrow(() => assertSocialAccountCapacity(PLAN_CATALOG.creator, platform, 0));
    assert.throws(() => assertSocialAccountCapacity(PLAN_CATALOG.creator, platform, 1), { code: "UPGRADE_REQUIRED" });
    assert.doesNotThrow(() => assertSocialAccountCapacity(PLAN_CATALOG.pro, platform, 4));
    assert.throws(() => assertSocialAccountCapacity(PLAN_CATALOG.pro, platform, 5), { code: "UPGRADE_REQUIRED" });
  }
});

test("Business checkout preserves its configured price and allows organization admins", async () => {
  const context = paymentSetup();
  try {
    context.ctx.organization.accountType = "ORGANIZATION";
    context.ctx.membership.role = "ADMIN";
    const checkout = await startSubscriptionCheckout(context.db, context.ctx, "business");
    assert.equal(checkout.plan.monthlyPrice, 499900);
    assert.equal(checkout.plan.avatarVideo, true);
    assert.equal(context.remote.plan_id, process.env.RAZORPAY_BUSINESS_MONTHLY_PLAN_ID);
  } finally { context.restore(); }
});

test("active without confirmed paid cycles remains pending; webhook update races require retry", async () => {
  const context = paymentSetup();
  try {
    await startSubscriptionCheckout(context.db, context.ctx, "creator");
    Object.assign(context.remote, { status: "active", current_start: 1700000000, current_end: 1702592000 });
    assert.equal(await syncRazorpaySubscription(context.db, "sub_test"), "PAST_DUE");
    context.remote.paid_count = 1;
    context.db.subscription.updateMany = async () => ({ count: 0 });
    await assert.rejects(syncRazorpaySubscription(context.db, "sub_test"), { statusCode: 503 });
  } finally { context.restore(); }
});
