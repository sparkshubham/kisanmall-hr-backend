import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import prisma from '../../utils/prisma.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ADMIN_ROLES, HR_ROLES, fullName, parseDateOnly } from '../../utils/helpers.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { fail, ok } from '../../utils/response.js';
import { writeAudit, notify } from '../../utils/auditLog.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { findDuplicate, normalizeEmbedding } from '../../services/faceService.js';
import { env } from '../../config/env.js';

const router = Router();
router.use(authenticate, requireRole(...ADMIN_ROLES));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = env.isVercel ? '/tmp/uploads' : path.join(__dirname, '../../../../uploads');
fs.mkdirSync(uploadRoot, { recursive: true });

const upload = multer({
  dest: uploadRoot,
  limits: { fileSize: 8 * 1024 * 1024 },
});

const employeeInclude = {
  user: { select: { id: true, role: true, isActive: true, mobile: true, email: true } },
  department: true,
  designation: true,
  location: true,
  shift: true,
  face: { select: { id: true, registeredAt: true, status: true } },
  reportingManager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
};

async function managerScope(req) {
  if (req.user.role !== 'MANAGER') return {};
  const me = await prisma.employee.findUnique({ where: { userId: req.user.id } });
  if (!me) return { id: -1 };
  return { OR: [{ reportingManagerId: me.id }, { id: me.id }] };
}

function nextCodeGuess(last) {
  if (!last) return 'KM001';
  const num = Number(String(last.employeeCode).replace(/\D/g, '')) + 1;
  return `KM${String(num).padStart(3, '0')}`;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, skip } = parsePagination(req.query, { defaultSize: 25, maxSize: 200 });
    const scope = await managerScope(req);
    const where = {
      ...scope,
      ...(req.query.departmentId ? { departmentId: Number(req.query.departmentId) } : {}),
      ...(req.query.locationId ? { locationId: Number(req.query.locationId) } : {}),
      ...(req.query.shiftId ? { shiftId: Number(req.query.shiftId) } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.face === '1' ? { face: { isNot: null } } : {}),
      ...(req.query.face === '0' ? { face: { is: null } } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { employeeCode: { contains: q, mode: 'insensitive' } },
              { mobile: { contains: q } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: { employeeCode: 'asc' },
        skip,
        take: pageSize,
      }),
    ]);

    res.json(paginated(rows, total, page, pageSize));
  })
);

router.get(
  '/next-code',
  asyncHandler(async (_req, res) => {
    const last = await prisma.employee.findFirst({ orderBy: { id: 'desc' } });
    res.json({ code: nextCodeGuess(last) });
  })
);

router.post(
  '/',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const b = req.body;
    if (!b.firstName || !b.mobile || !b.password) {
      return fail(res, 'First name, mobile and password are required', 400);
    }

    const mobile = String(b.mobile).trim();
    const existing = await prisma.user.findUnique({ where: { mobile } });
    if (existing) return fail(res, 'Mobile number already registered', 409);

    const last = await prisma.employee.findFirst({ orderBy: { id: 'desc' } });
    const employeeCode = (b.employeeCode || nextCodeGuess(last)).trim();
    const name = `${b.firstName} ${b.lastName || ''}`.trim();
    const role = ['MANAGER', 'HR_ADMIN', 'SUPER_ADMIN', 'STAFF'].includes(b.role) ? b.role : 'STAFF';

    const user = await prisma.user.create({
      data: {
        name,
        mobile,
        email: b.email || null,
        passwordHash: await bcrypt.hash(b.password, 10),
        role,
      },
    });

    const employee = await prisma.employee.create({
      data: {
        employeeCode,
        userId: user.id,
        firstName: b.firstName.trim(),
        lastName: (b.lastName || '').trim(),
        mobile,
        email: b.email || null,
        dateOfBirth: b.dateOfBirth ? parseDateOnly(b.dateOfBirth) : null,
        gender: b.gender || null,
        address: b.address || null,
        emergencyContact: b.emergencyContact || null,
        joiningDate: b.joiningDate ? parseDateOnly(b.joiningDate) : new Date(),
        departmentId: b.departmentId ? Number(b.departmentId) : null,
        designationId: b.designationId ? Number(b.designationId) : null,
        locationId: b.locationId ? Number(b.locationId) : null,
        reportingManagerId: b.reportingManagerId ? Number(b.reportingManagerId) : null,
        shiftId: b.shiftId ? Number(b.shiftId) : null,
        employeeType: b.employeeType || 'FULL_TIME',
        status: b.status || 'ACTIVE',
        basicSalary: b.basicSalary ?? 0,
        allowances: b.allowances ?? 0,
        deductions: b.deductions ?? 0,
        overtimeRate: b.overtimeRate ?? 0,
        salaryType: b.salaryType || 'MONTHLY',
        bankName: b.bankName || null,
        bankAccount: b.bankAccount || null,
        bankIfsc: b.bankIfsc || null,
      },
      include: employeeInclude,
    });

    const year = new Date().getFullYear();
    const types = await prisma.leaveType.findMany({ where: { isActive: true } });
    if (types.length) {
      await prisma.leaveBalance.createMany({
        data: types.map((t) => ({
          employeeId: employee.id,
          leaveTypeId: t.id,
          year,
          entitled: t.annualQuota,
          used: 0,
        })),
        skipDuplicates: true,
      });
    }

    await writeAudit(req, {
      action: 'EMPLOYEE_CREATED',
      entity: 'Employee',
      entityId: employee.id,
      newData: { employeeCode, name, mobile },
    });

    return ok(res, employee, 201);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const employee = await prisma.employee.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        ...employeeInclude,
        leaveBalances: { include: { leaveType: true } },
        documents: { orderBy: { createdAt: 'desc' } },
        tasks: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!employee) return fail(res, 'Employee not found', 404);

    const [attendance, leaves] = await Promise.all([
      prisma.attendance.findMany({
        where: { employeeId: employee.id },
        orderBy: { date: 'desc' },
        take: 40,
        include: { shift: true, location: true },
      }),
      prisma.leaveRequest.findMany({
        where: { employeeId: employee.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { leaveType: true },
      }),
    ]);

    return ok(res, { ...employee, attendance, leaves });
  })
);

router.patch(
  '/:id',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const prev = await prisma.employee.findUnique({ where: { id }, include: { user: true } });
    if (!prev) return fail(res, 'Employee not found', 404);

    const b = req.body;
    const data = {};
    const fields = [
      'firstName',
      'lastName',
      'email',
      'gender',
      'address',
      'emergencyContact',
      'employeeType',
      'status',
      'salaryType',
      'bankName',
      'bankAccount',
      'bankIfsc',
    ];
    fields.forEach((k) => {
      if (b[k] !== undefined) data[k] = b[k];
    });
    ['departmentId', 'designationId', 'locationId', 'reportingManagerId', 'shiftId'].forEach((k) => {
      if (b[k] !== undefined) data[k] = b[k] ? Number(b[k]) : null;
    });
    ['basicSalary', 'allowances', 'deductions', 'overtimeRate'].forEach((k) => {
      if (b[k] !== undefined) data[k] = b[k];
    });
    if (b.dateOfBirth !== undefined) data.dateOfBirth = b.dateOfBirth ? parseDateOnly(b.dateOfBirth) : null;
    if (b.joiningDate !== undefined) data.joiningDate = b.joiningDate ? parseDateOnly(b.joiningDate) : undefined;
    if (b.mobile) data.mobile = String(b.mobile).trim();
    if (b.employeeCode) data.employeeCode = b.employeeCode.trim();

    const employee = await prisma.employee.update({
      where: { id },
      data,
      include: employeeInclude,
    });

    const userData = {};
    if (b.firstName || b.lastName) userData.name = fullName(employee);
    if (b.mobile) userData.mobile = String(b.mobile).trim();
    if (b.email !== undefined) userData.email = b.email || null;
    if (b.role) userData.role = b.role;
    if (b.status) userData.isActive = b.status === 'ACTIVE';
    if (b.password) userData.passwordHash = await bcrypt.hash(b.password, 10);
    if (Object.keys(userData).length) {
      await prisma.user.update({ where: { id: prev.userId }, data: userData });
    }

    if (b.shiftId && Number(b.shiftId) !== prev.shiftId) {
      await notify(prev.userId, {
        title: 'Shift changed',
        body: 'Your assigned shift has been updated.',
        type: 'SHIFT_CHANGED',
        actorId: req.user.id,
      });
    }

    await writeAudit(req, {
      action: 'EMPLOYEE_UPDATED',
      entity: 'Employee',
      entityId: id,
      oldData: { status: prev.status, shiftId: prev.shiftId },
      newData: data,
    });

    return ok(res, employee);
  })
);

router.delete(
  '/:id',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const prev = await prisma.employee.findUnique({ where: { id } });
    if (!prev) return fail(res, 'Employee not found', 404);

    const employee = await prisma.employee.update({
      where: { id },
      data: { status: 'INACTIVE' },
      include: employeeInclude,
    });
    await prisma.user.update({
      where: { id: prev.userId },
      data: { isActive: false },
    });
    await writeAudit(req, {
      action: 'EMPLOYEE_DEACTIVATED',
      entity: 'Employee',
      entityId: id,
      oldData: { status: prev.status },
    });
    return ok(res, employee);
  })
);

router.post(
  '/:id/register-face',
  requireRole(...HR_ROLES),
  asyncHandler(async (req, res) => {
    const employeeId = Number(req.params.id);
    const embedding = normalizeEmbedding(req.body.embedding);
    if (!embedding) return fail(res, 'Valid face embedding is required', 400);

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return fail(res, 'Employee not found', 404);

    const all = await prisma.faceRegistration.findMany({ where: { status: 'ACTIVE' } });
    const dup = findDuplicate(embedding, all, employeeId);
    if (dup) {
      return fail(res, 'This face is already registered to another employee', 409, {
        employeeId: dup.registration.employeeId,
        distance: dup.distance,
      });
    }

    const row = await prisma.faceRegistration.upsert({
      where: { employeeId },
      update: {
        embedding,
        modelVersion: req.body.modelVersion || 'face-api-ssd-128',
        status: 'ACTIVE',
        registeredById: req.user.id,
        registeredAt: new Date(),
      },
      create: {
        employeeId,
        embedding,
        modelVersion: req.body.modelVersion || 'face-api-ssd-128',
        registeredById: req.user.id,
      },
    });

    await writeAudit(req, {
      action: 'FACE_REGISTERED',
      entity: 'FaceRegistration',
      entityId: row.id,
      newData: { employeeId },
    });

    return ok(res, { id: row.id, employeeId, status: row.status, registeredAt: row.registeredAt });
  })
);

router.post(
  '/:id/documents',
  requireRole(...HR_ROLES),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const employeeId = Number(req.params.id);
    if (!req.file) return fail(res, 'File is required', 400);
    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId,
        type: req.body.type || 'OTHER',
        title: req.body.title || req.file.originalname,
        fileUrl: `/uploads/${req.file.filename}`,
        uploadedById: req.user.id,
      },
    });
    await writeAudit(req, { action: 'DOCUMENT_UPLOADED', entity: 'EmployeeDocument', entityId: doc.id });
    return ok(res, doc, 201);
  })
);

export default router;
