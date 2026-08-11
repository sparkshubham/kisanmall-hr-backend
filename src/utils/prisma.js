import { PrismaClient } from '@prisma/client';
import '../config/env.js';
import { resolveDatabaseUrl } from '../config/dbUrl.js';

const globalForPrisma = globalThis;

function createClient() {
  return new PrismaClient({
    datasources: {
      db: { url: resolveDatabaseUrl() },
    },
    log: process.env.PRISMA_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

// Always cache on globalThis so warm Vercel lambdas reuse the connection (same as local).
const prisma = globalForPrisma.__hrPrisma ?? createClient();
globalForPrisma.__hrPrisma = prisma;

export default prisma;
