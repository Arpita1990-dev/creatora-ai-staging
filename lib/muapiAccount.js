const MUAPI_BASE = "https://api.muapi.ai";

export async function getMuApiBalance(apiKey) {
  const key = apiKey || process.env.MUAPI_API_KEY;
  if (!key) throw new Error("MUAPI_API_KEY is not configured on the server.");
  const response = await fetch(`${MUAPI_BASE}/api/v1/account/balance`, {
    headers: { "Content-Type": "application/json", "x-api-key": key },
    cache: "no-store",
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(data.detail || data.error || `Unable to fetch MuAPI balance (${response.status}).`);
  const balance = Number(data.balance ?? data.credits ?? data.amount_credits ?? 0);
  return Number.isFinite(balance) ? balance : 0;
}
