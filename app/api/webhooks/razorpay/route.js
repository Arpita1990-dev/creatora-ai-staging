import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { syncRazorpayProviderSubscription } from "@/lib/subscriptionBilling";

const EVENTS = new Set(["subscription.authenticated", "subscription.activated", "subscription.charged", "subscription.pending", "subscription.halted", "subscription.paused", "subscription.resumed", "subscription.cancelled", "subscription.completed", "subscription.updated"]);

export async function POST(request) {
  const rawBody = await request.text();
  try {
    if (!verifyWebhookSignature(rawBody, request.headers.get("x-razorpay-signature"))) {
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
    }
    const event = JSON.parse(rawBody);
    const entity = event.payload?.subscription?.entity;
    if (entity?.id && EVENTS.has(event.event)) await syncRazorpayProviderSubscription(prisma, String(entity.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Payment webhook failed.", { provider: "razorpay", operation: "subscription-webhook", category: error.code || "invalid-payload" });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: error.statusCode === 503 ? 503 : error instanceof SyntaxError ? 400 : 500 });
  }
}
