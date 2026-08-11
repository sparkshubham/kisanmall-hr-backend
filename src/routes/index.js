import { Router } from 'express';
import { env } from '../config/env.js';
import prisma from '../utils/prisma.js';
import adminRoutes from './admin/index.js';
import staffRoutes from './staff/index.js';
import authRoutes from './auth.js';

const router = Router();

router.get('/health', async (_req, res) => {
  const started = Date.now();
  let dbOk = false;
  let dbMs = null;
  let dbError = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    dbMs = Date.now() - started;
  } catch (err) {
    dbError = err.message;
    dbMs = Date.now() - started;
  }

  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    service: 'Kisan Mall Staff Management API',
    timestamp: new Date().toISOString(),
    dbHost: env.databaseHost,
    dbOk,
    dbMs,
    dbError,
    vercel: env.isVercel,
    region: process.env.VERCEL_REGION || process.env.SUPABASE_REGION || null,
  });
});

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
// Auth also available under /admin/auth for clients that mirror ecommerce backend paths
router.use('/admin/auth', authRoutes);
router.use('/staff', staffRoutes);

export default router;
