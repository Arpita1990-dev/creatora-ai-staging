// The dashboard fires "creatora:workspace-updated" very frequently (every
// asset/project change, including on every status-poll tick), so multiple
// mounted widgets must share one throttled/deduped fetch instead of each
// hitting MuAPI's real balance endpoint on every event.
const balanceByScope = new Map();

const DEFAULT_MIN_INTERVAL_MS = 15000;

export function getBalanceScopeKey(authFetch) {
  return String(authFetch?.balanceScopeKey || "default");
}

export async function fetchMuApiBalance(authFetch, options = {}) {
  const { force = false, minIntervalMs = DEFAULT_MIN_INTERVAL_MS } = options;
  const scopeKey = options.scopeKey || getBalanceScopeKey(authFetch);
  let scope = balanceByScope.get(scopeKey);
  if (!scope) {
    scope = { lastFetchedAt: 0, lastBalance: null, inFlight: null };
    balanceByScope.set(scopeKey, scope);
  }
  const now = Date.now();
  // A forced refresh (e.g. right after a generation completed) must bypass the
  // throttle, otherwise the header keeps showing the pre-generation balance for
  // up to 15s after credits were actually spent.
  if (!force && scope.lastBalance != null && now - scope.lastFetchedAt < minIntervalMs) return scope.lastBalance;
  if (scope.inFlight) return scope.inFlight;
  const request = authFetch("/api/muapi/balance", { cache: "no-store" })
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to fetch balance.");
      // `credits` is the CreateoraAI AI-Credit balance (USD x 100). The API can
      // fall back to a cached USD figure when MuAPI is unreachable, in which case
      // `credits` is absent and only `balance` is present — normalise here so
      // every caller renders the same unit instead of silently mixing USD and
      // credits.
      const balance = result.credits ?? null;
      if (balanceByScope.get(scopeKey) === scope) {
        scope.lastBalance = balance;
        scope.lastFetchedAt = Date.now();
      }
      return balance;
    })
    .finally(() => {
      if (scope.inFlight === request) scope.inFlight = null;
    });
  scope.inFlight = request;
  return request;
}

// Lets a component that already rendered "Not connected" recover once the user
// saves a MuAPI key, instead of staying stale until the next full page load.
export function invalidateMuApiBalance(scopeKey) {
  if (scopeKey) balanceByScope.delete(scopeKey);
  else balanceByScope.clear();
}

// Notifies every mounted balance widget (header pill, sidebar card, billing
// page, settings) so they all update from one request after a generation.
export function broadcastMuApiBalance(balance, scopeKey = "default") {
  if (typeof window === "undefined") return;
  let scope = balanceByScope.get(scopeKey);
  if (!scope) {
    scope = { lastFetchedAt: 0, lastBalance: null, inFlight: null };
    balanceByScope.set(scopeKey, scope);
  }
  if (balance != null) {
    scope.lastBalance = balance;
    scope.lastFetchedAt = Date.now();
  }
  window.dispatchEvent(new CustomEvent("creatora:muapi-balance", { detail: { balance, scopeKey } }));
}
