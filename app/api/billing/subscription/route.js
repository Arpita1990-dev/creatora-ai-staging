import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePlans } from "@/lib/planCatalog";
import { razorpayRequest } from "@/lib/razorpay";
import { BILLING_ROLES, publicBillingPlan, reconcilePendingUpgrade, startSubscriptionCheckout, syncRazorpaySubscription } from "@/lib/subscriptionBilling";

async function context(request) {
  const { user, membership } = await requireOrganization(request);
  const organization = await prisma.organization.findUnique({ where: { id: user.organizationId } });
  if (!organization) throw new Error("Workspace not found.");
  return { user, membership, organization };
}

function failure(error, fallback) {
  const safe = ["BILLING_ERROR", "RAZORPAY_API_ERROR", "RAZORPAY_UNAVAILABLE"].includes(error.code);
  return NextResponse.json({ error: safe ? error.message : fallback }, { status: safe ? error.statusCode : /auth|organization access/i.test(error.message || "") ? 401 : 400 });
}

export async function GET(request) {
  try {
    const { user, organization, membership } = await context(request);
    const plans = await ensurePlans(prisma);
    let subscription = await prisma.subscription.findUnique({
      where: { organizationId: user.organizationId }, include: { plan: true },
    });
    if (subscription?.pendingChangeStatus === "PENDING") {
      try {
        await reconcilePendingUpgrade(prisma, subscription);
        subscription = await prisma.subscription.findUnique({ where: { organizationId: user.organizationId }, include: { plan: true } });
      } catch (error) {
        console.error("Plan upgrade reconciliation deferred.", { provider: "razorpay", operation: "upgrade-reconciliation", category: error.code || "verification-failed" });
      }
    }
    if (subscription?.provider === "RAZORPAY" && ["ACTIVE", "PAST_DUE"].includes(subscription.status) && subscription.providerSubscriptionId && !subscription.providerSubscriptionId.startsWith("checkout_pending_")) {
      try {
        const status = await syncRazorpaySubscription(prisma, subscription.providerSubscriptionId);
        if (!status) throw new Error("Subscription state could not be confirmed.");
        subscription = await prisma.subscription.findUnique({
          where: { organizationId: user.organizationId }, include: { plan: true },
        });
      } catch (error) {
        console.error("Payment subscription reconciliation failed.", { provider: "razorpay", operation: "subscription-reconciliation", category: error.code || "verification-failed" });
        return NextResponse.json({ error: "Unable to verify the current subscription with Razorpay. Please retry shortly." }, { status: 503 });
      }
    }
    const subscriptionStatus = subscription?.status;
    const pendingPlan = subscription?.pendingPlanId ? plans.find((plan) => plan.id === subscription.pendingPlanId) : null;
    return NextResponse.json({
      accountType: organization.accountType,
      canManage: BILLING_ROLES.has(membership.role),
      plans: plans.filter((plan) => plan.accountType === organization.accountType || plan.code === "free").map(publicBillingPlan),
      effectivePlan: publicBillingPlan(subscription && (subscriptionStatus === "ACTIVE" || (subscriptionStatus === "TRIALING" && subscription.plan.code === "free")) ? subscription.plan : { code: "free" }),
      paymentPending: subscription?.provider === "RAZORPAY" && subscriptionStatus === "PAST_DUE",
      planChangePending: subscription?.pendingChangeStatus === "PENDING" && subscription?.pendingChangeType === "UPGRADE",
      pendingPlan: pendingPlan ? publicBillingPlan(pendingPlan) : null,
      subscription: subscription ? {
        id: subscription.id, status: subscriptionStatus,
        plan: publicBillingPlan(subscription.plan), billingCycle: subscription.billingCycle,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      } : null,
      razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    });
  } catch (error) {
    return failure(error, "Unable to load billing.");
  }
}

export async function POST(request) {
  try {
    const ctx = await context(request);
    const body = await request.json();
    const checkout = await startSubscriptionCheckout(prisma, ctx, body.planCode);
    return NextResponse.json(checkout, { status: checkout.upgrade ? (checkout.pending ? 202 : 200) : 201 });
  } catch (error) {
    return failure(error, "Unable to start checkout.");
  }
}

export async function PATCH(request) {
  try {
    const ctx = await context(request);
    if (!BILLING_ROLES.has(ctx.membership.role)) return NextResponse.json({ error: "Only the workspace owner or billing manager can cancel billing." }, { status: 403 });
    const subscription = await prisma.subscription.findUnique({ where: { organizationId: ctx.organization.id }, include: { plan: true } });
    if (subscription?.provider !== "RAZORPAY" || subscription.status !== "ACTIVE" || !subscription.providerSubscriptionId) return NextResponse.json({ error: "No paid subscription is active." }, { status: 409 });
    if (subscription.cancelAtPeriodEnd) return NextResponse.json({ ok: true, cancelAtPeriodEnd: true });
    const cancellation = await razorpayRequest(`subscriptions/${subscription.providerSubscriptionId}/cancel`, {
      method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 1 }),
    });
    if (cancellation?.id !== subscription.providerSubscriptionId) {
      return NextResponse.json({ error: "Razorpay did not confirm the requested subscription. Refresh billing before retrying." }, { status: 502 });
    }
    const providerChanged = cancellation.status !== "active"
      || cancellation.cancel_at_cycle_end === false
      || (cancellation.plan_id != null && cancellation.plan_id !== subscription.plan.razorpayPlanId)
      || (cancellation.notes?.organizationId != null && cancellation.notes.organizationId !== subscription.organizationId);
    if (providerChanged) {
      return NextResponse.json({ error: "Razorpay has not confirmed cancellation at the end of the billing period. Refresh billing before retrying." }, { status: 409 });
    }
    const updated = await prisma.subscription.updateMany({
      where: { id: subscription.id, providerSubscriptionId: subscription.providerSubscriptionId, status: "ACTIVE", updatedAt: subscription.updatedAt },
      data: { cancelAtPeriodEnd: true },
    });
    if (updated.count !== 1) return NextResponse.json({ error: "Subscription confirmation is busy. Please retry shortly." }, { status: 409 });
    return NextResponse.json({ ok: true, cancelAtPeriodEnd: true });
  } catch (error) {
    return failure(error, "Unable to cancel subscription.");
  }
}
