import test from "node:test";
import assert from "node:assert/strict";
import { fetchMuApiBalance, invalidateMuApiBalance } from "../lib/balanceClient.js";

function scopedFetcher(scopeKey, values) {
  let calls = 0;
  const fetcher = async () => Response.json({ credits: values[Math.min(calls++, values.length - 1)] });
  fetcher.balanceScopeKey = scopeKey;
  return { fetcher, calls: () => calls };
}

test("personal and organization balance caches stay isolated", async () => {
  const unique = `${Date.now()}-${Math.random()}`;
  const personal = scopedFetcher(`personal:${unique}`, [120]);
  const organization = scopedFetcher(`organization:${unique}`, [840]);

  assert.equal(await fetchMuApiBalance(personal.fetcher), 120);
  assert.equal(await fetchMuApiBalance(organization.fetcher), 840);
  assert.equal(await fetchMuApiBalance(personal.fetcher), 120);
  assert.equal(personal.calls(), 1);
  assert.equal(organization.calls(), 1);
});

test("invalidating one workspace does not clear another workspace cache", async () => {
  const unique = `${Date.now()}-${Math.random()}`;
  const personal = scopedFetcher(`personal:${unique}`, [90, 60]);
  const organization = scopedFetcher(`organization:${unique}`, [740, 700]);

  assert.equal(await fetchMuApiBalance(personal.fetcher), 90);
  assert.equal(await fetchMuApiBalance(organization.fetcher), 740);
  invalidateMuApiBalance(personal.fetcher.balanceScopeKey);
  assert.equal(await fetchMuApiBalance(personal.fetcher), 60);
  assert.equal(await fetchMuApiBalance(organization.fetcher), 740);
  assert.equal(personal.calls(), 2);
  assert.equal(organization.calls(), 1);
});
