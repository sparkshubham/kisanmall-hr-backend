import { Router } from 'express';
import prisma from '../../utils/prisma.js';
import { authenticate, attachEmployee } from '../../middleware/auth.js';
import { parseDateOnly } from '../../utils/helpers.js';
import { fail, ok } from '../../utils/response.js';
import { writeAudit } from '../../utils/auditLog.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate, attachEmployee);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows, balances, types] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: { employeeId: req.employee.id },
        include: { leaveType: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.leaveBalance.findMany({
        where: { employeeId: req.employee.id, year: new Date().getFullYear() },
        include: { leaveType: true },
      }),
      prisma.leaveType.findMany({ where: { isActive: true } }),
    ]);
    res.json({
      rows,
      balances: balances.map((b) => ({ ...b, available: Math.max(0, b.entitled - b.used) })),
      types,
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { leaveTypeId, fromDate, toDate, reason } = req.body;
    if (!leaveTypeId || !fromDate || !toDate || !reason) {
      return fail(res, 'Leave type, dates and reason are required', 400);
    }
    const from = parseDateOnly(fromDate);
    const to = parseDateOnly(toDate);
    if (to < from) return fail(res, 'To date cannot be before from date', 400);
    const days = Math.round((to - from) / 86400000) + 1;
    const year = from.getUTCFullYear();
    const type = await prisma.leaveType.findUnique({ where: { id: Number(leaveTypeId) } });
    if (!type) return fail(res, 'Invalid leave type', 400);

    const balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: req.employee.id,
          leaveTypeId: type.id,
          year,
        },
      },
    });
    const available = balance ? balance.entitled - balance.used : type.annualQuota;
    if (type.code !== 'UNPAID' && days > available) {
      return fail(res, `Only ${available} ${type.name} day(s) available`, 400);
    }

    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        employeeId: req.employee.id,
        status: { in: ['PENDING', 'APPROVED'] },
        fromDate: { lte: to },
        toDate: { gte: from },
      },
    });
    if (overlap) return fail(res, 'Leave already applied for these dates', 409);

    const row = await prisma.leaveRequest.create({
      data: {
        employeeId: req.employee.id,
        leaveTypeId: type.id,
        fromDate: from,
        toDate: to,
        days,
        reason,
        attachmentUrl: req.body.attachmentUrl || null,
      },
      include: { leaveType: true },
    });

    await writeAudit(req, { action: 'LEAVE_APPLIED', entity: 'LeaveRequest', entityId: row.id });
    return ok(res, row, 201);
  })
);

export default router;
