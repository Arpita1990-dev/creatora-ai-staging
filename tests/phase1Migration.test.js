import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readSqliteSnapshot } from "../scripts/phase1-sqlite-snapshot.mjs";
import { requirePhase1Urls } from "../scripts/phase1-models.mjs";

const models = [{ name: "Example", fields: [
  { name: "id", type: "String", kind: "scalar", isId: true, isRequired: true },
  { name: "ciphertext", type: "String", kind: "scalar", isRequired: true },
  { name: "createdAt", type: "DateTime", kind: "scalar", isRequired: true },
  { name: "active", type: "Boolean", kind: "scalar", isRequired: true },
] }];

function fixture(callback) {
  const directory = mkdtempSync(join(tmpdir(), "creatora-phase1-test-"));
  const file = join(directory, "source.db");
  const database = new DatabaseSync(file);
  database.exec('CREATE TABLE "Example" (id TEXT, ciphertext TEXT, createdAt, active INTEGER)');
  database.prepare('INSERT INTO "Example" VALUES (?, ?, ?, ?)').run("original-id", "unchanged-ciphertext", 1760000000000, 1);
  database.close();
  try { callback(file); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("SQLite snapshot preserves IDs and ciphertext and never changes the source", () => fixture((file) => {
  const before = readFileSync(file);
  const expectedChecksum = createHash("sha256").update(before).digest("hex");
  const snapshot = readSqliteSnapshot(`file:${file}`, { models, expectedChecksum });
  assert.equal(snapshot.rowsByModel.Example[0].id, "original-id");
  assert.equal(snapshot.rowsByModel.Example[0].ciphertext, "unchanged-ciphertext");
  assert.equal(snapshot.rowsByModel.Example[0].active, true);
  assert.equal(snapshot.rowsByModel.Example[0].createdAt.getTime(), 1760000000000);
  assert.deepEqual(snapshot.anomalies, []);
  assert.deepEqual(readFileSync(file), before);
}));

test("SQLite snapshot refuses a checksum mismatch", () => fixture((file) => {
  assert.throws(() => readSqliteSnapshot(`file:${file}`, { models, expectedChecksum: "0".repeat(64) }), /checksum mismatch/);
}));

test("SQLite snapshot reports invalid timestamps and booleans without row values", () => fixture((file) => {
  const database = new DatabaseSync(file);
  database.exec("UPDATE Example SET createdAt = 'invalid-date', active = 2");
  database.close();
  const snapshot = readSqliteSnapshot(`file:${file}`, { models });
  assert.deepEqual(snapshot.anomalies, [
    { check: "invalid timestamp Example.createdAt", count: 1 },
    { check: "invalid boolean Example.active", count: 1 },
  ]);
}));

test("SQLite snapshot rejects ambiguous paths and non-SQLite URLs", () => {
  assert.throws(() => readSqliteSnapshot("file:./dev.db"), /absolute SQLite/);
  assert.throws(() => readSqliteSnapshot("postgresql://invalid.example/db"), /absolute SQLite/);
});

test("migration configuration requires separate databases and a verified checksum", () => {
  const environment = { SOURCE_DATABASE_URL: "file:C:/backup.db", TARGET_DATABASE_URL: "postgresql://invalid.example/db", SOURCE_DATABASE_SHA256: "a".repeat(64) };
  assert.equal(requirePhase1Urls(environment).sourceChecksum, environment.SOURCE_DATABASE_SHA256);
  assert.throws(() => requirePhase1Urls({ ...environment, SOURCE_DATABASE_SHA256: undefined }), /verified backup checksum/);
  assert.throws(() => requirePhase1Urls({ ...environment, TARGET_DATABASE_URL: "file:C:/backup.db" }), /PostgreSQL/);
  assert.throws(() => requirePhase1Urls({ ...environment, SOURCE_DATABASE_URL: environment.TARGET_DATABASE_URL }), /SQLite/);
});