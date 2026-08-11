import { Router } from 'express';
import prisma from '../../utils/prisma.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ADMIN_ROLES, parseDateOnly, todayDateString } from '../../utils/helpers.js';
import { displayStatus } from '../../services/attendanceService.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate, requireRole(...ADMIN_ROLES));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const dateKey = req.query.date || todayDateString();
    const date = parseDateOnly(dateKey);

    const [totalStaff, attendance, activities, pendingLeaves, pendingCorrections, recentEmployees] =
      await Promise.all([
        prisma.employee.count({ where: { status: 'ACTIVE' } }),
        prisma.attendance.findMany({
          where: { date },
          include: {
            employee: {
              include: {
                department: true,
                shift: true,
                location: true,
              },
            },
            shift: true,
          },
          orderBy: { checkIn: 'asc' },
        }),
        prisma.auditLog.findMany({
          take: 12,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, role: true } } },
        }),
        prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
        prisma.attendanceCorrection.count({ where: { status: 'PENDING' } }),
        prisma.employee.findMany({
          take: 8,
          orderBy: { createdAt: 'desc' },
          include: { department: true, shift: true, face: true },
        }),
      ]);

    const present = attendance.filter((a) =>
      ['PRESENT', 'LATE', 'WORKING', 'HALF_DAY', 'ON_DUTY'].includes(a.status) || a.checkIn
    ).length;
    const absent = attendance.filter((a) => a.status === 'ABSENT').length;
    const onLeave = attendance.filter((a) => a.status === 'LEAVE').length;
    const late = attendance.filter((a) => a.status === 'LATE' || a.lateMinutes > 0).length;
    const unmarked = Math.max(0, totalStaff - attendance.length);
    const absentTotal = absent + unmarked;

    const trend = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(date);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayRows = await prisma.attendance.findMany({ where: { date: d } });
      trend.push({
        date: key,
        label: d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
        present: dayRows.filter((a) => a.checkIn || ['PRESENT', 'LATE', 'WORKING'].includes(a.status)).length,
        absent: dayRows.filter((a) => a.status === 'ABSENT').length,
        leave: dayRows.filter((a) => a.status === 'LEAVE').length,
      });
    }

    const locationWise = await prisma.location.findMany({
      where: { isActive: true },
      include: { _count: { select: { employees: true } } },
    });

    const locationStats = locationWise.map((loc) => {
      const rows = attendance.filter((a) => a.locationId === loc.id || a.employee?.locationId === loc.id);
      return {
        id: loc.id,
        name: loc.name,
        staff: loc._count.employees,
        present: rows.filter((a) => a.checkIn).length,
      };
    });

    res.json({
      date: dateKey,
      totals: {
        totalStaff,
        present,
        absent: absentTotal,
        onLeave,
        late,
        pendingLeaves,
        pendingCorrections,
        presentPct: totalStaff ? Math.round((present / totalStaff) * 100) : 0,
        absentPct: totalStaff ? Math.round((absentTotal / totalStaff) * 100) : 0,
        leavePct: totalStaff ? Math.round((onLeave / totalStaff) * 100) : 0,
      },
      donut: { present, absent: absentTotal, leave: onLeave },
      trend,
      locationStats,
      liveAttendance: attendance
        .filter((a) => a.checkIn)
        .map((a) => ({
          ...a,
          displayStatus: displayStatus(a),
        })),
      activities,
      recentEmployees,
    });
  })
);

export default router;
