export class ProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ProviderError";
    this.provider = options.provider || null;
    this.code = options.code || null;
    this.httpStatus = options.httpStatus || null;
    this.retryable = Boolean(options.retryable);
  }
}

export function isRetryableProviderError(error) {
  if (error instanceof ProviderError) return error.retryable;
  const message = String(error?.message || error || "");
  return /timeout|timed out|rate.?limit|temporar|unavailable|overload|internal server|ECONNRESET|ECONNREFUSED|fetch failed/i.test(message);
}

