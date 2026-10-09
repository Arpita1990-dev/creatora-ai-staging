import test from "node:test";
import assert from "node:assert/strict";

import { safeSocialError } from "../lib/socialErrorSanitizer.js";

test("redacts OAuth credentials from provider errors", () => {
  const safe = safeSocialError(new Error("Bearer secret.jwt token access_token=abc123&code=oauth-code\nretry"));
  assert.equal(safe.includes("secret.jwt"), false);
  assert.equal(safe.includes("abc123"), false);
  assert.equal(safe.includes("oauth-code"), false);
  assert.equal(safe.includes("\n"), false);
  assert.match(safe, /\[redacted\]/);
});

test("uses a safe fallback for empty errors", () => {
  assert.equal(safeSocialError(null, "Publishing failed."), "Publishing failed.");
});
