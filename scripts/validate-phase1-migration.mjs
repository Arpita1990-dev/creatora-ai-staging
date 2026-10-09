import { createHash } from "node:crypto";
import { PHASE1_MODELS, requirePhase1Urls } from "./phase1-models.mjs";

const secretEnvironmentNames = /(?:DATABASE_URL|TOKEN|SECRET|API.?KEY|PASSWORD|OAUTH|CREDENTIAL)/i;

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(rows) {
  const ordered = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return createHash("sha256").update(JSON.stringify(canonical(ordered))).digest("hex");
}

function safeMessage(error) {
  let message = String(error?.message || "Validation failed");
  for (const [name, value] of Object.entries(process.env)) {
    if (secretEnvironmentNames.test(name) && value && value.length >= 4) {
      message = message.replaceAll(value, "[redacted]");
    }
  }
  return message
    .replace(/(?:postgres(?:ql)?:|file:)[^\s'"`)}\]]+/gi, "[redacted-url]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|re)_[A-Za-z0-9_-]{8,}\b/gi, "[redacted-key]")
    .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9$]{20,}/g, "[redacted-hash]")
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[redacted-value]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted-value]")
    .slice(0, 300);
}

function reportFailure(stage, error, model) {
  const errorName = String(error?.name || "Error").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80) || "Error";
  const code = /^[A-Z0-9_-]{1,32}$/.test(String(error?.code || "")) ? `; code=${error.code}` : "";
  const modelLabel = model ? `; model=${model}` : "";
  const categoryLabel = error?.category ? `; category=${error.category}` : "";
  console.error(`${stage}: FAIL${modelLabel}${categoryLabel}; error=${errorName}${code}; message=${safeMessage(error)}`);
}

async function stage(name, action, model) {
  try {
    const result = await action();
    console.log(`${name}: PASS`);
    return { ok: true, result };
  } catch (error) {
    reportFailure(name, error, model || error?.model);
    return { ok: false };
  }
}

function compareIds(sourceRows, targetRows) {
  const sourceIds = new Set(sourceRows.map((row) => row.id));
  const targetIds = new Set(targetRows.map((row) => row.id));
  let onlySource = 0;
  let onlyTarget = 0;
  for (const id of sourceIds) if (!targetIds.has(id)) onlySource += 1;
  for (const id of targetIds) if (!sourceIds.has(id)) onlyTarget += 1;
  return { equal: onlySource === 0 && onlyTarget === 0, onlySource, onlyTarget };
}

function differingRecordCount(sourceRows, targetRows) {
  const targetById = new Map(targetRows.map((row) => [row.id, row]));
  let differences = 0;
  for (const row of sourceRows) {
    const targetRow = targetById.get(row.id);
    if (!targetRow || digest([row]) !== digest([targetRow])) differences += 1;
  }
  return differences;
}

function compareSelectedFields(sourceRows, targetRows, fields) {
  const select = (rows) => rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
  return digest(select(sourceRows)) === digest(select(targetRows));
}

async function validate() {
  const configuration = await stage("VALIDATOR_CONFIGURATION", () => {
    const urls = requirePhase1Urls();
    if (!process.env.TARGET_DIRECT_URL) throw new Error("TARGET_DIRECT_URL is required.");
    if (!process.env.TOKEN_ENCRYPTION_KEY) throw new Error("TOKEN_ENCRYPTION_KEY is required.");
    return urls;
  });
  if (!configuration.ok) return false;

  const sqliteClient = await stage("SQLITE_CLIENT", async () => {
    const { Prisma } = await import("../generated/sqlite-client/index.js");
    if (!Prisma?.dmmf?.datamodel?.models?.length) throw new Error("Generated SQLite Prisma metadata is unavailable.");
    return Prisma;
  });
  if (!sqliteClient.ok) return false;

  const snapshotResult = await stage("STAGE_A_SQLITE_CONNECTIVITY", async () => {
    const { readSqliteSnapshot } = await import("./phase1-sqlite-snapshot.mjs");
    const snapshot = readSqliteSnapshot(configuration.result.sourceUrl, {
      expectedChecksum: configuration.result.sourceChecksum,
      models: sqliteClient.result.dmmf.datamodel.models,
    });
    if (snapshot.anomalies.length) {
      const summary = snapshot.anomalies.map(({ check, count }) => `${check}=${count}`).join(", ");
      throw new Error(`Source integrity/anomaly checks failed: ${summary}`);
    }
    return snapshot;
  });
  if (!snapshotResult.ok) return false;
  const snapshot = snapshotResult.result;

  const targetModule = await stage("POSTGRES_CLIENT", () => import("../generated/postgres-client/index.js"));
  if (!targetModule.ok) return false;
  if (typeof targetModule.result.PrismaClient !== "function") {
    reportFailure("POSTGRES_CLIENT", new Error("Generated PostgreSQL Prisma client is unavailable."));
    return false;
  }
  const TargetClient = targetModule.result.PrismaClient;
  const target = new TargetClient({ datasources: { db: { url: configuration.result.targetUrl } }, log: [] });
  const direct = new TargetClient({ datasources: { db: { url: process.env.TARGET_DIRECT_URL } }, log: [] });
  let validationPassed = false;
  try {
    const targetConnectivity = await stage("STAGE_B_POSTGRES_CONNECTIVITY", async () => {
      const result = await target.$queryRaw`SELECT 1 AS connected`;
      if (Number(result[0]?.connected) !== 1) throw new Error("PostgreSQL connectivity query returned no result.");
      return true;
    });
    if (!targetConnectivity.ok) return false;
    const directConnectivity = await stage("DIRECT_POSTGRES_CONNECTIVITY", async () => {
      const result = await direct.$queryRaw`SELECT 1 AS connected`;
      if (Number(result[0]?.connected) !== 1) throw new Error("Direct PostgreSQL connectivity query returned no result.");
      return true;
    });
    if (!directConnectivity.ok) return false;

    const sourceCounts = Object.fromEntries(PHASE1_MODELS.map(([name]) => [name, snapshot.rowsByModel[name].length]));
    if (PHASE1_MODELS.length !== 32 || Object.keys(sourceCounts).length !== 32) {
      reportFailure("STAGE_C_SOURCE_ROW_COUNTS", new Error("Expected exactly 32 source models."));
      return false;
    }
    console.log("STAGE_C_SOURCE_ROW_COUNTS: PASS (32 models)");

    const targetRowsResult = await stage("STAGE_D_TARGET_ROW_COUNTS", async () => {
      const rowsByModel = {};
      for (const [name, delegate] of PHASE1_MODELS) {
        try {
          rowsByModel[name] = await target[delegate].findMany();
        } catch (error) {
          error.model = name;
          throw error;
        }
      }
      return rowsByModel;
    });
    if (!targetRowsResult.ok) return false;
    const targetRowsByModel = targetRowsResult.result;

    const countParity = await stage("STAGE_E_ROW_COUNT_PARITY", () => {
      for (const [name] of PHASE1_MODELS) {
        const sqliteCount = sourceCounts[name];
        const postgresCount = targetRowsByModel[name].length;
        if (sqliteCount !== postgresCount) {
          const ids = compareIds(snapshot.rowsByModel[name], targetRowsByModel[name]);
          console.error(`DATA_DIVERGENCE: model=${name}; sqlite_count=${sqliteCount}; postgres_count=${postgresCount}; difference_count=${Math.abs(sqliteCount - postgresCount)}; ids_differ=${ids.equal ? "NO" : "YES"}`);
          const error = new Error("Row counts differ.");
          error.model = name;
          throw error;
        }
      }
      return true;
    });
    if (!countParity.ok) return false;

    const idParity = await stage("STAGE_F_PRIMARY_ID_PARITY", () => {
      for (const [name] of PHASE1_MODELS) {
        const ids = compareIds(snapshot.rowsByModel[name], targetRowsByModel[name]);
        if (!ids.equal) {
          console.error(`DATA_DIVERGENCE: model=${name}; sqlite_count=${sourceCounts[name]}; postgres_count=${targetRowsByModel[name].length}; difference_count=${ids.onlySource + ids.onlyTarget}; ids_differ=YES`);
          const error = new Error("Primary ID sets differ.");
          error.model = name;
          throw error;
        }
      }
      return true;
    });
    if (!idParity.ok) return false;

    const recordParity = await stage("STAGE_G_LOGICAL_HASH_PARITY", () => {
      for (const [name] of PHASE1_MODELS) {
        if (digest(snapshot.rowsByModel[name]) !== digest(targetRowsByModel[name])) {
          const differenceCount = differingRecordCount(snapshot.rowsByModel[name], targetRowsByModel[name]);
          console.error(`DATA_DIVERGENCE: model=${name}; sqlite_count=${sourceCounts[name]}; postgres_count=${targetRowsByModel[name].length}; difference_count=${differenceCount}; ids_differ=NO`);
          const error = new Error("Logical record hashes differ.");
          error.model = name;
          throw error;
        }
      }
      return true;
    });
    if (!recordParity.ok) return false;

    const passwordParity = await stage("STAGE_H_PASSWORD_HASH_PRESERVATION", () => {
      if (!compareSelectedFields(snapshot.rowsByModel.User, targetRowsByModel.User, ["id", "passwordHash"])) {
        const error = new Error("Password-hash preservation differs.");
        error.model = "User";
        throw error;
      }
      return true;
    });
    if (!passwordParity.ok) return false;

    const razorpayParity = await stage("STAGE_I_RAZORPAY_IDENTIFIER_PRESERVATION", () => {
      if (!compareSelectedFields(snapshot.rowsByModel.Plan, targetRowsByModel.Plan, ["id", "razorpayPlanId"])) {
        const error = new Error("Razorpay plan identifiers differ.");
        error.model = "Plan";
        throw error;
      }
      if (!compareSelectedFields(snapshot.rowsByModel.Subscription, targetRowsByModel.Subscription, ["id", "provider", "providerCustomerId", "providerSubscriptionId"])) {
        const error = new Error("Subscription/provider identifiers differ.");
        error.model = "Subscription";
        throw error;
      }
      return true;
    });
    if (!razorpayParity.ok) return false;

    const credentialResult = await stage("STAGE_J_ENCRYPTED_CREDENTIAL_DECRYPTABILITY", async () => {
      const { decryptToken } = await import("../lib/tokenEncryption.js");
      const categories = [
        ["provider_credentials", target.providerCredential, "secretEncrypted"],
        ["integration_access_tokens", target.integrationConnection, "encryptedAccessToken"],
        ["integration_refresh_tokens", target.integrationConnection, "encryptedRefreshToken"],
        ["social_access_tokens", target.socialConnection, "accessTokenEncrypted"],
        ["social_refresh_tokens", target.socialConnection, "refreshTokenEncrypted"],
      ];
      for (const [category, delegate, field] of categories) {
        let rows;
        try {
          rows = await delegate.findMany({ select: { [field]: true } });
        } catch (error) {
          error.category = category;
          throw error;
        }
        const values = rows.map((row) => row[field]).filter(Boolean);
        for (const value of values) {
          try {
            decryptToken(value);
          } catch {
            const error = new Error(`${category} decryptability failed (${values.length} values).`);
            error.category = category;
            throw error;
          }
        }
        console.log(`CREDENTIAL_CATEGORY ${category}: ${values.length} values; PASS`);
      }
      return true;
    });
    if (!credentialResult.ok) return false;
    console.log("PHASE_1_READ_ONLY_REVALIDATION: PASS");
    validationPassed = true;
  } finally {
    await Promise.all([target.$disconnect(), direct.$disconnect()]);
  }
  return validationPassed;
}

validate().then((passed) => {
  if (!passed) process.exitCode = 2;
}).catch((error) => {
  reportFailure("VALIDATOR_UNHANDLED", error, error?.model);
  process.exitCode = 2;
});
