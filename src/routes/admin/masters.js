import { Router } from 'express';
import prisma from '../../utils/prisma.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ADMIN_ROLES, HR_ROLES } from '../../utils/helpers.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { fail, ok } from '../../utils/response.js';
import { writeAudit } from '../../utils/auditLog.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate, requireRole(...ADMIN_ROLES));

function crud(model, label, extra = {}) {
  const r = Router();

  r.get(
    '/',
    asyncHandler(async (req, res) => {
      const { page, pageSize, q, skip } = parsePagination(req.query, { defaultSize: 100, maxSize: 500 });
      const where = {
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
        ...(req.query.active === '1' ? { isActive: true } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma[model].count({ where }),
        prisma[model].findMany({
          where,
          orderBy: { name: 'asc' },
          skip,
          take: pageSize,
          include: extra.include,
        }),
      ]);
      res.json(paginated(rows, total, page, pageSize));
    })
  );

  r.post(
    '/',
    requireRole(...HR_ROLES),
    asyncHandler(async (req, res) => {
      const { name } = req.body;
      if (!name) return fail(res, `${label} name is required`, 400);
      const row = await prisma[model].create({ data: extra.mapCreate ? extra.mapCreate(req.body) : req.body });
      await writeAudit(req, { action: `${label.toUpperCase()}_CREATED`, entity: label, entityId: row.id, newData: row });
      return ok(res, row, 201);
    })
  );

  r.patch(
    '/:id',
    requireRole(...HR_ROLES),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const row = await prisma[model].update({
        where: { id },
        data: extra.mapUpdate ? extra.mapUpdate(req.body) : req.body,
      });
      await writeAudit(req, { action: `${label.toUpperCase()}_UPDATED`, entity: label, entityId: id, newData: row });
      return ok(res, row);
    })
  );

  r.delete(
    '/:id',
    requireRole(...HR_ROLES),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const hard = req.query.hard === '1' || req.query.hard === 'true';
      if (hard) {
        await prisma[model].delete({ where: { id } });
        await writeAudit(req, { action: `${label.toUpperCase()}_DELETED`, entity: label, entityId: id });
        return ok(res, { id, deleted: true });
      }
      await prisma[model].update({ where: { id }, data: { isActive: false } });
      await writeAudit(req, { action: `${label.toUpperCase()}_DEACTIVATED`, entity: label, entityId: id });
      return ok(res, { id, deactivated: true });
    })
  );

  return r;
}

router.use(
  '/departments',
  crud('department', 'Department', {
    mapCreate: ({ name, code }) => ({ name: name.trim(), code: code || null }),
    mapUpdate: ({ name, code, isActive }) => ({
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(code !== undefined ? { code } : {}),
      ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
    }),
  })
);

router.use(
  '/designations',
  crud('designation', 'Designation', {
    mapCreate: ({ name }) => ({ name: name.trim() }),
    mapUpdate: ({ name, isActive }) => ({
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
    }),
  })
);

router.use(
  '/locations',
  crud('location', 'Location', {
    mapCreate: ({ name, code, address, latitude, longitude, radiusM }) => ({
      name: name.trim(),
      code: code || null,
      address: address || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      radiusM: radiusM ?? 150,
    }),
    mapUpdate: (body) => {
      const data = {};
      ['name', 'code', 'address', 'latitude', 'longitude', 'radiusM', 'isActive'].forEach((k) => {
        if (body[k] !== undefined) data[k] = body[k];
      });
      return data;
    },
  })
);

router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const [departments, designations, locations, leaveTypes] = await Promise.all([
      prisma.department.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      prisma.designation.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    ]);
    res.json({ departments, designations, locations, leaveTypes });
  })
);

export default router;
