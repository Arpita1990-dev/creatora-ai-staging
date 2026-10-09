const SENSITIVE_VALUE = /(access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization[_-]?code|id[_-]?token)\s*[=:]\s*([^\s&,;]+)/gi;
const BEARER_VALUE = /bearer\s+[a-z0-9._~+\/-]+=*/gi;
const SENSITIVE_QUERY = /([?&](?:access_token|refresh_token|client_secret|code|id_token)=)[^&#\s]+/gi;

// Provider failures are useful to users, but their payloads are not under our
// control. Keep a short, single-line explanation while redacting credential
// shapes before the text is logged, stored, redirected, or returned to a UI.
export function safeSocialError(error, fallback = "Social publishing failed.") {
  const message = String(error?.message || fallback)
    .replace(SENSITIVE_QUERY, "$1[redacted]")
    .replace(SENSITIVE_VALUE, "$1=[redacted]")
    .replace(BEARER_VALUE, "Bearer [redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 300);
  return message || fallback;
}
