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

// Reuse across warm serverless invocations (Vercel) and local hot-reload
globalForPrisma.__hrPrisma = prisma;

export default prisma;
