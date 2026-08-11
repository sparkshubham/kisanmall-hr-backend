import prisma from '../utils/prisma.js';
import { money, parseDateOnly } from '../utils/helpers.js';

export async function calculateEmployeePayroll(employee, year, month, extras = {}) {
  const start = parseDateOnly(`${year}-${String(month).padStart(2, '0')}-01`);
  const end = new Date(Date.UTC(year, month, 0));

  const rows = await prisma.attendance.findMany({
    where: {
      employeeId: employee.id,
      date: { gte: start, lte: end },
    },
  });

  const presentDays = rows.filter((r) =>
    ['PRESENT', 'LATE', 'WORKING', 'HALF_DAY', 'ON_DUTY'].includes(r.status)
  ).length;
  const halfDays = rows.filter((r) => r.status === 'HALF_DAY').length;
  const absentDays = rows.filter((r) => r.status === 'ABSENT').length;
  const lateDays = rows.filter((r) => r.status === 'LATE' || r.lateMinutes > 0).length;
  const paidLeaveDays = rows.filter((r) => r.status === 'LEAVE').length;
  const weekOffs = rows.filter((r) => r.status === 'WEEK_OFF' || r.status === 'HOLIDAY').length;
  const overtimeMinutes = rows.reduce((sum, r) => sum + (r.overtimeMinutes || 0), 0);
  const workingDays = presentDays + absentDays + paidLeaveDays;

  const basic = money(employee.basicSalary);
  const allowances = money(extras.allowances ?? employee.allowances);
  const overtimeHours = money(overtimeMinutes / 60);
  const overtimePay = money(overtimeHours * Number(employee.overtimeRate || 0));
  const bonus = money(extras.bonus || 0);

  const perDay = workingDays > 0 ? basic / workingDays : 0;
  const unpaidLeaveDays = Number(extras.unpaidLeaveDays || 0);
  const leaveDeduction = money(unpaidLeaveDays * perDay);
  const lateDeduction = money(extras.lateDeduction ?? lateDays * Math.min(100, perDay * 0.05));
  const otherDeduction = money(extras.otherDeduction ?? employee.deductions);

  const netSalary = money(
    basic + allowances + overtimePay + bonus - lateDeduction - leaveDeduction - otherDeduction
  );

  return {
    employeeId: employee.id,
    month,
    year,
    workingDays,
    presentDays: money(presentDays - halfDays * 0.5 + halfDays * 0.5),
    absentDays,
    paidLeaveDays,
    unpaidLeaveDays,
    lateDays,
    overtimeHours,
    basicSalary: basic,
    allowances,
    overtimePay,
    bonus,
    lateDeduction,
    leaveDeduction,
    otherDeduction,
    netSalary,
    weekOffs,
  };
}

export async function generatePayroll(year, month, extrasByEmployee = {}) {
  const employees = await prisma.employee.findMany({
    where: { status: { in: ['ACTIVE', 'RESIGNED'] } },
  });

  const results = [];
  for (const employee of employees) {
    const calc = await calculateEmployeePayroll(employee, year, month, extrasByEmployee[employee.id] || {});
    const row = await prisma.payroll.upsert({
      where: {
        employeeId_month_year: { employeeId: employee.id, month, year },
      },
      update: { ...calc, status: 'GENERATED' },
      create: { ...calc, status: 'GENERATED' },
    });
    results.push(row);
  }
  return results;
}
