import { Router } from 'express';
import XLSX from 'xlsx';
import prisma from '../../utils/prisma.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ADMIN_ROLES, parseDateOnly, todayDateString } from '../../utils/helpers.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate, requireRole(...ADMIN_ROLES));

function sendExcel(res, rows, filename) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Report');
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

function sendCsv(res, rows, filename) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(sheet);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

router.get(
  '/attendance',
  asyncHandler(async (req, res) => {
    const from = parseDateOnly(req.query.from || todayDateString());
    const to = parseDateOnly(req.query.to || todayDateString());
    const rows = await prisma.attendance.findMany({
      where: {
        date: { gte: from, lte: to },
        ...(req.query.departmentId ? { employee: { departmentId: Number(req.query.departmentId) } } : {}),
        ...(req.query.locationId ? { locationId: Number(req.query.locationId) } : {}),
        ...(req.query.employeeId ? { employeeId: Number(req.query.employeeId) } : {}),
      },
      include: { employee: { include: { department: true } }, shift: true, location: true },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });

    const mapped = rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      employee: `${r.employee.firstName} ${r.employee.lastName}`,
      code: r.employee.employeeCode,
      department: r.employee.department?.name || '',
      location: r.location?.name || '',
      shift: r.shift ? `${r.shift.startTime}–${r.shift.endTime}` : '',
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      status: r.status,
      lateMinutes: r.lateMinutes,
      workingMinutes: r.workingMinutes,
      overtimeMinutes: r.overtimeMinutes,
    }));

    if (req.query.export === 'xlsx') return sendExcel(res, mapped, 'attendance-report.xlsx');
    if (req.query.export === 'csv') return sendCsv(res, mapped, 'attendance-report.csv');
    res.json({ rows: mapped });
  })
);

router.get(
  '/employees',
  asyncHandler(async (req, res) => {
    const where = {
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.departmentId ? { departmentId: Number(req.query.departmentId) } : {}),
    };
    const rows = await prisma.employee.findMany({
      where,
      include: { department: true, designation: true, location: true, shift: true },
      orderBy: { employeeCode: 'asc' },
    });
    const mapped = rows.map((e) => ({
      code: e.employeeCode,
      name: `${e.firstName} ${e.lastName}`,
      mobile: e.mobile,
      department: e.department?.name || '',
      designation: e.designation?.name || '',
      location: e.location?.name || '',
      shift: e.shift?.name || '',
      status: e.status,
      type: e.employeeType,
      joiningDate: e.joiningDate,
    }));
    if (req.query.export === 'xlsx') return sendExcel(res, mapped, 'employees.xlsx');
    if (req.query.export === 'csv') return sendCsv(res, mapped, 'employees.csv');
    res.json({ rows: mapped });
  })
);

router.get(
  '/leave',
  asyncHandler(async (req, res) => {
    const rows = await prisma.leaveRequest.findMany({
      where: req.query.status ? { status: String(req.query.status) } : {},
      include: { employee: true, leaveType: true },
      orderBy: { createdAt: 'desc' },
    });
    const mapped = rows.map((r) => ({
      employee: `${r.employee.firstName} ${r.employee.lastName}`,
      code: r.employee.employeeCode,
      type: r.leaveType.name,
      from: r.fromDate,
      to: r.toDate,
      days: r.days,
      status: r.status,
      reason: r.reason,
    }));
    if (req.query.export === 'xlsx') return sendExcel(res, mapped, 'leave-report.xlsx');
    res.json({ rows: mapped });
  })
);

router.get(
  '/payroll',
  asyncHandler(async (req, res) => {
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();
    const rows = await prisma.payroll.findMany({
      where: { month, year },
      include: { employee: true },
    });
    const mapped = rows.map((r) => ({
      employee: `${r.employee.firstName} ${r.employee.lastName}`,
      code: r.employee.employeeCode,
      presentDays: Number(r.presentDays),
      absentDays: r.absentDays,
      basic: Number(r.basicSalary),
      allowances: Number(r.allowances),
      overtime: Number(r.overtimePay),
      deductions: Number(r.lateDeduction) + Number(r.leaveDeduction) + Number(r.otherDeduction),
      net: Number(r.netSalary),
    }));
    if (req.query.export === 'xlsx') return sendExcel(res, mapped, `payroll-${year}-${month}.xlsx`);
    res.json({ rows: mapped, month, year });
  })
);

export default router;
