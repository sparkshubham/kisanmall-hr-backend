import { Router } from 'express';
import prisma from '../../utils/prisma.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ADMIN_ROLES, HR_ROLES } from '../../utils/helpers.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { fail, ok } from '../../utils/response.js';
import { writeAudit, notify } from '../../utils/auditLog.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { calculateEmployeePayroll, generatePayroll } from '../../services/payrollService.js';

const router = Router();
router.use(authenticate, requireRole(...ADMIN_ROLES));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();
    const { page, pageSize, q, skip } = parsePagination(req.query);
    const where = {
      month,
      year,
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
      prisma.payroll.count({ where }),
      prisma.payroll.findMany({
        where,
        include: { employee: { include: { department: true } } },
        orderBy: { id: 'asc' },
        skip,
        take: pageSize,
      }),
    ]);
    res.json({ ...paginated(rows, total, page, pageSize), month, year });
  })
);

router.post(
  '/preview/:employeeId',
  asyncHandler(async (req, res) => {
    const month = Number(req.body.month) || new Date().getMonth() + 1;
    const year = Number(req.body.year) || new Date().getFullYear();
    const employee = await prisma.employee.findUnique({ where: { id: Number(req.params.employeeId) } });
    if (!employee) return fail(res, 'Employee not found', 404);
    const calc = await calculateEmployeePayroll(employee, year, month, req.body);
    return ok(res, calc);
  })
);

router.post(
  '/generate',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const month = Number(req.body.month) || new Date().getMonth() + 1;
    const year = Number(req.body.year) || new Date().getFullYear();
    const rows = await generatePayroll(year, month, req.body.extras || {});
    const employees = await prisma.employee.findMany({
      where: { id: { in: rows.map((r) => r.employeeId) } },
    });
    await Promise.all(
      employees.map((e) =>
        notify(e.userId, {
          title: 'Payslip generated',
          body: `Salary for ${month}/${year} is ready.`,
          type: 'PAYROLL_GENERATED',
          actorId: req.user.id,
        })
      )
    );
    await writeAudit(req, { action: 'PAYROLL_GENERATED', entity: 'Payroll', newData: { month, year, count: rows.length } });
    return ok(res, { month, year, count: rows.length });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.payroll.findUnique({
      where: { id: Number(req.params.id) },
      include: { employee: { include: { department: true, designation: true, location: true } } },
    });
    if (!row) return fail(res, 'Payslip not found', 404);
    return ok(res, row);
  })
);

export default router;
