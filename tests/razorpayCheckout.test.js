import test from "node:test";
import assert from "node:assert/strict";

function browserHarness() {
  const scripts = [];
  const document = {
    body: { appendChild(script) { scripts.push(script); } },
    createElement() {
      const script = new EventTarget();
      script.dataset = {};
      script.remove = () => {
        const index = scripts.indexOf(script);
        if (index >= 0) scripts.splice(index, 1);
      };
      return script;
    },
    querySelector() { return scripts[0] || null; },
  };
  return { document, scripts };
}

test("Razorpay Checkout loader injects one script and reuses the in-flight request", async () => {
  const harness = browserHarness();
  globalThis.window = {};
  globalThis.document = harness.document;
  try {
    const { loadRazorpayCheckout } = await import("../lib/razorpayCheckout.js?success");
    const first = loadRazorpayCheckout();
    const second = loadRazorpayCheckout();
    assert.equal(first, second);
    assert.equal(harness.scripts.length, 1);
    assert.equal(harness.scripts[0].src, "https://checkout.razorpay.com/v1/checkout.js");

    window.Razorpay = function Razorpay() {};
    harness.scripts[0].dispatchEvent(new Event("load"));
    await first;
    await loadRazorpayCheckout();
    assert.equal(harness.scripts.length, 1);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

test("Razorpay Checkout loader removes a failed script and permits a clean retry", async () => {
  const harness = browserHarness();
  globalThis.window = {};
  globalThis.document = harness.document;
  try {
    const { loadRazorpayCheckout } = await import("../lib/razorpayCheckout.js?failure");
    const failed = loadRazorpayCheckout();
    assert.equal(harness.scripts.length, 1);
    harness.scripts[0].dispatchEvent(new Event("error"));
    await assert.rejects(failed, /Unable to load payment checkout/);
    assert.equal(harness.scripts.length, 0);

    const retry = loadRazorpayCheckout();
    assert.equal(harness.scripts.length, 1);
    window.Razorpay = function Razorpay() {};
    harness.scripts[0].dispatchEvent(new Event("load"));
    await retry;
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});
