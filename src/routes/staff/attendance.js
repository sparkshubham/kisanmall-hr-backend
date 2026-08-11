import { Router } from 'express';
import prisma from '../../utils/prisma.js';
import { authenticate, attachEmployee } from '../../middleware/auth.js';
import { clientIp, parseDateOnly } from '../../utils/helpers.js';
import { fail, ok } from '../../utils/response.js';
import { writeAudit } from '../../utils/auditLog.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { bestMatch, normalizeEmbedding } from '../../services/faceService.js';
import { displayStatus, markAttendance } from '../../services/attendanceService.js';

const router = Router();
router.use(authenticate, attachEmployee);

async function verifyOwnFace(employee, embedding) {
  const face = await prisma.faceRegistration.findUnique({ where: { employeeId: employee.id } });
  if (!face || face.status !== 'ACTIVE') {
    const err = new Error('Face is not registered. Ask HR to register your face.');
    err.status = 400;
    throw err;
  }
  const match = bestMatch(embedding, [face]);
  if (!match?.matched) {
    const err = new Error('Face verification failed. Please try again.');
    err.status = 401;
    throw err;
  }
  return match;
}

router.post(
  '/check-in',
  asyncHandler(async (req, res) => {
    const embedding = normalizeEmbedding(req.body.embedding);
    if (!embedding) return fail(res, 'Face capture is required', 400);
    const match = await verifyOwnFace(req.employee, embedding);
    const result = await markAttendance({
      employee: req.employee,
      kind: 'check-in',
      faceVerified: true,
      faceConfidence: match.confidence,
      ipAddress: clientIp(req),
      deviceId: req.body.deviceId || req.headers['user-agent'] || null,
      locationId: req.body.locationId,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
    });
    void writeAudit(req, {
      action: 'ATTENDANCE_MARKED',
      entity: 'Attendance',
      entityId: result.attendance.id,
      newData: { action: result.action, geo: result.geo },
    });
    return ok(res, {
      ...result,
      attendance: { ...result.attendance, displayStatus: displayStatus(result.attendance) },
      employee: {
        id: req.employee.id,
        firstName: req.employee.firstName,
        lastName: req.employee.lastName,
        employeeCode: req.employee.employeeCode,
        department: req.employee.department,
        photoUrl: req.employee.photoUrl,
      },
      shift: req.employee.shift,
    });
  })
);

router.post(
  '/check-out',
  asyncHandler(async (req, res) => {
    const embedding = normalizeEmbedding(req.body.embedding);
    if (!embedding) return fail(res, 'Face capture is required', 400);
    const match = await verifyOwnFace(req.employee, embedding);
    const result = await markAttendance({
      employee: req.employee,
      kind: 'check-out',
      faceVerified: true,
      faceConfidence: match.confidence,
      ipAddress: clientIp(req),
      deviceId: req.body.deviceId || req.headers['user-agent'] || null,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
    });
    void writeAudit(req, {
      action: 'ATTENDANCE_MARKED',
      entity: 'Attendance',
      entityId: result.attendance.id,
      newData: { action: result.action, geo: result.geo },
    });
    return ok(res, {
      ...result,
      attendance: { ...result.attendance, displayStatus: displayStatus(result.attendance) },
      employee: {
        id: req.employee.id,
        firstName: req.employee.firstName,
        lastName: req.employee.lastName,
        employeeCode: req.employee.employeeCode,
        department: req.employee.department,
      },
      shift: req.employee.shift,
    });
  })
);

router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();
    const start = parseDateOnly(`${year}-${String(month).padStart(2, '0')}-01`);
    const end = new Date(Date.UTC(year, month, 0));
    const rows = await prisma.attendance.findMany({
      where: { employeeId: req.employee.id, date: { gte: start, lte: end } },
      include: { shift: true },
      orderBy: { date: 'desc' },
    });
    const present = rows.filter((r) => ['PRESENT', 'LATE', 'WORKING', 'HALF_DAY', 'ON_DUTY'].includes(r.status)).length;
    const absent = rows.filter((r) => r.status === 'ABSENT').length;
    const late = rows.filter((r) => r.status === 'LATE' || r.lateMinutes > 0).length;
    res.json({
      rows: rows.map((r) => ({ ...r, displayStatus: displayStatus(r) })),
      summary: { present, absent, late },
      month,
      year,
    });
  })
);

router.post(
  '/correction',
  asyncHandler(async (req, res) => {
    const { date, issue, reason, requestedCheckIn, requestedCheckOut } = req.body;
    if (!date || !issue || !reason) return fail(res, 'Date, issue and reason are required', 400);
    const row = await prisma.attendanceCorrection.create({
      data: {
        employeeId: req.employee.id,
        date: parseDateOnly(date),
        issue,
        reason,
        requestedCheckIn: requestedCheckIn ? new Date(requestedCheckIn) : null,
        requestedCheckOut: requestedCheckOut ? new Date(requestedCheckOut) : null,
      },
    });
    await writeAudit(req, { action: 'ATTENDANCE_CORRECTION_REQUESTED', entity: 'AttendanceCorrection', entityId: row.id });
    return ok(res, row, 201);
  })
);

export default router;
