import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function credentials() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");
  return { keyId, keySecret };
}

export function razorpayKeyId() {
  return credentials().keyId;
}

export async function razorpayRequest(path, options = {}) {
  const { keyId, keySecret } = credentials();
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/${path.replace(/^\//, "")}`, {
      ...options,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    const error = new Error("Payment service is temporarily unavailable. Please try again later.");
    error.code = "RAZORPAY_UNAVAILABLE";
    error.statusCode = 503;
    throw error;
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Payment service could not process this request. Please try again later.");
    error.code = "RAZORPAY_API_ERROR";
    error.statusCode = response.status >= 500 || response.status === 429 ? 503 : 400;
    error.providerStatus = response.status;
    throw error;
  }
  return result;
}

function signatureMatches(value, expected) {
  const left = Buffer.from(String(value || ""), "utf8");
  const right = Buffer.from(String(expected || ""), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyCheckoutSignature({ paymentId, subscriptionId, signature }) {
  const { keySecret } = credentials();
  const expected = createHmac("sha256", keySecret).update(`${paymentId}|${subscriptionId}`).digest("hex");
  return signatureMatches(signature, expected);
}

export function verifyWebhookSignature(rawBody, signature) {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured.");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return signatureMatches(signature, expected);
}
