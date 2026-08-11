import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import '../src/config/env.js';

const MIGRATION = '20260811140000_init';

async function tableExists(prisma, schema, name) {
  const rows = await prisma.$queryRaw`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = ${schema}
      AND table_name = ${name}
    LIMIT 1
  `;
  return Array.isArray(rows) && rows.length > 0;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const hasUsers = await tableExists(prisma, 'hr', 'users');
    const hasHistory = await tableExists(prisma, 'public', '_prisma_migrations');

    if (hasUsers && !hasHistory) {
      console.log('HR tables already exist from db push — marking init migration as applied');
      execSync(`npx prisma migrate resolve --applied ${MIGRATION}`, { stdio: 'inherit' });
    }

    console.log('Running prisma migrate deploy');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('Migrations applied');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
