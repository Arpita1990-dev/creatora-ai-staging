import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Prisma } from "../generated/sqlite-client/index.js";

export function readSqliteSnapshot(sourceUrl, { expectedChecksum, models = Prisma.dmmf.datamodel.models } = {}) {
  const file = sourceUrl?.startsWith("file:") ? sourceUrl.slice(5) : "";
  if (!isAbsolute(file) || file.includes("?")) {
    throw new Error("Source must be an absolute SQLite file URL without query parameters.");
  }
  if (!existsSync(file)) throw new Error("Source SQLite file does not exist.");
  if (["-wal", "-shm", "-journal"].some((suffix) => existsSync(file + suffix))) {
    throw new Error("Use a verified, offline SQLite backup without journal sidecars.");
  }
  const checksum = () => createHash("sha256").update(readFileSync(file)).digest("hex");
  const before = checksum();
  if (expectedChecksum && before !== expectedChecksum.toLowerCase()) {
    throw new Error("Source backup checksum mismatch.");
  }
  const database = new DatabaseSync(file, { readOnly: true });
  const rowsByModel = {};
  const anomalyCounts = new Map();
  const add = (label) => anomalyCounts.set(label, (anomalyCounts.get(label) || 0) + 1);
  const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
  const enums = new Map(Prisma.dmmf.datamodel.enums.map((entry) => [entry.name, new Set(entry.values.map((value) => value.name))]));
  try {
    database.exec("BEGIN");
    const integrity = database.prepare("PRAGMA integrity_check").all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== "ok") {
      throw new Error("Source SQLite integrity check failed.");
    }
    for (const model of models) {
      const fields = model.fields.filter((field) => field.kind !== "object");
      const rows = database.prepare(`SELECT * FROM ${quote(model.dbName || model.name)}`).all();
      rowsByModel[model.name] = rows.map((row) => Object.fromEntries(fields.map((field) => {
        const value = row[field.dbName || field.name];
        if (value == null) {
          if (field.isRequired) add(`missing required value ${model.name}.${field.name}`);
          return [field.name, value ?? null];
        }
        if (field.isId && (typeof value !== "string" || !value.trim())) add(`missing required value ${model.name}.${field.name}`);
        if (field.kind === "enum" && !enums.get(field.type)?.has(value)) add(`invalid enum ${model.name}.${field.name}`);
        if (field.type === "DateTime") {
          const timestamp = typeof value === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
            ? `${value.replace(" ", "T")}Z` : value;
          const date = new Date(timestamp);
          if (Number.isNaN(date.getTime())) add(`invalid timestamp ${model.name}.${field.name}`);
          return [field.name, date];
        }
        if (field.type === "Boolean") {
          if (value !== 0 && value !== 1) add(`invalid boolean ${model.name}.${field.name}`);
          return [field.name, Boolean(value)];
        }
        if (field.type === "Int" && (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)) {
          add(`invalid integer ${model.name}.${field.name}`);
        }
        return [field.name, value];
      })));
    }
    const idSets = new Map(Object.entries(rowsByModel).map(([name, rows]) => [name, new Set(rows.map((row) => row.id))]));
    for (const model of models) {
      for (const relation of model.fields.filter((field) => field.kind === "object" && field.relationFromFields?.length)) {
        if (relation.relationToFields?.length !== 1 || relation.relationToFields[0] !== "id") {
          throw new Error("Unsupported composite reference; review migration integrity checks.");
        }
        for (const field of relation.relationFromFields) {
          for (const row of rowsByModel[model.name]) {
            if (row[field] != null && !idSets.get(relation.type)?.has(row[field])) {
              add(`foreign key orphan ${model.name}.${field}`);
            }
          }
        }
      }
    }
    if (before !== checksum()) throw new Error("Source changed during snapshot; use an offline backup.");
    return { rowsByModel, checksum: before, anomalies: [...anomalyCounts].map(([check, count]) => ({ check, count })) };
  } finally {
    database.close();
  }
}