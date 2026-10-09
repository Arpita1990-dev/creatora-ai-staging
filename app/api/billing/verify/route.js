import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyCheckoutSignature } from "@/lib/razorpay";
import { BILLING_ROLES, syncRazorpayProviderSubscription } from "@/lib/subscriptionBilling";

export async function POST(request) {
  try {
    const { user, membership } = await requireOrganization(request);
    if (!BILLING_ROLES.has(membership.role)) return NextResponse.json({ error: "Insufficient billing permission." }, { status: 403 });
    const body = await request.json();
    const subscriptionId = String(body.razorpay_subscription_id || "");
    const paymentId = String(body.razorpay_payment_id || "");
    const signature = String(body.razorpay_signature || "");
    if (!subscriptionId || !paymentId || !signature) return NextResponse.json({ error: "Razorpay payment confirmation is incomplete." }, { status: 400 });
    const subscription = await prisma.subscription.findFirst({
      where: { organizationId: user.organizationId, provider: "RAZORPAY", OR: [{ providerSubscriptionId: subscriptionId }, { pendingChangeType: "UPGRADE", pendingProviderSubscriptionId: subscriptionId }] }, include: { plan: true },
    });
    if (!subscription) return NextResponse.json({ error: "Subscription does not belong to this workspace." }, { status: 404 });
    if (!verifyCheckoutSignature({ paymentId, subscriptionId, signature })) return NextResponse.json({ error: "Invalid Razorpay payment signature." }, { status: 400 });
    const status = await syncRazorpayProviderSubscription(prisma, subscriptionId);
    const pending = status !== "ACTIVE";
    const confirmed = await prisma.subscription.findUnique({ where: { organizationId: user.organizationId }, include: { plan: true } });
    return NextResponse.json({ ok: true, pending, status, plan: (confirmed || subscription).plan.code }, { status: pending ? 202 : 200 });
  } catch (error) {
    const status = error.statusCode === 503 ? 503 : 400;
    return NextResponse.json({ error: "Unable to verify payment. Please refresh billing and try again." }, { status });
  }
}
