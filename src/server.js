import app from './app.js';
import { env } from './config/env.js';
import prisma from './utils/prisma.js';

async function start() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('PostgreSQL connected (Prisma)');
  } catch (err) {
    console.error('PostgreSQL connection failed:', err.message);
    console.error('Check DATABASE_URL / POSTGRES_URL env vars');
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`Kisan Mall Staff Management API on http://localhost:${env.port}`);
    console.log(`Health: http://localhost:${env.port}/api/health`);
    console.log(`Admin:  http://localhost:${env.port}/api/admin`);
    console.log(`Staff:  http://localhost:${env.port}/api/staff`);
  });
}

if (!process.env.VERCEL) {
  start();
}

export default app;
