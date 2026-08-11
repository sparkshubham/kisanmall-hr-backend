import { Router } from 'express';
import prisma from '../../utils/prisma.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { ok } from '../../utils/response.js';
import { writeAudit } from '../../utils/auditLog.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate, requireRole('SUPER_ADMIN', 'HR_ADMIN'));

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({
      settings: {
        graceMinutes: 10,
        attendanceMethods: ['FACE', 'GPS'],
        requireFace: true,
        requireGps: false,
        sessionHours: 12,
        biometricRetentionDays: 365,
        ...map,
      },
    });
  })
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const entries = Object.entries(req.body || {});
    for (const [key, value] of entries) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
    await writeAudit(req, { action: 'SETTINGS_UPDATED', entity: 'SystemSetting', newData: req.body });
    return ok(res, { updated: entries.length });
  })
);

router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, skip } = parsePagination(req.query);
    const where = q
      ? {
          OR: [
            { action: { contains: q, mode: 'insensitive' } },
            { entity: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);
    res.json(paginated(rows, total, page, pageSize));
  })
);

router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const rows = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    res.json({ rows });
  })
);

export default router;
