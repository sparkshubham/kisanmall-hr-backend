import { Router } from 'express';
import prisma from '../../utils/prisma.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ADMIN_ROLES, HR_ROLES, parseDateOnly, todayDateString } from '../../utils/helpers.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { fail, ok } from '../../utils/response.js';
import { writeAudit, notify } from '../../utils/auditLog.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { displayStatus, ensureDailyAbsents } from '../../services/attendanceService.js';

const router = Router();
router.use(authenticate, requireRole(...ADMIN_ROLES));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, skip } = parsePagination(req.query, { defaultSize: 50, maxSize: 300 });
    const date = parseDateOnly(req.query.date || todayDateString());
    const where = {
      date,
      ...(req.query.locationId ? { locationId: Number(req.query.locationId) } : {}),
      ...(req.query.shiftId ? { shiftId: Number(req.query.shiftId) } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.departmentId
        ? { employee: { departmentId: Number(req.query.departmentId) } }
        : {}),
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
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        include: {
          employee: { include: { department: true, location: true } },
          shift: true,
          location: true,
        },
        orderBy: [{ checkIn: 'asc' }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
    ]);

    res.json(
      paginated(
        rows.map((r) => ({ ...r, displayStatus: displayStatus(r) })),
        total,
        page,
        pageSize
      )
    );
  })
);

router.get(
  '/live',
  asyncHandler(async (req, res) => {
    const date = parseDateOnly(req.query.date || todayDateString());
    const rows = await prisma.attendance.findMany({
      where: { date, checkIn: { not: null }, checkOut: null },
      include: {
        employee: { include: { department: true } },
        shift: true,
      },
      orderBy: { checkIn: 'asc' },
    });
    res.json({ rows: rows.map((r) => ({ ...r, displayStatus: 'WORKING' })), refreshedAt: new Date() });
  })
);

router.get(
  '/history/:employeeId',
  asyncHandler(async (req, res) => {
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();
    const start = parseDateOnly(`${year}-${String(month).padStart(2, '0')}-01`);
    const end = new Date(Date.UTC(year, month, 0));
    const rows = await prisma.attendance.findMany({
      where: {
        employeeId: Number(req.params.employeeId),
        date: { gte: start, lte: end },
      },
      include: { shift: true, location: true },
      orderBy: { date: 'desc' },
    });
    res.json({ rows, month, year });
  })
);

router.post(
  '/close-day',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const date = req.query.date || todayDateString();
    await ensureDailyAbsents(date);
    await writeAudit(req, { action: 'ATTENDANCE_DAY_CLOSED', entity: 'Attendance', reason: date });
    return ok(res, { date, closed: true });
  })
);

router.get(
  '/corrections',
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip } = parsePagination(req.query);
    const where = req.query.status ? { status: String(req.query.status) } : {};
    const [total, rows] = await Promise.all([
      prisma.attendanceCorrection.count({ where }),
      prisma.attendanceCorrection.findMany({
        where,
        include: { employee: true, reviewedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);
    res.json(paginated(rows, total, page, pageSize));
  })
);

router.post(
  '/corrections/:id/review',
  requireRole(...HR_ROLES, 'MANAGER'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { status, rejectionReason } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(status)) return fail(res, 'Invalid status', 400);

    const row = await prisma.attendanceCorrection.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!row) return fail(res, 'Request not found', 404);

    if (status === 'APPROVED') {
      const date = row.date;
      const existing = await prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId: row.employeeId, date } },
      });
      if (existing) {
        await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            checkIn: row.requestedCheckIn || existing.checkIn,
            checkOut: row.requestedCheckOut || existing.checkOut,
            notes: `Corrected: ${row.reason}`,
          },
        });
      } else {
        await prisma.attendance.create({
          data: {
            employeeId: row.employeeId,
            date,
            checkIn: row.requestedCheckIn,
            checkOut: row.requestedCheckOut,
            status: 'PRESENT',
            notes: `Corrected: ${row.reason}`,
          },
        });
      }
    }

    const updated = await prisma.attendanceCorrection.update({
      where: { id },
      data: {
        status,
        rejectionReason: status === 'REJECTED' ? rejectionReason || 'Rejected' : null,
        reviewedById: req.user.id,
        reviewedAt: new Date(),
      },
    });

    await notify(row.employee.userId, {
      title: `Attendance correction ${status.toLowerCase()}`,
      body: status === 'REJECTED' ? rejectionReason || 'Rejected' : 'Your attendance was updated.',
      type: 'ATTENDANCE_CORRECTION',
      actorId: req.user.id,
    });
    await writeAudit(req, {
      action: 'ATTENDANCE_CORRECTED',
      entity: 'AttendanceCorrection',
      entityId: id,
      reason: rejectionReason,
      newData: { status },
    });

    return ok(res, updated);
  })
);

export default router;
