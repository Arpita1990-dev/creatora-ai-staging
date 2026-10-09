const GRAPH_URL = "https://graph.facebook.com";

export const META_DISCOVERY_PERMISSIONS = Object.freeze([
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "business_management",
  "pages_read_metadata",
]);

const REQUIRED_META_DISCOVERY_PERMISSIONS = new Set([
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
]);

function graphBase() {
  return String(process.env.META_GRAPH_URL || GRAPH_URL).replace(/\/$/, "");
}

function graphError(result, response) {
  const source = result?.error || {};
  const error = new Error(source.message || `Meta Graph API request failed with HTTP ${response.status}.`);
  error.code = source.code == null ? null : String(source.code);
  error.subcode = source.error_subcode == null ? null : String(source.error_subcode);
  error.type = source.type || null;
  return error;
}

async function graphJson(path, token, fields) {
  const url = new URL(`${graphBase()}/${String(path).replace(/^\//, "")}`);
  if (fields) url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { cache: "no-store" });
  let result;
  try { result = await response.json(); } catch { result = {}; }
  if (!response.ok || result.error) throw graphError(result, response);
  return result;
}

function diagnosticStatus(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  if (["10", "200"].includes(code) || /permission|scope|not authorized/i.test(message)) return "MISSING_PERMISSION";
  if (code === "100" || /unsupported get request|does not exist|cannot be loaded|not accessible/i.test(message)) return "ASSET_NOT_ACCESSIBLE";
  return "META_API_ERROR";
}

function safeError(error) {
  return {
    code: error?.code || null,
    subcode: error?.subcode || null,
    type: error?.type || null,
    message: error?.message || "Meta Graph API request failed.",
  };
}

function pageDiagnostic(page, values = {}) {
  const error = values.error ? safeError(values.error) : null;
  return {
    pageId: String(page.id),
    pageName: page.name || "",
    instagramReturned: Boolean(values.account),
    instagramAccountId: values.account?.id ? String(values.account.id) : null,
    instagramUsername: values.account?.username || null,
    status: values.status || (values.account ? "DISCOVERED" : "NO_LINKED_INSTAGRAM_ACCOUNT"),
    error: error,
    metaErrorCode: error?.code || null,
    metaErrorMessage: error?.message || null,
    tokenPermissions: values.permissions || [],
  };
}

function logPageDiagnostic(diagnostic) {
  // Deliberately log only identifiers, names and Meta's sanitized error details.
  console.info("Meta Instagram discovery", diagnostic);
}

async function inspectPermissions(accessToken) {
  try {
    const result = await graphJson("me/permissions", accessToken);
    const entries = Array.isArray(result.data) ? result.data : [];
    const granted = entries.filter((item) => item.status === "granted").map((item) => item.permission);
    const declined = entries.filter((item) => item.status && item.status !== "granted").map((item) => item.permission);
    const missing = META_DISCOVERY_PERMISSIONS.filter((permission) => !granted.includes(permission));
    const permissions = { granted, declined, missing, error: null };
    console.info("Meta token permissions", permissions);
    return permissions;
  } catch (error) {
    const permissions = { granted: [], declined: [], missing: [], error: safeError(error) };
    console.info("Meta token permissions unavailable", permissions);
    return permissions;
  }
}

function overallStatus(accounts, diagnostics, permissions) {
  if (accounts.length) return "DISCOVERED";
  if (permissions.missing.some((permission) => REQUIRED_META_DISCOVERY_PERMISSIONS.has(permission))) return "MISSING_PERMISSION";
  const statuses = diagnostics.map((item) => item.status);
  if (statuses.includes("MISSING_PERMISSION")) return "MISSING_PERMISSION";
  if (statuses.includes("ASSET_NOT_ACCESSIBLE")) return "ASSET_NOT_ACCESSIBLE";
  if (statuses.includes("META_API_ERROR")) return "META_API_ERROR";
  return "NO_LINKED_INSTAGRAM_ACCOUNT";
}

export async function discoverMetaAccounts(accessToken) {
  const permissions = await inspectPermissions(accessToken);
  
  let pagesResult;
  try {
    pagesResult = await graphJson("me/accounts", accessToken, "id,name,access_token");
  } catch (error) {
    return {
      pages: [],
      instagramAccounts: [],
      discovery: {
        status: diagnosticStatus(error),
        checkedAt: new Date().toISOString(),
        permissions,
        error: safeError(error),
      },
    };
  }

  const rawPages = Array.isArray(pagesResult.data) ? pagesResult.data : [];
  const pages = rawPages.map(({ id, name }) => ({ id: String(id), name: name || "" }));
  const instagramAccounts = [];
  const diagnostics = [];

  for (const page of rawPages) {
    try {
      // Requirement 2: Query for the Instagram professional/business account associated with each Page.
      // We use the User Access Token (accessToken) as it typically has broader visibility 
      // across the Business Portfolio assets than a scoped Page Access Token in Business Login.
      const fields = "instagram_business_account{id,username,name},connected_instagram_account{id,username,name}";
      const result = await graphJson(page.id, accessToken, fields);
      
      const account = result.instagram_business_account || result.connected_instagram_account || null;
      const normalized = account ? {
        id: String(account.id),
        username: account.username || "",
        name: account.name || "",
        pageId: String(page.id),
        pageName: page.name || "",
      } : null;

      if (normalized && !instagramAccounts.some((item) => item.id === normalized.id)) {
        instagramAccounts.push(normalized);
      }
      
      const diagnostic = pageDiagnostic(page, { 
        account: normalized, 
        permissions: permissions.granted 
      });
      diagnostics.push(diagnostic);
      logPageDiagnostic(diagnostic);
    } catch (error) {
      const diagnostic = pageDiagnostic(page, { 
        status: diagnosticStatus(error), 
        error, 
        permissions: permissions.granted 
      });
      diagnostics.push(diagnostic);
      logPageDiagnostic(diagnostic);
    }
  }

  return {
    pages,
    instagramAccounts,
    discovery: {
      status: overallStatus(instagramAccounts, diagnostics, permissions),
      checkedAt: new Date().toISOString(),
      permissions,
      pages: diagnostics,
    },
  };
}
