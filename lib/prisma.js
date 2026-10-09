import { PrismaClient as PostgresPrismaClient } from '../generated/postgres-client/index.js';
import { PrismaClient as SqlitePrismaClient } from '../generated/sqlite-client/index.js';

const globalForPrisma = globalThis;
const databaseUrl = process.env.DATABASE_URL || '';
const PrismaClient = databaseUrl.startsWith('file:')
  ? SqlitePrismaClient
  : PostgresPrismaClient;

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
