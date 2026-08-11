import { Router } from 'express';
import prisma from '../../utils/prisma.js';
import { authenticate, attachEmployee } from '../../middleware/auth.js';
import { parseDateOnly, todayDateString } from '../../utils/helpers.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { displayStatus, resolveShiftForDate } from '../../services/attendanceService.js';

const router = Router();
router.use(authenticate, attachEmployee);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const employee = req.employee;
    const date = parseDateOnly(todayDateString());
    const { shift, weekOff } = await resolveShiftForDate(employee, date);

    const [today, balances, tasks, notifications, pendingCorrections] = await Promise.all([
      prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId: employee.id, date } },
      }),
      prisma.leaveBalance.findMany({
        where: { employeeId: employee.id, year: date.getUTCFullYear() },
        include: { leaveType: true },
      }),
      prisma.task.findMany({
        where: { employeeId: employee.id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      prisma.attendanceCorrection.count({
        where: { employeeId: employee.id, status: 'PENDING' },
      }),
    ]);

    res.json({
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        firstName: employee.firstName,
        lastName: employee.lastName,
        photoUrl: employee.photoUrl,
        department: employee.department,
        designation: employee.designation,
        location: employee.location,
        faceRegistered: Boolean(employee.face && employee.face.status === 'ACTIVE'),
      },
      shift,
      weekOff,
      today: today ? { ...today, displayStatus: displayStatus(today) } : null,
      leaveBalances: balances.map((b) => ({
        ...b,
        available: Math.max(0, b.entitled - b.used),
      })),
      tasks,
      notifications,
      pendingCorrections,
    });
  })
);

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const employee = await prisma.employee.findUnique({
      where: { id: req.employee.id },
      include: {
        department: true,
        designation: true,
        location: true,
        shift: true,
        face: { select: { id: true, status: true, registeredAt: true } },
        reportingManager: { select: { firstName: true, lastName: true, employeeCode: true } },
      },
    });
    res.json({ employee });
  })
);

router.get(
  '/schedule',
  asyncHandler(async (req, res) => {
    const from = parseDateOnly(req.query.from || todayDateString());
    const to = parseDateOnly(req.query.to || todayDateString());
    const rosters = await prisma.roster.findMany({
      where: { employeeId: req.employee.id, date: { gte: from, lte: to } },
      include: { shift: true },
      orderBy: { date: 'asc' },
    });
    res.json({ shift: req.employee.shift, rosters });
  })
);

router.patch(
  '/notifications/:id/read',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { id: Number(req.params.id), userId: req.user.id },
      data: { isRead: true },
    });
    res.json({ success: true });
  })
);

export default router;
