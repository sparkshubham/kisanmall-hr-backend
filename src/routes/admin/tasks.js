import { Router } from 'express';
import prisma from '../../utils/prisma.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ADMIN_ROLES, parseDateOnly } from '../../utils/helpers.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { fail, ok } from '../../utils/response.js';
import { writeAudit, notify } from '../../utils/auditLog.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate, requireRole(...ADMIN_ROLES));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, skip } = parsePagination(req.query);
    const where = {
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.employeeId ? { employeeId: Number(req.query.employeeId) } : {}),
      ...(req.query.departmentId ? { departmentId: Number(req.query.departmentId) } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        include: {
          employee: true,
          department: true,
          location: true,
          assignedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        skip,
        take: pageSize,
      }),
    ]);
    res.json(paginated(rows, total, page, pageSize));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { title, employeeId } = req.body;
    if (!title || !employeeId) return fail(res, 'Title and employee are required', 400);
    const row = await prisma.task.create({
      data: {
        title: title.trim(),
        description: req.body.description || null,
        employeeId: Number(employeeId),
        departmentId: req.body.departmentId ? Number(req.body.departmentId) : null,
        locationId: req.body.locationId ? Number(req.body.locationId) : null,
        priority: req.body.priority || 'MEDIUM',
        dueDate: req.body.dueDate ? parseDateOnly(req.body.dueDate) : null,
        assignedById: req.user.id,
      },
      include: { employee: true },
    });
    await notify(row.employee.userId, {
      title: 'New task assigned',
      body: row.title,
      type: 'TASK_ASSIGNED',
      actorId: req.user.id,
    });
    await writeAudit(req, { action: 'TASK_CREATED', entity: 'Task', entityId: row.id, newData: { title } });
    return ok(res, row, 201);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = {};
    ['title', 'description', 'priority', 'status'].forEach((k) => {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    });
    if (req.body.employeeId !== undefined) data.employeeId = Number(req.body.employeeId);
    if (req.body.dueDate !== undefined) data.dueDate = req.body.dueDate ? parseDateOnly(req.body.dueDate) : null;
    const row = await prisma.task.update({ where: { id }, data, include: { employee: true } });
    if (data.status === 'COMPLETED') {
      await writeAudit(req, { action: 'TASK_COMPLETED', entity: 'Task', entityId: id });
    } else {
      await writeAudit(req, { action: 'TASK_UPDATED', entity: 'Task', entityId: id, newData: data });
    }
    return ok(res, row);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.task.delete({ where: { id } });
    await writeAudit(req, { action: 'TASK_DELETED', entity: 'Task', entityId: id });
    return ok(res, { id, deleted: true });
  })
);

export default router;
