import "server-only";
import { randomUUID } from "node:crypto";
import { assertPlanAccountType, ensurePlans, planDefinition, PLAN_CATALOG } from "./planCatalog.js";
import { razorpayKeyId, razorpayRequest } from "./razorpay.js";

export const BILLING_ROLES = new Set(["OWNER", "ADMIN", "BILLING"]);

function billingError(message, statusCode = 400) {
  const error = new Error(message);
  error.code = "BILLING_ERROR";
  error.statusCode = statusCode;
  return error;
}

export function publicBillingPlan(plan) {
  const definition = planDefinition(plan?.code) || PLAN_CATALOG.free;
  const { code, name, accountType, monthlyPrice, maxProjects, maxTeamMembers, maxFacebookAccounts, maxInstagramAccounts, maxLinkedInAccounts, maxYouTubeAccounts, imageGeneration, imageGenerationLimit, videoGeneration, videoGenerationLimit, avatarVideo, avatarVideoGenerationLimit, watermark, supportLevel } = definition;
  return { code, name, accountType, monthlyPrice, currency: "INR", maxProjects, maxTeamMembers, maxFacebookAccounts, maxInstagramAccounts, maxLinkedInAccounts, maxYouTubeAccounts, imageGeneration, imageGenerationLimit, videoGeneration, videoGenerationLimit: videoGenerationLimit ?? null, avatarVideo, avatarVideoGenerationLimit: avatarVideoGenerationLimit ?? null, watermark, supportLevel };
}

function checkoutData(subscription, plan, organization) {
  return { keyId: razorpayKeyId(), subscriptionId: subscription.id, plan: publicBillingPlan(plan), organizationName: organization.name };
}

function upgradeData(plan, pending) {
  return { upgrade: true, pending, plan: publicBillingPlan(plan) };
}

const UPGRADE = "UPGRADE";
const SUPERSEDED = "SUPERSEDED_CANCEL";
const UPGRADE_RESERVATION = "upgrade_pending_";
const STALE_RESERVATION_MS = 5 * 60_000;
const TERMINAL_REMOTE = new Set(["cancelled", "completed", "expired"]);

async function clearPendingUpgrade(prisma, record, pendingProviderSubscriptionId) {
  await prisma.subscription.updateMany({
    where: { id: record.id, pendingChangeType: UPGRADE, pendingProviderSubscriptionId },
    data: { pendingPlanId: null, pendingChangeType: null, pendingChangeStatus: null, pendingProviderSubscriptionId: null },
  });
}

async function retireSupersededSubscription(prisma, record) {
  const previousId = record.pendingProviderSubscriptionId;
  if (record.pendingChangeType !== SUPERSEDED || !previousId) return;
  let previous = await razorpayRequest(`subscriptions/${encodeURIComponent(previousId)}`);
  if (previous.id !== previousId || previous.notes?.organizationId !== record.organizationId) throw billingError("Previous subscription verification failed.");
  if (!TERMINAL_REMOTE.has(previous.status)) {
    previous = await razorpayRequest(`subscriptions/${encodeURIComponent(previousId)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) });
    if (previous.id !== previousId || !TERMINAL_REMOTE.has(previous.status)) throw billingError("The previous subscription could not be closed yet.", 503);
  }
  await prisma.subscription.updateMany({
    where: { id: record.id, pendingChangeType: SUPERSEDED, pendingProviderSubscriptionId: previousId },
    data: { pendingChangeType: null, pendingChangeStatus: null, pendingProviderSubscriptionId: null },
  });
}

async function retireSupersededSafely(prisma, organizationId) {
  const record = await prisma.subscription.findUnique({ where: { organizationId } });
  try { if (record) await retireSupersededSubscription(prisma, record); }
  catch (error) { console.error("Superseded subscription closure deferred.", { provider: "razorpay", operation: "upgrade-finalization", category: error.code || "close-failed" }); }
}

// Pro is granted only from an authoritative ACTIVE Razorpay state of the expected pending subscription.
export async function reconcilePendingUpgrade(prisma, record) {
  if (record.pendingChangeType === SUPERSEDED) { await retireSupersededSafely(prisma, record.organizationId); return { outcome: "ACTIVATED" }; }
  if (record.pendingChangeType !== UPGRADE || record.pendingChangeStatus !== "PENDING") return { outcome: "NONE" };
  const pendingId = record.pendingProviderSubscriptionId;
  if (!pendingId) { await clearPendingUpgrade(prisma, record, null); return { outcome: "CLEARED" }; }
  if (pendingId.startsWith(UPGRADE_RESERVATION)) {
    if (Date.now() - new Date(record.updatedAt).getTime() > STALE_RESERVATION_MS) { await clearPendingUpgrade(prisma, record, pendingId); return { outcome: "CLEARED" }; }
    return { outcome: "PREPARING" };
  }
  const targetPlan = record.pendingPlanId ? await prisma.plan.findUnique({ where: { id: record.pendingPlanId } }) : null;
  const remote = await razorpayRequest(`subscriptions/${encodeURIComponent(pendingId)}`);
  if (!targetPlan?.razorpayPlanId || remote.id !== pendingId || remote.plan_id !== targetPlan.razorpayPlanId || remote.notes?.organizationId !== record.organizationId) throw billingError("Upgrade verification failed.");
  const normalized = normalizeRazorpaySubscriptionState(remote);
  if (normalized?.status === "ACTIVE") {
    const activated = await prisma.subscription.updateMany({
      where: { id: record.id, pendingChangeType: UPGRADE, pendingProviderSubscriptionId: pendingId, updatedAt: record.updatedAt },
      data: {
        planId: targetPlan.id, provider: "RAZORPAY", providerSubscriptionId: pendingId, providerCustomerId: remote.customer_id || null,
        status: "ACTIVE", billingCycle: "monthly", currentPeriodStart: normalized.currentPeriodStart, currentPeriodEnd: normalized.currentPeriodEnd,
        cancelAtPeriodEnd: normalized.cancellationState === PROVIDER_CANCELLATION_STATE.CONFIRMED_SCHEDULED,
        pendingPlanId: null, pendingChangeType: SUPERSEDED, pendingChangeStatus: "PENDING", pendingProviderSubscriptionId: record.providerSubscriptionId,
      },
    });
    if (activated.count !== 1) throw billingError("Subscription confirmation is busy. Please retry shortly.", 503);
    await retireSupersededSafely(prisma, record.organizationId);
    return { outcome: "ACTIVATED" };
  }
  if (TERMINAL_REMOTE.has(remote.status)) { await clearPendingUpgrade(prisma, record, pendingId); return { outcome: "CLEARED" }; }
  return { outcome: remote.status === "created" ? "AWAITING_AUTHORIZATION" : "PROCESSING", remote };
}

export async function syncRazorpayProviderSubscription(prisma, providerSubscriptionId) {
  const transition = await prisma.subscription.findFirst({ where: { provider: "RAZORPAY", pendingProviderSubscriptionId: providerSubscriptionId } });
  if (transition) return (await reconcilePendingUpgrade(prisma, transition)).outcome === "ACTIVATED" ? "ACTIVE" : "PAST_DUE";
  return syncRazorpaySubscription(prisma, providerSubscriptionId);
}

async function createProUpgradeCheckout(prisma, ctx, current, targetPlan) {
  if (current.status !== "ACTIVE" || current.plan?.code !== "creator") throw billingError("The current subscription could not be verified for upgrade.", 409);
  const remote = await razorpayRequest(`subscriptions/${encodeURIComponent(current.providerSubscriptionId)}`);
  if (remote.id !== current.providerSubscriptionId || remote.plan_id !== current.plan.razorpayPlanId || remote.notes?.organizationId !== current.organizationId || remote.status !== "active") throw billingError("The current subscription could not be verified for upgrade.", 409);
  const reservation = `${UPGRADE_RESERVATION}${randomUUID()}`;
  const claim = await prisma.subscription.updateMany({
    where: { id: current.id, providerSubscriptionId: current.providerSubscriptionId, planId: current.planId, status: "ACTIVE", pendingChangeStatus: null, updatedAt: current.updatedAt },
    data: { pendingPlanId: targetPlan.id, pendingChangeType: UPGRADE, pendingChangeStatus: "PENDING", pendingProviderSubscriptionId: reservation },
  });
  if (claim.count !== 1) throw billingError("Another billing change is already processing. Refresh billing before retrying.", 409);
  let upgrade;
  try {
    upgrade = await razorpayRequest("subscriptions", { method: "POST", body: JSON.stringify({ plan_id: targetPlan.razorpayPlanId, total_count: 120, quantity: 1, customer_notify: 1, notes: { organizationId: ctx.organization.id, planCode: targetPlan.code, billingOwnerId: ctx.organization.ownerId, upgradeFrom: current.plan.code } }) });
    if (!upgrade.id || upgrade.plan_id !== targetPlan.razorpayPlanId) throw billingError("Upgrade checkout could not be confirmed. Please try again.", 503);
  } catch (error) {
    // An unauthorised Razorpay subscription cannot charge, so releasing the claim is safe.
    await clearPendingUpgrade(prisma, current, reservation);
    throw error;
  }
  const saved = await prisma.subscription.updateMany({
    where: { id: current.id, pendingChangeType: UPGRADE, pendingProviderSubscriptionId: reservation },
    data: { pendingProviderSubscriptionId: upgrade.id },
  });
  if (saved.count !== 1) throw billingError("Upgrade checkout could not be confirmed. Please try again.", 503);
  return { ...checkoutData(upgrade, targetPlan, ctx.organization), upgradeCheckout: true };
}

async function startCreatorToProUpgrade(prisma, ctx, current, targetPlan) {
  if (current.pendingChangeStatus === "PENDING") {
    if (current.pendingChangeType !== UPGRADE || current.pendingPlanId !== targetPlan.id) throw billingError("Another billing change is already processing. Refresh billing before retrying.", 409);
    const { outcome, remote } = await reconcilePendingUpgrade(prisma, current);
    if (outcome === "ACTIVATED") return upgradeData(targetPlan, false);
    if (outcome === "AWAITING_AUTHORIZATION") return { ...checkoutData(remote, targetPlan, ctx.organization), upgradeCheckout: true };
    if (outcome === "PROCESSING") return upgradeData(targetPlan, true);
    if (outcome === "PREPARING") throw billingError("Upgrade checkout is already being prepared. Please try again shortly.", 409);
    current = await prisma.subscription.findUnique({ where: { organizationId: current.organizationId }, include: { plan: true } });
  }
  return createProUpgradeCheckout(prisma, ctx, current, targetPlan);
}

export async function startSubscriptionCheckout(prisma, ctx, planCode) {
  if (!BILLING_ROLES.has(ctx.membership.role)) throw billingError("Only the workspace owner, admin or billing manager can change plans.", 403);
  const definition = planDefinition(planCode);
  if (!definition || definition.code === "free") throw billingError("Select a valid paid plan.");
  try { assertPlanAccountType(definition, ctx.organization.accountType); }
  catch (error) { throw billingError(error.message); }
  await ensurePlans(prisma);
  const plan = await prisma.plan.findUnique({ where: { code: definition.code } });
  if (!plan?.razorpayPlanId) throw billingError("This plan is not configured for checkout. Please contact support.", 503);
  const remotePlan = await razorpayRequest(`plans/${encodeURIComponent(plan.razorpayPlanId)}`);
  if (remotePlan.id !== plan.razorpayPlanId || remotePlan.period !== "monthly" || remotePlan.interval !== 1 || remotePlan.item?.amount !== definition.monthlyPrice || remotePlan.item?.currency !== "INR") throw billingError("The payment plan configuration does not match this subscription. Please contact support.", 503);

  let current = await prisma.subscription.findUnique({ where: { organizationId: ctx.organization.id }, include: { plan: true } });
  if (current?.providerSubscriptionId?.startsWith("checkout_pending_")) throw billingError("Checkout is already being prepared for this workspace. Please try again shortly.", 409);
  if (current?.providerSubscriptionId && ["ACTIVE", "TRIALING"].includes(current.status)) {
    if (current.plan?.code === definition.code) throw billingError("This is already your current plan.", 409);
    if (current.status === "ACTIVE" && current.provider === "RAZORPAY" && current.plan?.code === "creator" && definition.code === "pro") return startCreatorToProUpgrade(prisma, ctx, current, plan);
    throw billingError("This workspace already has a paid subscription. The requested plan change is not supported yet.", 409);
  }
  if (current?.providerSubscriptionId) {
    const pending = await razorpayRequest(`subscriptions/${encodeURIComponent(current.providerSubscriptionId)}`);
    if (["active", "pending", "halted", "paused"].includes(pending.status)) throw billingError("A payment or subscription is already processing. Refresh billing before trying again.", 409);
    if (["created", "authenticated"].includes(pending.status)) {
      if (current.planId === plan.id && pending.plan_id === plan.razorpayPlanId) return checkoutData(pending, plan, ctx.organization);
      await razorpayRequest(`subscriptions/${encodeURIComponent(pending.id)}/cancel`, { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 0 }) });
    }
  }

  const billingAccount = ctx.organization.accountType === "ORGANIZATION"
    ? await prisma.billingAccount.upsert({ where: { type_organizationId: { type: "ORGANIZATION", organizationId: ctx.organization.id } }, create: { type: "ORGANIZATION", organizationId: ctx.organization.id }, update: {} })
    : await prisma.billingAccount.upsert({ where: { type_userId: { type: "PERSONAL", userId: ctx.organization.ownerId } }, create: { type: "PERSONAL", userId: ctx.organization.ownerId }, update: {} });
  if (!current) {
    const free = await prisma.plan.findUnique({ where: { code: "free" } });
    try { current = await prisma.subscription.create({ data: { organizationId: ctx.organization.id, planId: free.id, billingAccountId: billingAccount.id, status: "TRIALING" } }); }
    catch { throw billingError("Checkout is already being prepared. Please try again shortly.", 409); }
  }
  const reservation = `checkout_pending_${randomUUID()}`;
  const claim = await prisma.subscription.updateMany({
    where: { id: current.id, providerSubscriptionId: current.providerSubscriptionId, status: current.status, updatedAt: current.updatedAt },
    data: { providerSubscriptionId: reservation, provider: "RAZORPAY", status: "PAST_DUE" },
  });
  if (claim.count !== 1) throw billingError("Checkout is already being prepared. Please try again shortly.", 409);
  let remote;
  try {
    remote = await razorpayRequest("subscriptions", { method: "POST", body: JSON.stringify({ plan_id: plan.razorpayPlanId, total_count: 120, quantity: 1, customer_notify: 1, notes: { organizationId: ctx.organization.id, planCode: plan.code, billingOwnerId: ctx.organization.ownerId } }) });
  } catch (error) {
    if (error.code === "RAZORPAY_API_ERROR" && error.providerStatus < 500) await prisma.subscription.updateMany({ where: { id: current.id, providerSubscriptionId: reservation }, data: { providerSubscriptionId: current.providerSubscriptionId, provider: current.provider, status: current.status } });
    throw error;
  }
  if (!remote.id || remote.plan_id !== plan.razorpayPlanId) throw billingError("Checkout could not be confirmed. Please contact support.", 503);
  const saved = await prisma.subscription.updateMany({
    where: { id: current.id, providerSubscriptionId: reservation },
    data: { planId: plan.id, billingAccountId: billingAccount.id, provider: "RAZORPAY", providerSubscriptionId: remote.id, status: "PAST_DUE", billingCycle: "monthly", cancelAtPeriodEnd: false, currentPeriodStart: null, currentPeriodEnd: null },
  });
  if (saved.count !== 1) throw billingError("Checkout could not be confirmed. Please contact support.", 503);
  return checkoutData(remote, plan, ctx.organization);
}

const RAZORPAY_STATUSES = { created: "PAST_DUE", authenticated: "PAST_DUE", active: "ACTIVE", pending: "PAST_DUE", halted: "PAST_DUE", paused: "PAST_DUE", cancelled: "CANCELLED", completed: "EXPIRED", expired: "EXPIRED" };

export const PROVIDER_CANCELLATION_STATE = Object.freeze({
  CONFIRMED_SCHEDULED: "CONFIRMED_SCHEDULED",
  CONFIRMED_RENEWING: "CONFIRMED_RENEWING",
  UNKNOWN: "UNKNOWN",
});

function unixSeconds(value) {
  const number = Number(value);
  return value != null && value !== "" && Number.isFinite(number) && number > 0 ? number : null;
}

export function razorpayCancellationState(remote) {
  if (remote?.cancel_at_cycle_end === true) return PROVIDER_CANCELLATION_STATE.CONFIRMED_SCHEDULED;
  if (remote?.cancel_at_cycle_end === false) return PROVIDER_CANCELLATION_STATE.CONFIRMED_RENEWING;
  return PROVIDER_CANCELLATION_STATE.UNKNOWN;
}

export function normalizeRazorpaySubscriptionState(remote) {
  let status = RAZORPAY_STATUSES[remote?.status];
  if (!status) return null;
  const currentStart = unixSeconds(remote.current_start);
  const currentEnd = unixSeconds(remote.current_end);
  if (status === "ACTIVE" && (!(Number(remote.paid_count) >= 1) || !currentStart || !currentEnd)) status = "PAST_DUE";
  const cancellationState = razorpayCancellationState(remote);
  return {
    status,
    currentPeriodStart: currentStart ? new Date(currentStart * 1000) : null,
    currentPeriodEnd: currentEnd ? new Date(currentEnd * 1000) : null,
    cancellationState,
  };
}

export async function syncRazorpaySubscription(prisma, providerSubscriptionId) {
  const record = await prisma.subscription.findFirst({ where: { provider: "RAZORPAY", providerSubscriptionId }, include: { plan: true } });
  if (!record) return null;
  const remote = await razorpayRequest(`subscriptions/${encodeURIComponent(providerSubscriptionId)}`);
  const definition = planDefinition(record.plan.code);
  let pendingPlan = null;
  if (record.pendingChangeStatus === "PENDING" && record.pendingChangeType === UPGRADE && record.pendingPlanId) pendingPlan = await prisma.plan.findUnique({ where: { id: record.pendingPlanId } });
  const currentPlanMatches = remote.plan_id === record.plan.razorpayPlanId;
  if (!definition || remote.id !== providerSubscriptionId || !currentPlanMatches || remote.notes?.organizationId !== record.organizationId) throw billingError("Subscription verification failed.");
  const normalized = normalizeRazorpaySubscriptionState(remote);
  if (!normalized) return null;
  const { status, cancellationState, ...providerState } = normalized;
  const data = { ...providerState, status, providerCustomerId: remote.customer_id || null };
  const upgradeStillPending = Boolean(pendingPlan && status === "ACTIVE");
  const advancedToNextPeriod = status === "ACTIVE"
    && cancellationState === PROVIDER_CANCELLATION_STATE.UNKNOWN
    && record.currentPeriodEnd
    && normalized.currentPeriodStart
    && normalized.currentPeriodStart >= record.currentPeriodEnd;
  if (status === "CANCELLED" || status === "EXPIRED") data.cancelAtPeriodEnd = false;
  else if (cancellationState === PROVIDER_CANCELLATION_STATE.CONFIRMED_SCHEDULED) data.cancelAtPeriodEnd = true;
  else if (cancellationState === PROVIDER_CANCELLATION_STATE.CONFIRMED_RENEWING || advancedToNextPeriod) data.cancelAtPeriodEnd = false;
  if (upgradeStillPending) data.cancelAtPeriodEnd = record.cancelAtPeriodEnd;
  const updated = await prisma.subscription.updateMany({
    where: { id: record.id, providerSubscriptionId, updatedAt: record.updatedAt },
    data,
  });
  if (updated.count !== 1) throw billingError("Subscription confirmation is busy. Please retry shortly.", 503);
  return status;
}
