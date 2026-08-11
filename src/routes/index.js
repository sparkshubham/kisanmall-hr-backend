import { Router } from 'express';
import { env } from '../config/env.js';
import adminRoutes from './admin/index.js';
import staffRoutes from './staff/index.js';
import authRoutes from './auth.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'Kisan Mall Staff Management API',
    timestamp: new Date().toISOString(),
    dbHost: env.databaseHost,
    vercel: env.isVercel,
  });
});

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/staff', staffRoutes);

export default router;
