export function publicErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  const message = String(error?.message || error || "");

  if (/(?:credits?|balance).*(?:insufficient|not enough)|(?:insufficient|not enough).*(?:credits?|balance)/i.test(message)) {
    return "Generation could not start because MuAPI has insufficient credits. Please top up MuAPI, then try again.";
  }
  if (/prisma|datasource|database|sqlite|postgres|findUnique|knownrequesterror/i.test(message)) {
    return "The service is temporarily unavailable. Please try again in a moment.";
  }
  if (/api[_ -]?key|unauthorized|invalid credentials/i.test(message)) {
    return "The generation provider credentials are invalid or expired. Please update the provider key and try again.";
  }

  return message || fallback;
}

