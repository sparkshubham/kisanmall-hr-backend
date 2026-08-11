import prisma from '../utils/prisma.js';
import {
  combineDateAndTime,
  dateOnlyKey,
  minutesBetween,
  parseDateOnly,
  todayDateString,
  weekdayIndex,
} from '../utils/helpers.js';

export async function getSetting(key, fallback) {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export function computeShiftMetrics({ shift, checkIn, checkOut, date }) {
  if (!shift || !checkIn) {
    return {
      lateMinutes: 0,
      earlyMinutes: 0,
      workingMinutes: minutesBetween(checkIn, checkOut),
      overtimeMinutes: 0,
      status: checkOut ? 'PRESENT' : 'WORKING',
    };
  }

  const startAt = combineDateAndTime(date, shift.startTime);
  let endAt = combineDateAndTime(date, shift.endTime);
  if (endAt <= startAt) endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);

  const grace = Number(shift.graceMinutes || 0);
  const lateMs = new Date(checkIn) - startAt - grace * 60000;
  const lateMinutes = lateMs > 0 ? Math.round(lateMs / 60000) : 0;

  let earlyMinutes = 0;
  let workingMinutes = 0;
  let overtimeMinutes = 0;

  if (checkOut) {
    workingMinutes = minutesBetween(checkIn, checkOut);
    const earlyMs = endAt - new Date(checkOut);
    earlyMinutes = earlyMs > 15 * 60000 ? Math.round(earlyMs / 60000) : 0;
    const extra = minutesBetween(endAt, checkOut);
    const after = Number(shift.overtimeAfter || 0);
    overtimeMinutes = extra > after ? extra - after : 0;
  }

  let status = 'PRESENT';
  if (!checkOut) status = 'WORKING';
  else if (lateMinutes > 0) status = 'LATE';
  else if (workingMinutes > 0 && workingMinutes < 240) status = 'HALF_DAY';

  return { lateMinutes, earlyMinutes, workingMinutes, overtimeMinutes, status };
}

export async function resolveShiftForDate(employee, date) {
  const dateObj = parseDateOnly(date);
  const roster = await prisma.roster.findUnique({
    where: {
      employeeId_date: { employeeId: employee.id, date: dateObj },
    },
    include: { shift: true },
  });

  if (roster?.isWeekOff) return { weekOff: true, shift: null, roster };
  if (roster?.shift) return { weekOff: false, shift: roster.shift, roster };

  const shift = employee.shift || (employee.shiftId
    ? await prisma.shift.findUnique({ where: { id: employee.shiftId } })
    : null);

  if (shift?.workingDays) {
    const days = Array.isArray(shift.workingDays) ? shift.workingDays : [];
    if (days.length && !days.includes(weekdayIndex(dateObj))) {
      return { weekOff: true, shift, roster: null };
    }
  }

  return { weekOff: false, shift, roster: null };
}

export async function markAttendance({
  employee,
  kind,
  faceVerified = false,
  faceConfidence = null,
  ipAddress,
  deviceId,
  locationId,
}) {
  const dateKey = todayDateString();
  const date = parseDateOnly(dateKey);
  const now = new Date();

  if (employee.status !== 'ACTIVE') {
    const err = new Error('Employee is not active');
    err.status = 400;
    throw err;
  }

  const approvedLeave = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: employee.id,
      status: 'APPROVED',
      fromDate: { lte: date },
      toDate: { gte: date },
    },
  });
  if (approvedLeave) {
    const err = new Error('Employee is on approved leave today');
    err.status = 400;
    throw err;
  }

  const { weekOff, shift } = await resolveShiftForDate(employee, date);
  if (weekOff) {
    const err = new Error('Today is a week off for this employee');
    err.status = 400;
    throw err;
  }

  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: employee.id, date } },
  });

  if (kind === 'check-in') {
    if (existing?.checkIn) {
      const err = new Error(
        `Employee already checked in today at ${new Date(existing.checkIn).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata',
        })}`
      );
      err.status = 409;
      throw err;
    }

    const metrics = computeShiftMetrics({ shift, checkIn: now, date });
    const row = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: employee.id, date } },
      update: {
        checkIn: now,
        shiftId: shift?.id || employee.shiftId || null,
        locationId: locationId || employee.locationId || null,
        lateMinutes: metrics.lateMinutes,
        status: metrics.lateMinutes > 0 ? 'LATE' : 'WORKING',
        faceVerified,
        faceConfidence,
        ipAddress,
        deviceId,
      },
      create: {
        employeeId: employee.id,
        date,
        checkIn: now,
        shiftId: shift?.id || employee.shiftId || null,
        locationId: locationId || employee.locationId || null,
        lateMinutes: metrics.lateMinutes,
        status: metrics.lateMinutes > 0 ? 'LATE' : 'WORKING',
        faceVerified,
        faceConfidence,
        ipAddress,
        deviceId,
      },
    });

    await prisma.attendanceLog.create({
      data: {
        attendanceId: row.id,
        action: 'CHECK_IN',
        ipAddress,
        deviceId,
        faceVerified,
        meta: { confidence: faceConfidence, lateMinutes: metrics.lateMinutes },
      },
    });

    return { attendance: row, action: 'CHECK_IN', metrics };
  }

  if (!existing?.checkIn) {
    const err = new Error('Check-in record not found');
    err.status = 400;
    throw err;
  }
  if (existing.checkOut) {
    const err = new Error('Employee already checked out today');
    err.status = 409;
    throw err;
  }

  const metrics = computeShiftMetrics({
    shift: shift || existing.shift,
    checkIn: existing.checkIn,
    checkOut: now,
    date,
  });

  const row = await prisma.attendance.update({
    where: { id: existing.id },
    data: {
      checkOut: now,
      workingMinutes: metrics.workingMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      earlyMinutes: metrics.earlyMinutes,
      lateMinutes: metrics.lateMinutes,
      status: metrics.lateMinutes > 0 ? 'LATE' : 'PRESENT',
      faceVerified: existing.faceVerified || faceVerified,
      faceConfidence: faceConfidence ?? existing.faceConfidence,
      ipAddress,
      deviceId,
    },
  });

  await prisma.attendanceLog.create({
    data: {
      attendanceId: row.id,
      action: 'CHECK_OUT',
      ipAddress,
      deviceId,
      faceVerified,
      meta: { confidence: faceConfidence },
    },
  });

  return { attendance: row, action: 'CHECK_OUT', metrics };
}

export function displayStatus(row) {
  if (!row) return 'ABSENT';
  if (row.status === 'LEAVE' || row.status === 'HOLIDAY' || row.status === 'WEEK_OFF' || row.status === 'ON_DUTY') {
    return row.status;
  }
  if (row.checkIn && !row.checkOut) return 'WORKING';
  return row.status;
}

export async function ensureDailyAbsents(date = todayDateString()) {
  const dateObj = parseDateOnly(date);
  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    include: { shift: true },
  });

  for (const employee of employees) {
    const existing = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: dateObj } },
    });
    if (existing) continue;

    const leave = await prisma.leaveRequest.findFirst({
      where: {
        employeeId: employee.id,
        status: 'APPROVED',
        fromDate: { lte: dateObj },
        toDate: { gte: dateObj },
      },
    });

    const { weekOff } = await resolveShiftForDate(employee, dateObj);
    const status = leave ? 'LEAVE' : weekOff ? 'WEEK_OFF' : 'ABSENT';

    await prisma.attendance.create({
      data: {
        employeeId: employee.id,
        date: dateObj,
        shiftId: employee.shiftId,
        locationId: employee.locationId,
        status,
      },
    });
  }
}
