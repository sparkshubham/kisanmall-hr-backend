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

const prisma = globalForPrisma.__hrPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__hrPrisma = prisma;
}

export default prisma;
