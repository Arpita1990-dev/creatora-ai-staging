const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const RAZORPAY_SCRIPT_SELECTOR = 'script[data-creatora-razorpay="true"]';

let razorpayCheckoutPromise;

export function loadRazorpayCheckout() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Payment checkout is only available in the browser."));
  }
  if (window.Razorpay) return Promise.resolve();
  if (razorpayCheckoutPromise) return razorpayCheckoutPromise;

  razorpayCheckoutPromise = new Promise((resolve, reject) => {
    let script = document.querySelector(RAZORPAY_SCRIPT_SELECTOR);
    const created = !script;

    if (!script) {
      script = document.createElement("script");
      script.src = RAZORPAY_CHECKOUT_SRC;
      script.async = true;
      script.dataset.creatoraRazorpay = "true";
    }

    const cleanup = () => {
      clearTimeout(timeout);
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
    };
    const failed = () => {
      cleanup();
      script.remove();
      razorpayCheckoutPromise = null;
      reject(new Error("Unable to load payment checkout. Please try again."));
    };
    const loaded = () => {
      if (!window.Razorpay) {
        failed();
        return;
      }
      cleanup();
      resolve();
    };
    const timeout = setTimeout(failed, 15_000);

    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (created) document.body.appendChild(script);
  });

  return razorpayCheckoutPromise;
}
