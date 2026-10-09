import { PrismaClient } from "../generated/postgres-client/index.js";

async function checkConnection(label, url) {
  if (!url) {
    console.error(`${label}: FAIL (not configured)`);
    return false;
  }

  const client = new PrismaClient({
    datasources: { db: { url } },
    log: [],
  });

  try {
    const result = await client.$queryRaw`SELECT 1 AS connected`;
    if (result.length !== 1 || Number(result[0].connected) !== 1) throw new Error("query failed");
    console.log(`${label}: PASS`);
    if (label === "TARGET_DATABASE_CONNECTIVITY") {
      const [tables, enums] = await Promise.all([
        client.$queryRaw`SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
        client.$queryRaw`SELECT COUNT(*)::int AS count FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'`,
      ]);
      const tableCount = Number(tables[0].count);
      const enumCount = Number(enums[0].count);
      const state = tableCount === 0 && enumCount === 0 ? "EMPTY" : "NOT EMPTY";
      console.log(`TARGET_PUBLIC_SCHEMA: ${state} (tables=${tableCount}, enums=${enumCount})`);
    }
    return true;
  } catch {
    console.error(`${label}: FAIL`);
    return false;
  } finally {
    await client.$disconnect();
  }
}

const results = await Promise.all([
  checkConnection("TARGET_DATABASE_CONNECTIVITY", process.env.TARGET_DATABASE_URL),
  checkConnection("TARGET_DIRECT_DATABASE_CONNECTIVITY", process.env.TARGET_DIRECT_URL),
]);

if (results.some((result) => !result)) process.exitCode = 2;