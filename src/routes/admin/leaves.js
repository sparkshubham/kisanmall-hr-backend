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
  '/types',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.leaveType.findMany({ orderBy: { name: 'asc' } });
    res.json({ rows });
  })
);

router.post(
  '/types',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const { name, code, annualQuota, isPaid } = req.body;
    if (!name || !code) return fail(res, 'Name and code are required', 400);
    const row = await prisma.leaveType.create({
      data: {
        name: name.trim(),
        code: String(code).trim().toUpperCase(),
        annualQuota: Number(annualQuota || 0),
        isPaid: isPaid !== false,
      },
    });
    return ok(res, row, 201);
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, skip } = parsePagination(req.query);
    const where = {
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(q
        ? {
            employee: {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { employeeCode: { contains: q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.leaveRequest.count({ where }),
      prisma.leaveRequest.findMany({
        where,
        include: { employee: { include: { department: true } }, leaveType: true, reviewedBy: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);
    res.json(paginated(rows, total, page, pageSize));
  })
);

router.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true, leaveType: true },
    });
    if (!row) return fail(res, 'Leave request not found', 404);
    if (row.status !== 'PENDING') return fail(res, 'Leave already reviewed', 400);

    const year = new Date(row.fromDate).getUTCFullYear();
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id },
        data: { status: 'APPROVED', reviewedById: req.user.id, reviewedAt: new Date() },
      });
      await tx.leaveBalance.upsert({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: row.employeeId,
            leaveTypeId: row.leaveTypeId,
            year,
          },
        },
        update: { used: { increment: row.days } },
        create: {
          employeeId: row.employeeId,
          leaveTypeId: row.leaveTypeId,
          year,
          entitled: row.leaveType.annualQuota,
          used: row.days,
        },
      });

      for (let d = new Date(row.fromDate); d <= row.toDate; d = new Date(d.getTime() + 86400000)) {
        await tx.attendance.upsert({
          where: { employeeId_date: { employeeId: row.employeeId, date: d } },
          update: { status: 'LEAVE' },
          create: { employeeId: row.employeeId, date: d, status: 'LEAVE', locationId: row.employee.locationId },
        });
      }
    });

    await notify(row.employee.userId, {
      title: 'Leave approved',
      body: `${row.leaveType.name} from ${row.fromDate.toISOString().slice(0, 10)} was approved.`,
      type: 'LEAVE_APPROVED',
      actorId: req.user.id,
    });
    await writeAudit(req, { action: 'LEAVE_APPROVED', entity: 'LeaveRequest', entityId: id });
    return ok(res, { id, status: 'APPROVED' });
  })
);

router.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const rejectionReason = req.body.rejectionReason || req.body.reason;
    if (!rejectionReason) return fail(res, 'Rejection reason is required', 400);

    const row = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason,
        reviewedById: req.user.id,
        reviewedAt: new Date(),
      },
      include: { employee: true, leaveType: true },
    });

    await notify(row.employee.userId, {
      title: 'Leave rejected',
      body: rejectionReason,
      type: 'LEAVE_REJECTED',
      actorId: req.user.id,
    });
    await writeAudit(req, {
      action: 'LEAVE_REJECTED',
      entity: 'LeaveRequest',
      entityId: id,
      reason: rejectionReason,
    });
    return ok(res, row);
  })
);

router.get(
  '/balance/:employeeId',
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const rows = await prisma.leaveBalance.findMany({
      where: { employeeId: Number(req.params.employeeId), year },
      include: { leaveType: true },
    });
    res.json({
      rows: rows.map((r) => ({
        ...r,
        available: Math.max(0, r.entitled - r.used),
      })),
    });
  })
);

export default router;
