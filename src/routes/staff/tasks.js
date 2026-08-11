import { Router } from 'express';
import prisma from '../../utils/prisma.js';
import { authenticate, attachEmployee } from '../../middleware/auth.js';
import { fail, ok } from '../../utils/response.js';
import { writeAudit } from '../../utils/auditLog.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate, attachEmployee);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await prisma.task.findMany({
      where: {
        employeeId: req.employee.id,
        ...(req.query.status ? { status: String(req.query.status) } : {}),
      },
      include: { assignedBy: { select: { name: true } }, location: true },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });
    res.json({ rows });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const task = await prisma.task.findFirst({ where: { id, employeeId: req.employee.id } });
    if (!task) return fail(res, 'Task not found', 404);
    const status = req.body.status;
    if (status && !['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
      return fail(res, 'Invalid status', 400);
    }
    const row = await prisma.task.update({
      where: { id },
      data: { status: status || task.status },
    });
    if (status === 'COMPLETED') {
      await writeAudit(req, { action: 'TASK_COMPLETED', entity: 'Task', entityId: id });
    }
    return ok(res, row);
  })
);

export default router;
