import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient as TargetClient } from "../generated/postgres-client/index.js";
import { PHASE1_MODELS, requirePhase1Urls } from "./phase1-models.mjs";
import { readSqliteSnapshot } from "./phase1-sqlite-snapshot.mjs";

async function counts(client) {
  const result = {};
  for (const [name, delegate] of PHASE1_MODELS) {
    result[name] = await client[delegate].count();
  }
  return result;
}

async function migrate() {
  const { sourceUrl, targetUrl, sourceChecksum } = requirePhase1Urls();
  const snapshot = readSqliteSnapshot(sourceUrl, { expectedChecksum: sourceChecksum });
  const audit = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL("./audit-sqlite-integrity.mjs", import.meta.url))], {
    env: { ...process.env, SOURCE_DATABASE_URL: sourceUrl, SOURCE_DATABASE_SHA256: sourceChecksum },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  }));
  if (audit.migrationBlocking || snapshot.anomalies.length) throw new Error("Source integrity validation failed.");
  const sourceCounts = Object.fromEntries(PHASE1_MODELS.map(([name]) => [name, snapshot.rowsByModel[name].length]));
  const target = new TargetClient({ datasources: { db: { url: targetUrl } } });
  try {
  const targetCounts = await counts(target);
  const occupied = Object.entries(targetCounts).filter(([, count]) => count !== 0);
  if (occupied.length) {
    throw new Error(
      `Refusing to migrate into a non-empty target (${occupied.map(([name, count]) => `${name}=${count}`).join(", ")}).`,
    );
  }

  await target.$transaction(async (tx) => {
    for (const [name, delegate] of PHASE1_MODELS) {
      const rows = snapshot.rowsByModel[name];
      if (rows.length) await tx[delegate].createMany({ data: rows });
      console.log(`${name}: copied ${rows.length}`);
    }
  }, { maxWait: 30_000, timeout: 300_000 });

  const migratedCounts = await counts(target);
  const mismatches = PHASE1_MODELS.filter(([name]) => sourceCounts[name] !== migratedCounts[name]);
  if (mismatches.length) {
    throw new Error(`Post-copy count mismatch: ${mismatches.map(([name]) => name).join(", ")}`);
  }
  console.log("Atomic copy complete; all model counts match. Run db:validate:phase1 before cutover.");
  } finally {
    await target.$disconnect();
  }
}

migrate().catch(() => {
  console.error("Phase 1 migration: FAIL. Do not switch DATABASE_URL. Review backup, integrity audit, target connection/schema, and target emptiness; raw database errors are withheld to protect secrets.");
  process.exitCode = 2;
});
