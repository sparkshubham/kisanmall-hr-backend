import { Router } from 'express';
import prisma from '../../utils/prisma.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ADMIN_ROLES, HR_ROLES, parseDateOnly } from '../../utils/helpers.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { fail, ok } from '../../utils/response.js';
import { writeAudit, notify } from '../../utils/auditLog.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate, requireRole(...ADMIN_ROLES));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, skip } = parsePagination(req.query, { defaultSize: 50, maxSize: 200 });
    const where = q ? { name: { contains: q, mode: 'insensitive' } } : {};
    const [total, rows] = await Promise.all([
      prisma.shift.count({ where }),
      prisma.shift.findMany({
        where,
        orderBy: { startTime: 'asc' },
        skip,
        take: pageSize,
        include: { _count: { select: { employees: true } } },
      }),
    ]);
    res.json(paginated(rows, total, page, pageSize));
  })
);

router.post(
  '/',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const { name, startTime, endTime } = req.body;
    if (!name || !startTime || !endTime) return fail(res, 'Name, start and end time are required', 400);
    const row = await prisma.shift.create({
      data: {
        name: name.trim(),
        code: req.body.code || null,
        startTime,
        endTime,
        graceMinutes: Number(req.body.graceMinutes ?? 10),
        breakMinutes: Number(req.body.breakMinutes ?? 60),
        overtimeAfter: Number(req.body.overtimeAfter ?? 0),
        workingDays: req.body.workingDays || [1, 2, 3, 4, 5, 6],
      },
    });
    await writeAudit(req, { action: 'SHIFT_CREATED', entity: 'Shift', entityId: row.id, newData: row });
    return ok(res, row, 201);
  })
);

router.patch(
  '/:id',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = {};
    [
      'name',
      'code',
      'startTime',
      'endTime',
      'graceMinutes',
      'breakMinutes',
      'overtimeAfter',
      'workingDays',
      'isActive',
    ].forEach((k) => {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    });
    const row = await prisma.shift.update({ where: { id }, data });
    await writeAudit(req, { action: 'SHIFT_UPDATED', entity: 'Shift', entityId: id, newData: data });
    return ok(res, row);
  })
);

router.delete(
  '/:id',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.shift.update({ where: { id }, data: { isActive: false } });
    await writeAudit(req, { action: 'SHIFT_DEACTIVATED', entity: 'Shift', entityId: id });
    return ok(res, { id, deactivated: true });
  })
);

router.post(
  '/assign',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const { employeeId, shiftId } = req.body;
    if (!employeeId) return fail(res, 'employeeId is required', 400);
    const employee = await prisma.employee.update({
      where: { id: Number(employeeId) },
      data: { shiftId: shiftId ? Number(shiftId) : null },
      include: { user: true, shift: true },
    });
    await notify(employee.userId, {
      title: 'Shift assigned',
      body: employee.shift ? `You are assigned to ${employee.shift.name}` : 'Your default shift was cleared',
      type: 'SHIFT_ASSIGNED',
      actorId: req.user.id,
    });
    await writeAudit(req, {
      action: 'SHIFT_ASSIGNED',
      entity: 'Employee',
      entityId: employee.id,
      newData: { shiftId },
    });
    return ok(res, employee);
  })
);

router.get(
  '/roster',
  asyncHandler(async (req, res) => {
    const from = parseDateOnly(req.query.from);
    const to = parseDateOnly(req.query.to);
    if (!from || !to) return fail(res, 'from and to dates are required', 400);

    const employees = await prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      include: { shift: true, department: true },
      orderBy: { firstName: 'asc' },
    });
    const rosters = await prisma.roster.findMany({
      where: { date: { gte: from, lte: to } },
      include: { shift: true },
    });

    res.json({ employees, rosters, from: req.query.from, to: req.query.to });
  })
);

router.post(
  '/roster',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
    const saved = [];
    for (const item of items) {
      const date = parseDateOnly(item.date);
      const row = await prisma.roster.upsert({
        where: { employeeId_date: { employeeId: Number(item.employeeId), date } },
        update: {
          shiftId: item.isWeekOff ? null : item.shiftId ? Number(item.shiftId) : null,
          isWeekOff: Boolean(item.isWeekOff),
          notes: item.notes || null,
        },
        create: {
          employeeId: Number(item.employeeId),
          date,
          shiftId: item.isWeekOff ? null : item.shiftId ? Number(item.shiftId) : null,
          isWeekOff: Boolean(item.isWeekOff),
          notes: item.notes || null,
        },
      });
      saved.push(row);
    }
    await writeAudit(req, { action: 'ROSTER_UPDATED', entity: 'Roster', newData: { count: saved.length } });
    return ok(res, saved);
  })
);

export default router;
